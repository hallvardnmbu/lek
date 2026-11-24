import { describe, expect, it } from 'bun:test';
import type { GameContext } from '../game';
import {
  POST_PATH_HOLD_MS,
  STEP_ANIM_MS,
  WIN_POINTS,
  createWikiRaceGame,
  type WikiRaceState,
} from './wikirace';
import { sanitizeWikiHtml } from './wikirace-wiki';

interface TestPlayer {
  id: string;
  name: string;
  connected: boolean;
}

function createTestCtx(players: TestPlayer[]) {
  const events: Array<{ event: string; payload: unknown }> = [];
  const scores = new Map<string, number>();
  let currentState: unknown;
  let lastTimer: { durationMs: number; showCountdown?: boolean } | null = null;
  let endedCount = 0;

  const toGamePlayers = () =>
    players.map((p) => ({
      id: p.id,
      name: p.name,
      score: scores.get(p.id) ?? 0,
      totalScore: scores.get(p.id) ?? 0,
      connected: p.connected,
      meta: {},
    }));

  const ctx: GameContext = {
    roomCode: 'wikirace-test',
    getPlayers: () => toGamePlayers(),
    getPlayer: (id) => toGamePlayers().find((p) => p.id === id),
    setPlayerScore: (id, score) => scores.set(id, score),
    addPlayerScore: (id, delta) => scores.set(id, (scores.get(id) ?? 0) + delta),
    setPlayerMeta: () => {},
    setTimer: (durationMs, showCountdown) => {
      lastTimer = { durationMs, showCountdown };
    },
    clearTimer: () => {
      lastTimer = null;
    },
    dispatch: (fn) => {
      if (currentState === undefined) return;
      const next = fn(currentState as never);
      if (next !== undefined) currentState = next;
    },
    broadcastEvent: (event, payload) => events.push({ event, payload }),
    sendEventToHost: () => {},
    sendEventToPlayer: () => {},
    emitWebhook: () => {},
    endGame: () => {
      endedCount += 1;
    },
  };

  return {
    ctx,
    events,
    setState: (s: unknown) => {
      currentState = s;
    },
    score: (id: string) => scores.get(id) ?? 0,
    lastTimer: () => lastTimer,
    endedCount: () => endedCount,
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Wikipedia Race sanitization', () => {
  it('strips scripts, external links, and non-article namespaces while preserving article links', () => {
    const raw = [
      '<p onclick="evil()">Hello <script>alert(1)</script>',
      '<a href="/wiki/2001:_A_Space_Odyssey">Space Odyssey</a>',
      '<a href="/wiki/Category:Sci-Fi">Category</a>',
      '<a href="/wiki/File:Poster.jpg">File</a>',
      '<a href="https://example.com">External</a>',
      '<a href="/wiki/Moon#Orbit">Moon</a></p>',
    ].join(' ');

    const { html, links } = sanitizeWikiHtml(raw);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('https://example.com');
    expect(html).toContain('data-wiki-title="2001: A Space Odyssey"');
    expect(html).toContain('data-wiki-title="Moon"');
    expect(links).toEqual(['2001: A Space Odyssey', 'Moon']);
  });

  it('drops images, tables, and captions along with links inside them', () => {
    const raw = [
      '<p>Lead <a href="/wiki/Earth">Earth</a> text.</p>',
      '<figure><a href="/wiki/File:Globe.png"><img src="globe.png" alt="Globe" /></a><figcaption>A <a href="/wiki/Globe">globe</a> caption</figcaption></figure>',
      '<div class="thumb tright"><div class="thumbinner"><img src="thumb.jpg" /><div class="thumbcaption">Thumb <a href="/wiki/Map">map</a></div></div></div>',
      '<table class="infobox"><caption>Table <a href="/wiki/Summary">summary</a></caption><tr><td><table><tr><td><a href="/wiki/Nested">Nested</a></td></tr></table></td></tr></table>',
      '<p>Trail <a href="/wiki/Mars">Mars</a> text.</p>',
    ].join('');

    const { html, links } = sanitizeWikiHtml(raw);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<figure');
    expect(html).not.toContain('<figcaption');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('<caption');
    expect(html).not.toContain('thumbcaption');
    expect(html).not.toContain('globe caption');
    expect(html).not.toContain('Nested');
    expect(html).toContain('Lead');
    expect(html).toContain('Trail');
    expect(links).toEqual(['Earth', 'Mars']);
  });
});

describe('Wikipedia Race game', () => {
  it('finishes immediately on the first winner, records full click sequence including back, and auto-ends on timer expiry', async () => {
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
    ];
    const { ctx, events, score, setState, lastTimer, endedCount } = createTestCtx(players);

    let state: WikiRaceState;
    const game = createWikiRaceGame(async (title) => {
      if (title === 'Hub') {
        return {
          title: 'Hub',
          html: '<p>Hub</p>',
          links: ['Detour', state.targetTitle],
        };
      }
      if (title === 'Detour') {
        return {
          title: 'Detour',
          html: '<p>Detour</p>',
          links: [],
        };
      }
      if (state && title === state.targetTitle) {
        return {
          title: state.targetTitle,
          html: '<p>Target</p>',
          links: [],
        };
      }
      return {
        title,
        html: '<p>Start</p>',
        links: ['Hub'],
      };
    });

    state = game.onStart(ctx);
    setState(state);

    await flushMicrotasks();
    expect(state.phase).toBe('RACING');

    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'navigate',
      payload: { title: state.targetTitle },
    })!;
    expect(game.getPlayerView(state, 'p1', ctx).hops).toBe(0);

    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'navigate',
      payload: { title: 'Hub' },
    })!;
    expect(game.getPlayerView(state, 'p1', ctx).loadingTitle).toBe('Hub');
    await flushMicrotasks();
    expect(game.getPlayerView(state, 'p1', ctx).loadingTitle).toBeNull();
    expect(game.getPlayerView(state, 'p1', ctx).hops).toBe(1);

    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'navigate',
      payload: { title: 'Detour' },
    })!;
    await flushMicrotasks();
    expect(game.getPlayerView(state, 'p1', ctx).currentTitle).toBe('Detour');
    expect(game.getPlayerView(state, 'p1', ctx).hops).toBe(2);

    state = game.onPlayerAction(ctx, state, 'p1', { type: 'back' })!;
    expect(game.getPlayerView(state, 'p1', ctx).currentTitle).toBe('Hub');
    expect(game.getPlayerView(state, 'p1', ctx).hops).toBe(3);

    state = game.onPlayerAction(ctx, state, 'p2', {
      type: 'navigate',
      payload: { title: 'Hub' },
    })!;
    expect(game.getPlayerView(state, 'p2', ctx).hops).toBe(1);

    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'navigate',
      payload: { title: state.targetTitle },
    })!;
    await flushMicrotasks();

    const expectedPath = [state.startTitle, 'Hub', 'Detour', 'Hub', state.targetTitle];
    expect(state.phase).toBe('RESULTS');
    expect(state.winnerId).toBe('p1');
    expect(state.winnerPath).toEqual(expectedPath);
    expect(score('p1')).toBe(WIN_POINTS);
    expect(score('p2')).toBe(0);
    expect(score('p3')).toBe(0);

    const hostView = game.getHostView(state, ctx);
    expect(hostView.winnerId).toBe('p1');
    expect(hostView.winnerName).toBe('Alice');
    expect(hostView.winnerPath).toEqual(expectedPath);

    const p2View = game.getPlayerView(state, 'p2', ctx);
    expect(p2View.finishedRank).toBeNull();
    expect(p2View.winnerId).toBe('p1');
    expect(p2View.winnerName).toBe('Alice');
    expect(p2View.winnerPath).toEqual(expectedPath);

    expect(events.some((e) => e.event === 'wikirace_finished')).toBe(true);
    expect(lastTimer()).toEqual({
      durationMs: Math.max(4_500, expectedPath.length * STEP_ANIM_MS + POST_PATH_HOLD_MS),
      showCountdown: false,
    });
    expect(endedCount()).toBe(0);

    state = game.onPlayerAction(ctx, state, 'p2', {
      type: 'navigate',
      payload: { title: state.targetTitle },
    })!;
    expect(game.getPlayerView(state, 'p2', ctx).finishedRank).toBeNull();

    game.onTimerExpired!(ctx, state);
    expect(endedCount()).toBe(1);
  });

  it('ends the game if all connected players disconnect during RACING', async () => {
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
    ];
    const { ctx, setState, endedCount } = createTestCtx(players);

    const game = createWikiRaceGame(async (title) => ({
      title,
      html: `<p>${title}</p>`,
      links: ['Goal'],
    }));

    let state = game.onStart(ctx);
    setState(state);
    await flushMicrotasks();
    expect(state.phase).toBe('RACING');

    players[0]!.connected = false;
    state = game.onPlayerDisconnect!(ctx, state, 'p1')!;
    expect(endedCount()).toBe(0);

    players[1]!.connected = false;
    state = game.onPlayerDisconnect!(ctx, state, 'p2')!;
    expect(endedCount()).toBe(1);
  });
});
