const API_KEY = process.env.CORTI_MODELS_API_KEY ?? process.env.CORTI_BEARER;
const REGION = process.env.CORTI_MODELS_REGION ?? process.env.CORTI_ENVIRONMENT ?? 'eu';
const API_BASE = `https://ai.${REGION}.corti.app/v1`;
const MODEL = process.env.CORTI_MODELS_MODEL ?? 'corti-s1-mini-instant';
const CLIENT_ID = process.env.CORTI_CLIENT_ID;
const CLIENT_SECRET = process.env.CORTI_CLIENT_SECRET;
const TENANT = process.env.CORTI_TENANT_NAME ?? 'base';
const TOKEN_URL = `https://auth.${REGION}.corti.app/realms/${TENANT}/protocol/openid-connect/token`;
const TIMEOUT_MS = 20_000;

const SYSTEM_PROMPT = [
  'You write prompts for the adult party drinking game "Most Likely To".',
  'Every prompt finishes the sentence "Who is most likely to...".',
  'Style: filthy, degenerate, borderline offensive. Sex, kinks, cheating, crime, drugs, death, toxic exes, shame and terrible life choices are all fair game.',
  'Each prompt should make the room gasp and then burst out laughing.',
  'Hard limits: no slurs, no sexual violence, no instructions for real illegal acts, no real named people.',
  'Each prompt is under 18 words, lowercase, no quotes, no numbering, no trailing period.',
].join(' ');

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function getAccessToken(): Promise<string | null> {
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      grant_type: 'client_credentials',
      scope: 'openid',
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: unknown };
  return typeof data.access_token === 'string' ? data.access_token : null;
}

async function resolveBearer(): Promise<string | null> {
  if (API_KEY) return API_KEY;
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  try {
    return await getAccessToken();
  } catch {
    return null;
  }
}

const PROMPT_PREFIX_RE = /^\s*who\s+is\s+(?:the\s+)?most\s+likely\s+to\s*/i;

function parsePrompts(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as { prompts?: unknown };
    if (!Array.isArray(parsed.prompts)) return [];
    const seen = new Set<string>();
    return parsed.prompts
      .filter((p): p is string => typeof p === 'string')
      .map((p) => p.replace(PROMPT_PREFIX_RE, '').replace(/\?\s*$/, '').trim())
      .filter((p) => {
        if (!p || seen.has(p)) return false;
        seen.add(p);
        return true;
      });
  } catch {
    return [];
  }
}

/**
 * Generates "most likely to" drinking game prompts with Corti Models.
 * `avoid` lists prompts already used in the room so the model steers clear.
 * Returns an empty list when the API is unconfigured, unreachable, or returns
 * unusable output; callers are expected to fall back to built-in prompts.
 */
export async function generateMostLikelyPrompts(
  count: number,
  avoid: string[] = []
): Promise<string[]> {
  const bearer = await resolveBearer();
  if (!bearer) return [];

  const avoidNote =
    avoid.length > 0
      ? ` Already used in this room — do not repeat or closely rephrase: ${avoid.map((p) => `"${p}"`).join(', ')}.`
      : '';

  try {
    const res = await fetchWithTimeout(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Generate ${count} diverse prompts.${avoidNote} Respond with JSON: {"prompts": ["<prompt>", ...]}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 1,
      }),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return [];
    return parsePrompts(content).slice(0, count);
  } catch {
    return [];
  }
}

export type PromptGenerator = (count: number, avoid: string[]) => Promise<string[]>;
