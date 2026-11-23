import { describe, expect, it } from 'bun:test';
import type { DrawHostView, DrawPlayerView } from '../../shared/games/draw';
import { GameRegistry } from '../game';
import { RoomManager, type RoomBroadcaster } from '../roomManager';
import { DRAW_DURATION_MS, drawGame } from './draw';

function setupDrawRoom() {
  const registry = new GameRegistry();
  registry.register(drawGame);

  const broadcaster: RoomBroadcaster = {
    sendToHost() {},
    sendToPlayer() {},
    broadcastAll() {},
  };

  const manager = new RoomManager(broadcaster, {
    enableTickInterval: false,
    registry,
  });

  const { room, hostToken } = manager.createRoom(undefined, 'draw');
  const p1 = manager.joinRoom(room.code, 'Alice');
  const p2 = manager.joinRoom(room.code, 'Bob');
  if (!p1.ok || !p2.ok) throw new Error('Failed to join players');

  manager.startGame(room.code, { hostToken }, { gameId: 'draw' });

  return { manager, room, hostToken, p1: p1.player, p2: p2.player };
}

describe('drawGame', () => {
  it('runs a full round PROMPTING -> DRAWING -> VOTING -> RESULTS -> next_round', () => {
    const { manager, room, hostToken, p1, p2 } = setupDrawRoom();

    const hostInitial = manager.buildStateForClient(room).hostState as DrawHostView;
    expect(hostInitial.phase).toBe('PROMPTING');
    expect([p1.id, p2.id]).toContain(hostInitial.prompterId);

    const prompterId = hostInitial.prompterId;
    const otherId = prompterId === p1.id ? p2.id : p1.id;

    manager.handleAction(
      room.code,
      { playerId: otherId },
      { type: 'submit_prompt', payload: { text: 'Ignored' } }
    );
    expect((manager.buildStateForClient(room).hostState as DrawHostView).phase).toBe('PROMPTING');

    manager.handleAction(
      room.code,
      { playerId: prompterId },
      { type: 'submit_prompt', payload: { text: 'Space Banana' } }
    );

    const hostDrawing = manager.buildStateForClient(room).hostState as DrawHostView;
    expect(hostDrawing.phase).toBe('DRAWING');
    expect(hostDrawing.prompt).toBe('Space Banana');
    expect(room.phaseEndsAt).not.toBeNull();
    expect((room.phaseEndsAt ?? 0) - Date.now()).toBeGreaterThan(DRAW_DURATION_MS - 2000);

    manager.handleAction(
      room.code,
      { playerId: p1.id },
      { type: 'sync_drawing', payload: { imageData: 'data:image/jpeg;base64,AAA' } }
    );
    const hostAfterSync = manager.buildStateForClient(room).hostState as DrawHostView;
    expect(hostAfterSync.entries.find((e) => e.playerId === p1.id)?.imageData).toBe(
      'data:image/jpeg;base64,AAA'
    );

    manager.handleAction(
      room.code,
      { playerId: p1.id },
      { type: 'submit_drawing', payload: { imageData: 'data:image/jpeg;base64,BBB' } }
    );
    manager.handleAction(
      room.code,
      { playerId: p2.id },
      { type: 'submit_drawing', payload: { imageData: 'data:image/jpeg;base64,CCC' } }
    );

    const hostVoting = manager.buildStateForClient(room).hostState as DrawHostView;
    expect(hostVoting.phase).toBe('VOTING');
    expect(['best', 'worst']).toContain(hostVoting.voteMode!);

    const p1Voting = manager.buildStateForClient(room, p1.id).playerState as DrawPlayerView;
    expect(p1Voting.votableEntries.map((e) => e.playerId)).toEqual([p2.id]);

    manager.handleAction(
      room.code,
      { playerId: p1.id },
      { type: 'cast_vote', payload: { targetPlayerId: p1.id } }
    );
    expect((manager.buildStateForClient(room, p1.id).playerState as DrawPlayerView).hasVoted).toBe(
      false
    );

    manager.handleAction(
      room.code,
      { playerId: p1.id },
      { type: 'cast_vote', payload: { targetPlayerId: p2.id } }
    );
    manager.handleAction(
      room.code,
      { playerId: p2.id },
      { type: 'cast_vote', payload: { targetPlayerId: p1.id } }
    );

    const hostResults = manager.buildStateForClient(room).hostState as DrawHostView;
    expect(hostResults.phase).toBe('RESULTS');
    expect(hostResults.results.every((r) => r.isWinner)).toBe(true);

    const stateAfterResults = manager.buildStateForClient(room);
    expect(stateAfterResults.players.every((p) => p.score === 2)).toBe(true);

    manager.handleAction(room.code, { hostToken }, { type: 'next_round' });
    const hostNext = manager.buildStateForClient(room).hostState as DrawHostView;
    expect(hostNext.phase).toBe('PROMPTING');
    expect(hostNext.round).toBe(2);
    expect(hostNext.prompterId).toBe(otherId);
  });

  it('reassigns prompter if prompter disconnects during PROMPTING', () => {
    const { manager, room, p1, p2 } = setupDrawRoom();
    const initial = manager.buildStateForClient(room).hostState as DrawHostView;
    const oldPrompter = initial.prompterId;
    const expectedNext = oldPrompter === p1.id ? p2.id : p1.id;

    manager.markPlayerDisconnected(room.code, oldPrompter);
    const updated = manager.buildStateForClient(room).hostState as DrawHostView;
    expect(updated.prompterId).toBe(expectedNext);
  });
});
