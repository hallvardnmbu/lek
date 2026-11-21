import { createHmac } from 'node:crypto';
import type { WebhookPayload } from '../shared/protocol';

export interface WebhookTarget {
  url: string;
  secret?: string;
  /** Optional list of event names to subscribe to (supports '*' wildcard). Defaults to all events. */
  events?: string[];
  timeoutMs?: number;
}

export type WebhookFetcher = (
  input: string,
  init: RequestInit
) => Promise<Response>;

export interface WebhookManagerOptions {
  targets?: WebhookTarget[];
  defaultSecret?: string;
  defaultTimeoutMs?: number;
  fetcher?: WebhookFetcher;
  onError?: (url: string, event: string, error: unknown) => void;
}

/**
 * Signs a serialized JSON webhook payload with HMAC-SHA256.
 */
export function signWebhookPayload(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/**
 * Verifies an incoming webhook signature using HMAC-SHA256.
 */
export function verifyWebhookSignature(
  body: string,
  secret: string,
  signatureHeader: string | null | undefined
): boolean {
  if (!signatureHeader) return false;
  const expected = signWebhookPayload(body, secret);
  if (expected.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Dispatches non-blocking HTTP webhooks for room and game lifecycle events.
 * Reads `WEBHOOK_URLS` (comma-separated) and `WEBHOOK_SECRET` from env by default.
 */
export class WebhookManager {
  private targets = new Map<string, WebhookTarget>();
  private readonly defaultSecret?: string;
  private readonly defaultTimeoutMs: number;
  private readonly fetcher: WebhookFetcher;
  private readonly onError?: (url: string, event: string, error: unknown) => void;

  constructor(options: WebhookManagerOptions = {}) {
    this.defaultSecret = options.defaultSecret ?? process.env.WEBHOOK_SECRET;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 5_000;
    this.fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
    this.onError = options.onError;

    const envUrls = (process.env.WEBHOOK_URLS ?? '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    for (const url of envUrls) {
      this.register({ url, secret: this.defaultSecret });
    }

    for (const target of options.targets ?? []) {
      this.register(target);
    }
  }

  register(target: WebhookTarget): void {
    this.targets.set(target.url, {
      ...target,
      secret: target.secret ?? this.defaultSecret,
      timeoutMs: target.timeoutMs ?? this.defaultTimeoutMs,
    });
  }

  unregister(url: string): void {
    this.targets.delete(url);
  }

  listTargets(): WebhookTarget[] {
    return Array.from(this.targets.values()).map((t) => ({
      url: t.url,
      events: t.events,
      timeoutMs: t.timeoutMs,
    }));
  }

  async emit<T = unknown>(event: string, roomCode: string, data: T): Promise<void> {
    if (this.targets.size === 0) return;

    const payload: WebhookPayload<T> = {
      id: crypto.randomUUID(),
      event,
      timestamp: new Date().toISOString(),
      roomCode,
      data,
    };
    const body = JSON.stringify(payload);

    const deliveries: Promise<void>[] = [];
    for (const target of this.targets.values()) {
      if (!this.matchesEvent(target.events, event)) continue;
      deliveries.push(this.deliver(target, event, body, payload.id));
    }

    await Promise.allSettled(deliveries);
  }

  private matchesEvent(subscribed: string[] | undefined, event: string): boolean {
    if (!subscribed || subscribed.length === 0) return true;
    return subscribed.includes('*') || subscribed.includes(event);
  }

  private async deliver(
    target: WebhookTarget,
    event: string,
    body: string,
    deliveryId: string
  ): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': event,
      'X-Webhook-Delivery': deliveryId,
    };

    if (target.secret) {
      headers['X-Webhook-Signature'] = signWebhookPayload(body, target.secret);
    }

    try {
      const res = await this.fetcher(target.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(target.timeoutMs ?? this.defaultTimeoutMs),
      });
      if (!res.ok) {
        this.onError?.(target.url, event, new Error(`HTTP ${res.status}`));
      }
    } catch (err) {
      this.onError?.(target.url, event, err);
    }
  }
}
