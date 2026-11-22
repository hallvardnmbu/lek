import { describe, expect, it } from 'bun:test';
import type { GameContext } from '../game';
import { createWikiRaceGame, type WikiRaceState } from './wikirace';
import { sanitizeWikiHtml } from './wikirace-wiki';

interface TestPlayer {
  id: string;
  name: string;
  connected: boolean;
}

function createTestCtx(players: TestPlayer[]) {
  const events: Array<{ event: string; payload: unknown }> = [];

  const toGamePlayers = () =>
    players.map((p) => ({
      id: p.id,
      name: p.name,
      score: 0,
      connected: p.connected,
      meta: {},
    }));

  const ctx: GameContext = {
    roomCode: 'wikirace-test',
    getPlayers: () => toGamePlayers(),
    getPlayer: (id) => toGamePlayers().find((p) => p.id === id),
    setPlayerScore: () => {},
    addPlayerScore: () => {},
    setPlayerMeta: () => {},
    setTimer: () => {},
    clearTimer: () => {},
    broadcastEvent: (event, payload) => events.push({ event, payload }),
    sendEventToHost: () => {},
    sendEventToPlayer: () => {},
    emitWebhook: () => {},
    endGame: () => {},
  };

  return { ctx, events };
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
  it('runs a race until every player finishes and marks the last arrival as loser', async () => {
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
    ];
    const { ctx, events } = createTestCtx(players);

    let state: WikiRaceState;
    const gameWithArticles = createWikiRaceGame(async (title) => {
      if (title === 'Hub') {
        return {
          title: 'Hub',
          html: '<p>Hub</p>',
          links: [state.targetTitle],
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

    state = gameWithArticles.onStart(ctx);

    await flushMicrotasks();
    state = gameWithArticles.onTimerExpired!(ctx, state)!;
    expect(state.phase).toBe('RACING');

    state = gameWithArticles.onPlayerAction(ctx, state, 'p1', {
      type: 'navigate',
      payload: { title: state.targetTitle },
    })!;
    expect(gameWithArticles.getPlayerView(state, 'p1', ctx).hops).toBe(0);

    state = gameWithArticles.onPlayerAction(ctx, state, 'p1', {
      type: 'navigate',
      payload: { title: 'Hub' },
    })!;
    await flushMicrotasks();
    state = gameWithArticles.onTimerExpired!(ctx, state)!;
    expect(gameWithArticles.getPlayerView(state, 'p1', ctx).hops).toBe(1);

    state = gameWithArticles.onPlayerAction(ctx, state, 'p1', {
      type: 'navigate',
      payload: { title: state.targetTitle },
    })!;
    await flushMicrotasks();
    state = gameWithArticles.onTimerExpired!(ctx, state)!;
    expect(gameWithArticles.getPlayerView(state, 'p1', ctx).finishedRank).toBe(1);
    expect(state.phase).toBe('RACING');

    state = gameWithArticles.onPlayerAction(ctx, state, 'p2', {
      type: 'navigate',
      payload: { title: 'Hub' },
    })!;
    expect(gameWithArticles.getPlayerView(state, 'p2', ctx).currentTitle).toBe('Hub');

    state = gameWithArticles.onPlayerAction(ctx, state, 'p2', { type: 'back' })!;
    expect(gameWithArticles.getPlayerView(state, 'p2', ctx).currentTitle).toBe(state.startTitle);
    expect(gameWithArticles.getPlayerView(state, 'p2', ctx).hops).toBe(2);

    state = gameWithArticles.onPlayerAction(ctx, state, 'p2', {
      type: 'navigate',
      payload: { title: 'Hub' },
    })!;
    state = gameWithArticles.onPlayerAction(ctx, state, 'p2', {
      type: 'navigate',
      payload: { title: state.targetTitle },
    })!;

    expect(state.phase).toBe('RACING');
    expect(gameWithArticles.getPlayerView(state, 'p2', ctx).finishedRank).toBe(2);

    state = gameWithArticles.onPlayerAction(ctx, state, 'p3', {
      type: 'navigate',
      payload: { title: 'Hub' },
    })!;
    state = gameWithArticles.onPlayerAction(ctx, state, 'p3', {
      type: 'navigate',
      payload: { title: state.targetTitle },
    })!;

    expect(state.phase).toBe('RESULTS');
    expect(state.loserId).toBe('p3');
    expect(events.some((e) => e.event === 'wikirace_finished')).toBe(true);

    const p3View = gameWithArticles.getPlayerView(state, 'p3', ctx);
    expect(p3View.isLoser).toBe(true);
    expect(gameWithArticles.getHostView(state, ctx).loserName).toBe('Carol');
  });

  it('continues the race after a disconnect until every connected player finishes', async () => {
    const players: TestPlayer[] = [
      { id: 'p1', name: 'Alice', connected: true },
      { id: 'p2', name: 'Bob', connected: true },
      { id: 'p3', name: 'Carol', connected: true },
    ];
    const { ctx } = createTestCtx(players);

    const game = createWikiRaceGame(async (title) => ({
      title,
      html: `<p>${title}</p>`,
      links: ['Goal'],
    }));

    let state = game.onStart(ctx);
    await flushMicrotasks();
    state = game.onTimerExpired!(ctx, state)!;
    state.targetTitle = 'Goal';

    state = game.onPlayerAction(ctx, state, 'p1', {
      type: 'navigate',
      payload: { title: 'Goal' },
    })!;
    await flushMicrotasks();
    state = game.onTimerExpired!(ctx, state)!;
    expect(state.phase).toBe('RACING');

    players[2].connected = false;
    state = game.onPlayerDisconnect!(ctx, state, 'p3')!;
    expect(state.phase).toBe('RACING');

    state = game.onPlayerAction(ctx, state, 'p2', {
      type: 'navigate',
      payload: { title: 'Goal' },
    })!;
    expect(state.phase).toBe('RESULTS');
    expect(state.loserId).toBe('p2');
  });
});
