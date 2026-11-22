export type CortiFetcher = (input: string, init: RequestInit) => Promise<Response>;

export interface CortiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CortiCompletionRequest {
  messages: CortiMessage[];
  model?: string;
  temperature?: number;
  json?: boolean;
}

export interface CortiAgentOptions {
  apiKey?: string;
  region?: string;
  model?: string;
  clientId?: string;
  clientSecret?: string;
  tenant?: string;
  timeoutMs?: number;
  fetcher?: CortiFetcher;
}

export type PromptGenerator = (count: number, avoid?: string[]) => Promise<string[]>;

export interface PromptGeneratorConfig {
  systemPrompt: string;
  userPrompt?: (count: number, avoidNote: string) => string;
  normalize?: (prompt: string) => string;
  temperature?: number;
  model?: string;
}

export interface CortiAgent {
  complete(request: CortiCompletionRequest): Promise<string | null>;
  completeJson<T = unknown>(request: Omit<CortiCompletionRequest, 'json'>): Promise<T | null>;
  createPromptGenerator(config: PromptGeneratorConfig): PromptGenerator;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

const DEFAULT_REGION = 'eu';
const DEFAULT_MODEL = 'corti-s1-mini-instant';
const DEFAULT_TENANT = 'base';
const DEFAULT_TIMEOUT_MS = 20_000;

export function createCortiAgent(options: CortiAgentOptions = {}): CortiAgent {
  const apiKey = options.apiKey ?? process.env.CORTI_MODELS_API_KEY ?? process.env.CORTI_BEARER;
  const region = options.region ?? process.env.CORTI_MODELS_REGION ?? process.env.CORTI_ENVIRONMENT ?? DEFAULT_REGION;
  const defaultModel = options.model ?? process.env.CORTI_MODELS_MODEL ?? DEFAULT_MODEL;
  const clientId = options.clientId ?? process.env.CORTI_CLIENT_ID;
  const clientSecret = options.clientSecret ?? process.env.CORTI_CLIENT_SECRET;
  const tenant = options.tenant ?? process.env.CORTI_TENANT_NAME ?? DEFAULT_TENANT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetcher: CortiFetcher = options.fetcher ?? ((input, init) => fetch(input, init));

  const apiBase = `https://ai.${region}.corti.app/v1`;
  const tokenUrl = `https://auth.${region}.corti.app/realms/${tenant}/protocol/openid-connect/token`;

  async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetcher(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function resolveBearer(): Promise<string | null> {
    if (apiKey) return apiKey;
    if (!clientId || !clientSecret) return null;
    try {
      const res = await fetchWithTimeout(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'client_credentials',
          scope: 'openid',
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { access_token?: unknown };
      return typeof data.access_token === 'string' ? data.access_token : null;
    } catch {
      return null;
    }
  }

  async function complete(request: CortiCompletionRequest): Promise<string | null> {
    const bearer = await resolveBearer();
    if (!bearer) return null;

    const body: Record<string, unknown> = {
      model: request.model ?? defaultModel,
      messages: request.messages,
    };
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    if (request.json) {
      body.response_format = { type: 'json_object' };
    }

    try {
      const res = await fetchWithTimeout(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;

      const data = (await res.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;
      return typeof content === 'string' ? content : null;
    } catch {
      return null;
    }
  }

  async function completeJson<T = unknown>(
    request: Omit<CortiCompletionRequest, 'json'>
  ): Promise<T | null> {
    const content = await complete({ ...request, json: true });
    if (content === null) return null;
    try {
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  function createPromptGenerator(config: PromptGeneratorConfig): PromptGenerator {
    const normalize = config.normalize ?? ((p: string) => p.trim());
    const temperature = config.temperature ?? 1;

    return async (count: number, avoid: string[] = []): Promise<string[]> => {
      if (count <= 0) return [];

      const avoidNote =
        avoid.length > 0
          ? ` Already used in this room — do not repeat or closely rephrase: ${avoid.map((p) => `"${p}"`).join(', ')}.`
          : '';

      const userContent = config.userPrompt
        ? config.userPrompt(count, avoidNote)
        : `Generate ${count} diverse prompts.${avoidNote} Respond with JSON: {"prompts": ["<prompt>", ...]}`;

      const parsed = await completeJson<{ prompts?: unknown }>({
        model: config.model,
        temperature,
        messages: [
          { role: 'system', content: config.systemPrompt },
          { role: 'user', content: userContent },
        ],
      });

      if (!parsed || !Array.isArray(parsed.prompts)) return [];

      const seen = new Set<string>();
      const results: string[] = [];
      for (const raw of parsed.prompts) {
        if (typeof raw !== 'string') continue;
        const cleaned = normalize(raw.trim());
        if (!cleaned || seen.has(cleaned)) continue;
        seen.add(cleaned);
        results.push(cleaned);
        if (results.length >= count) break;
      }
      return results;
    };
  }

  return { complete, completeJson, createPromptGenerator };
}

export const cortiAgent = createCortiAgent();
