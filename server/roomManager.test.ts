import { describe, expect, it } from 'bun:test';
import { GameRegistry, type GameDefinition } from './game';
import { RoomManager, type RoomBroadcaster } from './roomManager';
import { WebhookManager, verifyWebhookSignature } from './webhooks';

function createTestHarness(options?: {
  registry?: GameRegistry;
  webhooks?: WebhookManager;
}) {
  const hostMessages: unknown[] = [];
  const playerMessages = new Map<string, unknown[]>();
  const broadcastMessages: unknown[] = [];

  const broadcaster: RoomBroadcaster = {
    sendToHost(_code, msg) {
      hostMessages.push(msg);
    },
    sendToPlayer(_code, playerId, msg) {
      const list = playerMessages.get(playerId) ?? [];
      list.push(msg);
      playerMessages.set(playerId, list);
    },
    broadcastAll(_code, msg) {
      broadcastMessages.push(msg);
    },
  };

  const manager = new RoomManager(broadcaster, {
    enableTickInterval: false,
    registry: options?.registry,
    webhooks: options?.webhooks,
  });

  return { manager, hostMessages, playerMessages, broadcastMessages };
}

describe('RoomManager & GameDefinition foundation', () => {
  it('runs a custom game lifecycle LOBBY -> PLAYING -> ENDED -> LOBBY', () => {
    const registry = new GameRegistry();
    const tapGame: GameDefinition<
      { taps: Record<string, number> },
      { taps: Record<string, number> },
      { myTaps: number }
    > = {
      id: 'tap-race',
      name: 'Tap Race',
      minPlayers: 2,
      maxPlayers: 6,
      onStart() {
        return { taps: {} };
      },
      onPlayerAction(ctx, state, playerId, action) {
        if (action.type === 'tap') {
          const nextCount = (state.taps[playerId] ?? 0) + 1;
          ctx.addPlayerScore(playerId, 10);
          ctx.broadcastEvent('player_tapped', { playerId, count: nextCount });
          return { taps: { ...state.taps, [playerId]: nextCount } };
        }
        return state;
      },
      onExternalEvent(ctx, state, event, payload) {
        ctx.broadcastEvent(event, payload);
        return state;
      },
      getHostView(state) {
        return state;
      },
      getPlayerView(state, playerId) {
        return { myTaps: state.taps[playerId] ?? 0 };
      },
    };
    registry.register(tapGame);

    const { manager, broadcastMessages } = createTestHarness({ registry });
    const { room, hostToken } = manager.createRoom();

    const p1 = manager.joinRoom(room.code, 'Alice');
    const p2 = manager.joinRoom(room.code, 'Bob');
    expect(p1.ok && p2.ok).toBe(true);
    if (!p1.ok || !p2.ok) return;

    const selector = manager.openGameSelector(room.code, { playerId: p1.player.id });
    expect(selector.ok).toBe(true);
    expect(room.phase).toBe('GAME_SELECT');
    expect(manager.buildStateForClient(room).games.length).toBe(1);

    const start = manager.startGame(room.code, { playerId: p1.player.id }, { gameId: 'tap-race' });
    expect(start.ok).toBe(true);
    expect(room.phase).toBe('PLAYING');

    const act1 = manager.handleAction(
      room.code,
      { playerId: p1.player.id },
      { type: 'tap' },
      room.roundId
    );
    expect(act1.ok).toBe(true);

    const p1View = manager.buildStateForClient(room, p1.player.id);
    expect((p1View.playerState as { myTaps: number }).myTaps).toBe(1);
    expect(p1View.players.find((p) => p.id === p1.player.id)?.score).toBe(10);

    const ext = manager.handleExternalEvent(room.code, 'bonus_round', { multiplier: 2 });
    expect(ext.ok).toBe(true);
    expect(broadcastMessages.length).toBeGreaterThanOrEqual(2);

    const ended = manager.endGame(room.code, { hostToken });
    expect(ended.ok).toBe(true);
    expect(room.phase).toBe('ENDED');

    const lobby = manager.returnToLobby(room.code, { hostToken });
    expect(lobby.ok).toBe(true);
    expect(room.phase).toBe('LOBBY');
    expect(room.players.get(p1.player.id)?.score).toBe(0);

    manager.disposeRoom(room.code);
  });

  it('supports player reconnect and leave', () => {
    const { manager } = createTestHarness();
    const { room } = manager.createRoom();

    const p1 = manager.joinRoom(room.code, 'Alice');
    const p2 = manager.joinRoom(room.code, 'Bob');
    expect(p1.ok && p2.ok).toBe(true);
    if (!p1.ok || !p2.ok) return;

    manager.markPlayerDisconnected(room.code, p1.player.id);
    expect(room.players.get(p1.player.id)?.connected).toBe(false);

    const reconnected = manager.reconnectPlayer(room.code, p1.player.id);
    expect(reconnected.ok).toBe(true);
    expect(room.players.get(p1.player.id)?.connected).toBe(true);

    const left = manager.leaveRoom(room.code, p1.player.id);
    expect(left.ok).toBe(true);
    expect(room.players.has(p1.player.id)).toBe(false);
    expect(room.players.has(p2.player.id)).toBe(true);

    manager.disposeRoom(room.code);
  });

  it('prunes idle rooms past TTL', () => {
    const manager = new RoomManager(
      {
        sendToHost() {},
        sendToPlayer() {},
        broadcastAll() {},
      },
      { enableTickInterval: false, roomTtlMs: 1_000 }
    );

    const { room } = manager.createRoom();
    expect(manager.getRoom(room.code)).toBeDefined();

    expect(manager.pruneIdleRooms(room.lastActivityAt + 500)).toBe(0);
    expect(manager.getRoom(room.code)).toBeDefined();

    expect(manager.pruneIdleRooms(room.lastActivityAt + 1_500)).toBe(1);
    expect(manager.getRoom(room.code)).toBeUndefined();

    manager.dispose();
  });

  it('collects game votes and starts the most popular game when all users vote', () => {
    const registry = new GameRegistry();
    const makeGame = (id: string, name: string): GameDefinition<unknown> => ({
      id,
      name,
      minPlayers: 2,
      maxPlayers: 6,
      onStart() {
        return {};
      },
      onPlayerAction(_ctx, state) {
        return state;
      },
      getHostView(state) {
        return state;
      },
      getPlayerView(state) {
        return state;
      },
    });
    registry.register(makeGame('game-a', 'Game A'));
    registry.register(makeGame('game-b', 'Game B'));

    const { manager } = createTestHarness({ registry });
    const { room } = manager.createRoom();

    const p1 = manager.joinRoom(room.code, 'Alice');
    const p2 = manager.joinRoom(room.code, 'Bob');
    const p3 = manager.joinRoom(room.code, 'Carol');
    expect(p1.ok && p2.ok && p3.ok).toBe(true);
    if (!p1.ok || !p2.ok || !p3.ok) return;

    expect(manager.openGameSelector(room.code, { playerId: p1.player.id }).ok).toBe(true);

    const v1 = manager.voteGame(room.code, { playerId: p1.player.id }, 'game-a');
    expect(v1.ok && !v1.started).toBe(true);
    expect(room.phase).toBe('GAME_SELECT');

    const v2 = manager.voteGame(room.code, { playerId: p2.player.id }, 'game-b');
    expect(v2.ok && !v2.started).toBe(true);
    const v1Change = manager.voteGame(room.code, { playerId: p1.player.id }, 'game-b');
    expect(v1Change.ok && !v1Change.started).toBe(true);
    expect(manager.buildStateForClient(room).gameVotes).toEqual({
      [p1.player.id]: 'game-b',
      [p2.player.id]: 'game-b',
    });

    const v3 = manager.voteGame(room.code, { playerId: p3.player.id }, 'game-a');
    expect(v3.ok && v3.started).toBe(true);
    expect(room.phase).toBe('PLAYING');
    expect(room.gameId).toBe('game-b');
    expect(manager.buildStateForClient(room).gameVotes).toBeUndefined();

    manager.disposeRoom(room.code);
  });

  it('allows TV host selection to override game voting and resolves on disconnect', () => {
    const registry = new GameRegistry();
    const makeGame = (id: string): GameDefinition<unknown> => ({
      id,
      name: id,
      minPlayers: 1,
      maxPlayers: 6,
      onStart() {
        return {};
      },
      onPlayerAction(_ctx, state) {
        return state;
      },
      getHostView(state) {
        return state;
      },
      getPlayerView(state) {
        return state;
      },
    });
    registry.register(makeGame('game-a'));
    registry.register(makeGame('game-b'));

    const { manager } = createTestHarness({ registry });
    const { room, hostToken } = manager.createRoom();

    const p1 = manager.joinRoom(room.code, 'Alice');
    const p2 = manager.joinRoom(room.code, 'Bob');
    expect(p1.ok && p2.ok).toBe(true);
    if (!p1.ok || !p2.ok) return;

    manager.openGameSelector(room.code, { hostToken });
    manager.voteGame(room.code, { playerId: p1.player.id }, 'game-a');
    expect(room.phase).toBe('GAME_SELECT');

    const override = manager.startGame(room.code, { hostToken }, { gameId: 'game-b' });
    expect(override.ok).toBe(true);
    expect(room.phase).toBe('PLAYING');
    expect(room.gameId).toBe('game-b');

    manager.endGame(room.code, { hostToken });
    manager.openGameSelector(room.code, { hostToken });
    manager.voteGame(room.code, { playerId: p1.player.id }, 'game-a');
    expect(room.phase).toBe('GAME_SELECT');

    manager.markPlayerDisconnected(room.code, p2.player.id);
    expect(room.phase).toBe('PLAYING');
    expect(room.gameId).toBe('game-a');

    manager.disposeRoom(room.code);
  });
});

describe('WebhookManager', () => {
  it('signs and delivers filtered webhook events', async () => {
    const delivered: Array<{ url: string; headers: Record<string, string>; body: string }> = [];

    const webhooks = new WebhookManager({
      defaultSecret: 'super-secret',
      fetcher: async (url, init) => {
        delivered.push({
          url,
          headers: init.headers as Record<string, string>,
          body: String(init.body),
        });
        return new Response('ok', { status: 200 });
      },
    });

    webhooks.register({
      url: 'https://example.com/hook',
      events: ['room.created', 'game.started'],
    });

    await webhooks.emit('player.joined', 'ABCD', { name: 'Alice' });
    expect(delivered.length).toBe(0);

    await webhooks.emit('room.created', 'ABCD', { gameId: 'sandbox' });
    expect(delivered.length).toBe(1);
    expect(delivered[0].headers['X-Webhook-Event']).toBe('room.created');
    expect(
      verifyWebhookSignature(
        delivered[0].body,
        'super-secret',
        delivered[0].headers['X-Webhook-Signature']
      )
    ).toBe(true);
  });
});
