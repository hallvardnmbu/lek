import type {
  QuizHostView,
  QuizPlayerView,
  QuizQuestion,
  QuizRevealEntry,
  QuizState,
} from '../../shared/games/quiz';
import { cortiAgent } from '../cortiModels';
import type { GameContext, GameDefinition } from '../game';
import { connectedPlayers, createRoomHistory, playerName, shuffle, withoutKey } from './helpers';

export type QuestionGenerator = (count: number, avoid?: string[]) => Promise<QuizQuestion[]>;

const SYSTEM_PROMPT = [
  'You generate multiple-choice trivia questions in Norwegian (bokmål) for a last-man-standing party quiz.',
  'Players who answer wrong are eliminated, so questions must be genuinely answerable for a mixed adult friend group — not trivia-expert level.',
  'Mix general knowledge, Norway and the Nordics, pop culture, sports, food, science, and history.',
  'Each question has exactly 4 answer options with exactly one correct option.',
  'Wrong options must be plausible and similar in style and length to the correct one.',
  'Hard limits: no slurs, no hate speech, no real named private individuals, no questions with ambiguous or debatable answers.',
].join(' ');

function sanitizeQuestion(raw: unknown): QuizQuestion | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { question, options, correctIndex } = raw as {
    question?: unknown;
    options?: unknown;
    correctIndex?: unknown;
  };
  if (typeof question !== 'string' || !question.trim()) return null;
  if (
    !Array.isArray(options) ||
    options.length < 2 ||
    !options.every((o): o is string => typeof o === 'string' && o.trim().length > 0)
  ) {
    return null;
  }
  if (
    typeof correctIndex !== 'number' ||
    !Number.isInteger(correctIndex) ||
    correctIndex < 0 ||
    correctIndex >= options.length
  ) {
    return null;
  }
  const correctOption = options[correctIndex];
  const shuffled = shuffle(options);
  return {
    question: question.trim(),
    options: shuffled,
    correctIndex: shuffled.indexOf(correctOption),
  };
}

export const defaultGenerateQuestions: QuestionGenerator = async (count, avoid = []) => {
  if (count <= 0) return [];

  const avoidNote =
    avoid.length > 0
      ? ` Questions already used in this room — do not repeat or closely rephrase: ${avoid.map((q) => `"${q}"`).join(', ')}.`
      : '';

  const parsed = await cortiAgent.completeJson<{ questions?: unknown }>({
    temperature: 1,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `Generate ${count} diverse trivia questions in Norwegian (bokmål).${avoidNote}` +
          ' Respond with JSON: {"questions": [{"question": "<spørsmål>", "options": ["<svar A>", "<svar B>", "<svar C>", "<svar D>"], "correctIndex": <0-3>}]}',
      },
    ],
  });

  if (!parsed || !Array.isArray(parsed.questions)) return [];

  const seen = new Set<string>();
  const results: QuizQuestion[] = [];
  for (const raw of parsed.questions) {
    const sanitized = sanitizeQuestion(raw);
    if (!sanitized) continue;
    const key = sanitized.question.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(sanitized);
    if (results.length >= count) break;
  }
  return results;
};

export const FALLBACK_QUESTIONS: readonly QuizQuestion[] = [
  { question: 'Hva er hovedstaden i Norge?', options: ['Bergen', 'Oslo', 'Trondheim', 'Stavanger'], correctIndex: 1 },
  { question: 'Hvor mange bein har et insekt?', options: ['4', '8', '6', '10'], correctIndex: 2 },
  { question: 'Hva er det kjemiske symbolet for gull?', options: ['Ag', 'Go', 'Au', 'Gu'], correctIndex: 2 },
  { question: 'Hvilken planet er nærmest solen?', options: ['Venus', 'Merkur', 'Mars', 'Jorden'], correctIndex: 1 },
  { question: 'Hvor mange strenger har en standard gitar?', options: ['4', '12', '7', '6'], correctIndex: 3 },
  { question: 'I hvilket år sank Titanic?', options: ['1905', '1912', '1918', '1923'], correctIndex: 1 },
  { question: 'Hvilket hav er verdens største?', options: ['Atlanterhavet', 'Indiske hav', 'Stillehavet', 'Arktiske hav'], correctIndex: 2 },
  { question: 'Hva får man hvis man blander blå og gul maling?', options: ['Lilla', 'Grønt', 'Oransje', 'Brun'], correctIndex: 1 },
  { question: 'Hvilket land vant VM i fotball for herrer i 2018?', options: ['Tyskland', 'Brasil', 'Frankrike', 'Argentina'], correctIndex: 2 },
  { question: 'Hvor mange grader er det i en full sirkel?', options: ['180', '270', '100', '360'], correctIndex: 3 },
  { question: 'Hva heter den lengste elven i Europa?', options: ['Donau', 'Volga', 'Rhinen', 'Seinen'], correctIndex: 1 },
  { question: 'Hvilken norsk by arrangerte vinter-OL i 1994?', options: ['Oslo', 'Lillehammer', 'Salt Lake City', 'Nagano'], correctIndex: 1 },
  { question: 'Sushi stammer opprinnelig fra hvilket land?', options: ['Kina', 'Japan', 'Thailand', 'Korea'], correctIndex: 1 },
  { question: 'Hvilket dyr kalles "skogens konge" i Norge?', options: ['Bjørn', 'Hjort', 'Elg', 'Gaupe'], correctIndex: 2 },
  { question: 'Hvor mange spillere har et fotballag på banen?', options: ['9', '11', '10', '12'], correctIndex: 1 },
];

const POLL_MS = 500;
const QUESTION_MS = 30_000;
const REVEAL_MS = 8_000;
const BATCH_SIZE = 10;
const PREFETCH_AT = 8;
const CORRECT_POINTS = 1;
const WINNER_BONUS = 10;

const questionHistory = createRoomHistory();

function aliveConnectedIds(ctx: GameContext, state: QuizState): string[] {
  return state.aliveIds.filter((id) => ctx.getPlayer(id)?.connected ?? false);
}

function currentQuestion(state: QuizState): QuizQuestion | null {
  return state.questions[state.questionNumber - 1] ?? null;
}

function reshuffleOptions(question: QuizQuestion): QuizQuestion {
  const options = shuffle(question.options);
  return {
    question: question.question,
    options,
    correctIndex: options.indexOf(question.options[question.correctIndex]),
  };
}

function takeQuestion(roomCode: string, state: QuizState): QuizQuestion {
  const inbox = state.aiInbox.questions;
  if (inbox !== null) {
    while (inbox.length > 0) {
      const candidate = inbox.shift()!;
      if (!questionHistory.isUsed(roomCode, candidate.question)) return candidate;
    }
  }

  for (let attempt = 0; attempt < FALLBACK_QUESTIONS.length; attempt++) {
    if (!state.fallbackPool || state.fallbackPool.length === 0) {
      state.fallbackPool = shuffle(FALLBACK_QUESTIONS);
    }
    const candidate = state.fallbackPool.pop()!;
    if (!questionHistory.isUsed(roomCode, candidate.question)) {
      return reshuffleOptions(candidate);
    }
  }

  return reshuffleOptions(
    FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)]
  );
}

function maybeKickBackgroundBatch(
  ctx: GameContext,
  state: QuizState,
  generateQuestions: QuestionGenerator
): void {
  const stock = state.aiInbox.questions?.length ?? 0;
  if (state.questionNumber < PREFETCH_AT || state.pendingBatch || stock > BATCH_SIZE - PREFETCH_AT) {
    return;
  }
  state.pendingBatch = true;
  void generateQuestions(BATCH_SIZE, questionHistory.recent(ctx.roomCode)).then((batch) => {
    state.aiInbox.questions = [...(state.aiInbox.questions ?? []), ...batch];
    state.pendingBatch = false;
  });
}

function serveNextQuestion(
  ctx: GameContext,
  state: QuizState,
  generateQuestions: QuestionGenerator
): QuizState {
  if (state.aliveIds.length <= 1) {
    finishGame(ctx, state);
    return state;
  }

  const question = takeQuestion(ctx.roomCode, state);
  questionHistory.remember(ctx.roomCode, question.question);
  state.questions.push(question);
  state.questionNumber += 1;
  state.answers = {};
  state.results = [];
  state.allWrong = false;
  state.phase = 'QUESTION';
  maybeKickBackgroundBatch(ctx, state, generateQuestions);
  ctx.setTimer(QUESTION_MS);
  return state;
}

function reveal(ctx: GameContext, state: QuizState): QuizState {
  const question = currentQuestion(state);
  if (!question) return state;

  const connected = aliveConnectedIds(ctx, state);
  const results: QuizRevealEntry[] = connected.map((id) => {
    const answer = state.answers[id];
    return {
      playerId: id,
      playerName: ctx.getPlayer(id)?.name ?? '?',
      correct: answer?.optionIndex === question.correctIndex,
      eliminated: false,
    };
  });

  const wrongIds = results.filter((r) => !r.correct).map((r) => r.playerId);
  const allWrong = connected.length > 0 && wrongIds.length === connected.length;

  for (const r of results) {
    if (r.correct) ctx.addPlayerScore(r.playerId, CORRECT_POINTS);
  }

  if (!allWrong && wrongIds.length > 0) {
    const wrongSet = new Set(wrongIds);
    state.aliveIds = state.aliveIds.filter((id) => !wrongSet.has(id));
    for (const r of results) {
      if (wrongSet.has(r.playerId)) r.eliminated = true;
    }
  }

  state.allWrong = allWrong;
  state.results = results;
  state.phase = 'REVEAL';
  ctx.setTimer(REVEAL_MS);
  ctx.broadcastEvent('quiz_reveal', {
    question: question.question,
    answer: question.options[question.correctIndex],
    eliminated: results.filter((r) => r.eliminated).map((r) => r.playerName),
  });
  return state;
}

function maybeReveal(ctx: GameContext, state: QuizState): QuizState {
  if (state.phase !== 'QUESTION') return state;
  const connected = aliveConnectedIds(ctx, state);
  if (connected.length === 0) return state;
  if (connected.every((id) => state.answers[id] !== undefined)) {
    return reveal(ctx, state);
  }
  return state;
}

function finishGame(ctx: GameContext, state: QuizState): void {
  const winnerId = state.aliveIds[0];
  if (winnerId) ctx.addPlayerScore(winnerId, WINNER_BONUS);
  ctx.endGame();
}

function baseView(state: QuizState, ctx: GameContext) {
  const question = currentQuestion(state);
  const connected = aliveConnectedIds(ctx, state);
  const winnerId = state.aliveIds.length === 1 ? state.aliveIds[0] : null;

  return {
    phase: state.phase,
    questionNumber: state.questionNumber,
    question: question?.question ?? null,
    options: question?.options ?? [],
    correctIndex: state.phase === 'REVEAL' ? (question?.correctIndex ?? null) : null,
    answeredCount: connected.filter((id) => state.answers[id] !== undefined).length,
    connectedAliveCount: connected.length,
    aliveCount: state.aliveIds.length,
    results: state.results,
    allWrong: state.allWrong,
    winnerName: playerName(ctx, winnerId),
  };
}

export function createQuizGame(
  generateQuestions: QuestionGenerator = defaultGenerateQuestions
): GameDefinition<QuizState, QuizHostView, QuizPlayerView> {
  return {
    id: 'quiz',
    name: 'Quiz',
    description: 'Norwegian trivia. Wrong answer eliminates you.',
    minPlayers: 2,
    maxPlayers: 12,

    onStart(ctx) {
      const state: QuizState = {
        phase: 'GENERATING',
        questionNumber: 0,
        questions: [],
        answers: {},
        aliveIds: connectedPlayers(ctx).map((p) => p.id),
        results: [],
        allWrong: false,
        aiInbox: { questions: null },
        pendingBatch: false,
        fallbackPool: null,
      };

      void generateQuestions(BATCH_SIZE, questionHistory.recent(ctx.roomCode)).then((batch) => {
        state.aiInbox.questions = batch;
      });

      ctx.setTimer(POLL_MS);
      return state;
    },

    onTimerExpired(ctx, state) {
      if (state.phase === 'GENERATING') {
        if (state.aiInbox.questions === null) {
          ctx.setTimer(POLL_MS);
          return state;
        }
        return serveNextQuestion(ctx, state, generateQuestions);
      }
      if (state.phase === 'QUESTION') {
        return reveal(ctx, state);
      }
      return serveNextQuestion(ctx, state, generateQuestions);
    },

    onPlayerAction(ctx, state, playerId, action) {
      if (state.phase !== 'QUESTION' || action.type !== 'answer') return state;
      if (!state.aliveIds.includes(playerId) || state.answers[playerId] !== undefined) {
        return state;
      }

      const optionIndex = (action.payload as { optionIndex?: unknown } | undefined)?.optionIndex;
      const question = currentQuestion(state);
      if (
        typeof optionIndex !== 'number' ||
        !Number.isInteger(optionIndex) ||
        !question ||
        optionIndex < 0 ||
        optionIndex >= question.options.length
      ) {
        return state;
      }

      state.answers = { ...state.answers, [playerId]: { optionIndex } };
      return maybeReveal(ctx, state);
    },

    onHostAction(ctx, state, action) {
      if (action.type !== 'next') return state;
      if (state.phase === 'QUESTION') return reveal(ctx, state);
      if (state.phase === 'REVEAL') return serveNextQuestion(ctx, state, generateQuestions);
      return state;
    },

    onPlayerDisconnect(ctx, state) {
      return maybeReveal(ctx, state);
    },

    onPlayerReconnect(ctx, state) {
      return maybeReveal(ctx, state);
    },

    onPlayerLeave(ctx, state, playerId) {
      state.answers = withoutKey(state.answers, playerId);
      state.aliveIds = state.aliveIds.filter((id) => id !== playerId);

      if (state.phase === 'QUESTION') {
        if (state.aliveIds.length <= 1) {
          finishGame(ctx, state);
          return state;
        }
        return maybeReveal(ctx, state);
      }
      return state;
    },

    getHostView(state, ctx): QuizHostView {
      return baseView(state, ctx);
    },

    getPlayerView(state, playerId, ctx): QuizPlayerView {
      return {
        ...baseView(state, ctx),
        myAnswerIndex: state.answers[playerId]?.optionIndex ?? null,
        iAmAlive: state.aliveIds.includes(playerId),
        myCorrect: state.results.find((r) => r.playerId === playerId)?.correct ?? null,
        iWasEliminated: state.results.some((r) => r.playerId === playerId && r.eliminated),
      };
    },
  };
}

export const quizGame = createQuizGame();
