import { For, Show, createEffect, createMemo, createSignal, onSettled } from 'solid-js';
import {
  type MusicQuizHostView,
  type MusicQuizPlayerView,
  type MusicQuizRoundResult,
  type MusicQuizSong,
} from '../../../../shared/games/musicquiz';
import { ResultList, type ResultListEntry } from '../../components/ResultList';
import { TvActedArms } from '../../components/tv/TvActedArms';
import { secondsLeft, type GameUiDefinition, type MobileGameViewProps, type TvGameViewProps } from '../registry';
import { loadQuizCatalog, quizCatalog, songById } from './catalog';
import './musicquiz.css';

function toResultEntry(result: MusicQuizRoundResult, stat?: string): ResultListEntry {
  return {
    playerId: result.playerId,
    name: result.playerName,
    detail: result.guessSongId
      ? (songById(result.guessSongId)?.title ?? 'unknown song')
      : 'no guess',
    badge: result.correct ? `+${result.points}` : 'MISSED',
    badgeTone: result.correct ? 'accent' : 'loser',
    tone: result.correct ? 'accent' : 'default',
    stat,
  };
}

function MusicQuizTvView(props: TvGameViewProps<MusicQuizHostView>) {
  const view = () => props.state.hostState;
  const scoresById = createMemo(
    () => new Map(props.state.players.map((p) => [p.id, p.score]))
  );
  const resultEntries = createMemo(() =>
    (view()?.results ?? []).map((result) =>
      toResultEntry(result, `${scoresById().get(result.playerId) ?? 0} pts`)
    )
  );

  let audio: HTMLAudioElement | undefined;
  let playingKey = '';

  onSettled(() => {
    loadQuizCatalog();
    audio = new Audio();
    audio.preload = 'auto';
    return () => {
      audio?.pause();
      if (audio) audio.src = '';
      audio = undefined;
    };
  });

  createEffect(
    () => {
      const v = view();
      return {
        roundId: props.state.roundId,
        round: v?.round ?? 0,
        audioUrl: v?.phase === 'GUESSING' ? v.audioUrl : null,
      };
    },
    (deps) => {
      if (!audio) return;
      if (!deps.audioUrl) {
        audio.pause();
        playingKey = '';
        return;
      }
      const key = `${deps.roundId}:${deps.round}:${deps.audioUrl}`;
      if (key === playingKey) return;
      playingKey = key;
      audio.src = deps.audioUrl;
      audio.currentTime = 0;
      const attempt = audio.play();
      if (attempt) {
        attempt.catch(() => {
          const retry = () => audio?.play().catch(() => {});
          window.addEventListener('keydown', retry, { once: true });
          window.addEventListener('pointerdown', retry, { once: true });
        });
      }
    }
  );

  const nextHint = () => {
    const v = view();
    if (!v) return '';
    const secs = secondsLeft(props.remainingMs);
    if (v.phase === 'INTRO') return `Song starts in ${secs}s`;
    if (v.phase === 'REVEAL') {
      if (v.round < v.totalRounds) return `Next round in ${secs}s`;
      return secs > 0 ? `Final scores in ${secs}s` : 'Final results next';
    }
    return '';
  };

  return (
    <div class="tv-phase-center">
      <p class="eyebrow">
        ROUND {view()?.round} OF {view()?.totalRounds}
      </p>

      <Show when={view()?.phase === 'INTRO'}>
        <h1 class="tv-hero-title">Song {view()?.round}</h1>
      </Show>

      <Show when={view()?.phase === 'GUESSING'}>
        <div class="mq-eq" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <h1 class="tv-hero-title">What's the song?</h1>
        <Show when={!view()?.audioUrl}>
          <p class="mq-no-audio">No clip</p>
        </Show>
        <TvActedArms
          players={props.state.players}
          actedIds={view()?.guessedPlayerIds ?? []}
        />
      </Show>

      <Show when={view()?.phase === 'REVEAL'}>
        <p class="mq-answer-label">THE SONG WAS</p>
        <h1 class="mq-answer-title">{view()?.song?.title}</h1>
        <p class="mq-answer-artist">{view()?.song?.artist}</p>

        <ResultList
          entries={resultEntries()}
          players={props.state.players}
          class="mq-results"
        />
      </Show>

      <Show when={nextHint()}>
        {(hint) => <p class="mq-next-hint">{hint()}</p>}
      </Show>
    </div>
  );
}

function MusicQuizMobileView(props: MobileGameViewProps<MusicQuizPlayerView>) {
  const view = () => props.state.playerState;
  const [query, setQuery] = createSignal('');
  let searchInput: HTMLInputElement | undefined;

  onSettled(() => {
    loadQuizCatalog();
  });

  const matches = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return [];
    const scored: { song: MusicQuizSong; rank: number }[] = [];
    for (const song of quizCatalog()) {
      const title = song.title.toLowerCase();
      const artist = song.artist.toLowerCase();
      let rank = -1;
      if (title.startsWith(q)) rank = 0;
      else if (artist.startsWith(q)) rank = 1;
      else if (title.includes(q)) rank = 2;
      else if (artist.includes(q)) rank = 3;
      if (rank >= 0) scored.push({ song, rank });
    }
    return scored
      .sort((a, b) => a.rank - b.rank || a.song.title.localeCompare(b.song.title))
      .slice(0, 12)
      .map((entry) => entry.song);
  });

  const resultEntries = createMemo(() =>
    (view()?.results ?? []).map((result) => toResultEntry(result))
  );

  const submitGuess = (songId: string) => {
    props.sendAction({ type: 'guess', payload: { songId } });
    setQuery('');
  };

  createEffect(
    () => ({ phase: view()?.phase, myGuessSongId: view()?.myGuessSongId }),
    (deps) => {
      if (deps.phase === 'GUESSING' && !deps.myGuessSongId) {
        searchInput?.focus();
      }
    }
  );

  const phaseLabel = createMemo(() => {
    const phase = view()?.phase;
    if (phase === 'INTRO') return 'Get ready';
    if (phase === 'GUESSING') return 'Guess the song';
    return 'Reveal';
  });

  const lockedSong = createMemo(() => songById(view()?.myGuessSongId));

  return (
    <div class="mobile-card">
      <div class="mq-head">
        <span>
          Round {view()?.round}/{view()?.totalRounds}
        </span>
        <span class="mq-phase-tag">{phaseLabel()}</span>
      </div>

      <Show when={view()?.phase === 'INTRO'}>
        <h2 class="mq-stage-title">Song {view()?.round}</h2>
        <p class="muted">Listen on the TV. Search here when the clip starts.</p>
      </Show>

      <Show when={view()?.phase === 'GUESSING'}>
        <Show
          when={!view()?.myGuessSongId}
          fallback={
            <div class="mq-locked">
              <p class="mq-locked-label">LOCKED IN</p>
              <p class="mq-locked-song">{lockedSong()?.title}</p>
              <p class="mq-locked-artist">{lockedSong()?.artist}</p>
              <p class="muted">Waiting for reveal</p>
            </div>
          }
        >
          <label class="field mq-search-field">
            <input
              ref={(el) => (searchInput = el)}
              type="text"
              placeholder="Search title or artist"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
          </label>
          <div class="mq-search-list">
            <For each={matches()}>
              {(song) => (
                <button
                  type="button"
                  class="btn btn-block btn-vote mq-song-btn"
                  onClick={() => submitGuess(song.id)}
                >
                  <span class="mq-song-title">{song.title}</span>
                  <span class="mq-song-artist">{song.artist}</span>
                </button>
              )}
            </For>
          </div>
          <Show when={!query().trim()}>
            <p class="muted mq-search-hint">
              Type any part of the title or artist, then tap the song.
            </p>
          </Show>
        </Show>
        <p class="muted mq-guessed-progress">
          {view()?.guessedCount}/{view()?.connectedCount} locked in
        </p>
      </Show>

      <Show when={view()?.phase === 'REVEAL'}>
        <p class="mq-answer-label">THE SONG WAS</p>
        <h2 class="mq-reveal-song">{view()?.song?.title}</h2>
        <p class="mq-reveal-artist">{view()?.song?.artist}</p>

        <Show
          when={view()?.myResult}
          fallback={<p class="mq-verdict mq-wrong">No guess this round</p>}
        >
          {(mine) => (
            <Show
              when={mine().correct}
              fallback={
                <p class="mq-verdict mq-wrong">
                  {mine().guessSongId
                    ? `Wrong: you picked ${songById(mine().guessSongId)?.title}`
                    : 'No guess this round'}
                </p>
              }
            >
              <p class="mq-verdict mq-correct">Correct! +{mine().points} pts</p>
            </Show>
          )}
        </Show>

        <ResultList
          entries={resultEntries()}
          players={props.state.players}
          compact
        />
      </Show>
    </div>
  );
}

export const musicQuizGameUi: GameUiDefinition<MusicQuizHostView, MusicQuizPlayerView> = {
  id: 'music-quiz',
  name: 'Musiquiz',
  TvView: MusicQuizTvView,
  MobileView: MusicQuizMobileView,
};
