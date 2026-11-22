import { describe, expect, it } from 'bun:test';
import { createCortiAgent, type CortiFetcher } from './cortiModels';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createCortiAgent', () => {
  it('returns null without calling fetch when credentials are missing', async () => {
    let called = false;
    const fetcher: CortiFetcher = async () => {
      called = true;
      return jsonResponse({});
    };

    const agent = createCortiAgent({
      apiKey: '',
      clientId: '',
      clientSecret: '',
      fetcher,
    });

    const text = await agent.complete({ messages: [{ role: 'user', content: 'hi' }] });
    const json = await agent.completeJson({ messages: [{ role: 'user', content: 'hi' }] });

    expect(text).toBeNull();
    expect(json).toBeNull();
    expect(called).toBe(false);
  });

  it('sends chat completion requests with apiKey and parses JSON responses', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetcher: CortiFetcher = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({
        choices: [{ message: { content: '{"question":"Capital of France?","answer":"Paris"}' } }],
      });
    };

    const agent = createCortiAgent({
      apiKey: 'secret-key',
      region: 'us',
      model: 'custom-model',
      fetcher,
    });

    const result = await agent.completeJson<{ question: string; answer: string }>({
      messages: [
        { role: 'system', content: 'Trivia host' },
        { role: 'user', content: 'One question' },
      ],
      temperature: 0.7,
    });

    expect(result).toEqual({ question: 'Capital of France?', answer: 'Paris' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://ai.us.corti.app/v1/chat/completions');

    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-key');

    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toEqual({
      model: 'custom-model',
      messages: [
        { role: 'system', content: 'Trivia host' },
        { role: 'user', content: 'One question' },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });
  });

  it('exchanges client credentials for a bearer token when apiKey is absent', async () => {
    const calls: string[] = [];
    const fetcher: CortiFetcher = async (url, init) => {
      calls.push(url);
      if (url.endsWith('/protocol/openid-connect/token')) {
        return jsonResponse({ access_token: 'oauth-token' });
      }
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer oauth-token');
      return jsonResponse({ choices: [{ message: { content: 'hello' } }] });
    };

    const agent = createCortiAgent({
      apiKey: '',
      clientId: 'cid',
      clientSecret: 'csec',
      tenant: 'party',
      region: 'eu',
      fetcher,
    });

    const result = await agent.complete({ messages: [{ role: 'user', content: 'say hi' }] });

    expect(result).toBe('hello');
    expect(calls).toEqual([
      'https://auth.eu.corti.app/realms/party/protocol/openid-connect/token',
      'https://ai.eu.corti.app/v1/chat/completions',
    ]);
  });

  it('creates reusable prompt generators with normalization, deduplication, and avoid list', async () => {
    let capturedBody = '';
    const fetcher: CortiFetcher = async (_url, init) => {
      capturedBody = init.body as string;
      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                prompts: ['  PROMPT: first  ', 'first', '', 123, 'PROMPT: second', 'third'],
              }),
            },
          },
        ],
      });
    };

    const agent = createCortiAgent({ apiKey: 'k', fetcher });
    const generate = agent.createPromptGenerator({
      systemPrompt: 'Generate party prompts.',
      normalize: (p) => p.replace(/^PROMPT:\s*/i, '').trim(),
    });

    const prompts = await generate(2, ['old prompt']);

    expect(prompts).toEqual(['first', 'second']);
    const parsedBody = JSON.parse(capturedBody);
    expect(parsedBody.messages[0]).toEqual({ role: 'system', content: 'Generate party prompts.' });
    expect(parsedBody.messages[1].content).toContain('"old prompt"');
  });

  it('returns null or empty list on HTTP errors, invalid JSON, or network failures', async () => {
    const failingFetcher: CortiFetcher = async () => jsonResponse({}, 500);
    const failingAgent = createCortiAgent({ apiKey: 'k', fetcher: failingFetcher });
    expect(await failingAgent.complete({ messages: [{ role: 'user', content: 'x' }] })).toBeNull();

    const badJsonFetcher: CortiFetcher = async () =>
      jsonResponse({ choices: [{ message: { content: 'not-json' } }] });
    const badJsonAgent = createCortiAgent({ apiKey: 'k', fetcher: badJsonFetcher });
    expect(await badJsonAgent.completeJson({ messages: [{ role: 'user', content: 'x' }] })).toBeNull();
    const generate = badJsonAgent.createPromptGenerator({ systemPrompt: 'test' });
    expect(await generate(3)).toEqual([]);

    const throwingFetcher: CortiFetcher = async () => {
      throw new Error('network down');
    };
    const throwingAgent = createCortiAgent({ apiKey: 'k', fetcher: throwingFetcher });
    expect(await throwingAgent.complete({ messages: [{ role: 'user', content: 'x' }] })).toBeNull();
  });
});
