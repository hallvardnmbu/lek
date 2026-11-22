# party

Generalized Tizen TV + Phone WebSocket & Webhook foundation for building arbitrary living-room party games.

**Stack:** Bun, TypeScript, SolidJS, WebSockets, Tizen 8 (`.wgt`)

## Architecture

- [`shared/protocol.ts`](shared/protocol.ts) — Shared room, player, action, WebSocket, and webhook types.
- [`server/game.ts`](server/game.ts) — `GameDefinition` contract, `GameContext`, and `GameRegistry`.
- [`server/webhooks.ts`](server/webhooks.ts) — `WebhookManager` with HMAC-SHA256 signing (`WEBHOOK_URLS`, `WEBHOOK_SECRET`).
- [`server/roomManager.ts`](server/roomManager.ts) — Game-agnostic room lifecycle, VIP failover, timers, state versioning, and webhook emission.
- [`server/index.ts`](server/index.ts) — Bun HTTP/WebSocket server, static SPA host, and `/api/rooms/:code/events` inbound webhook endpoint.
- [`web/src/games/registry.ts`](web/src/games/registry.ts) — Frontend `GameUiDefinition` registry for pairing a `TvView` and `MobileView` per `gameId`.
- [`web/src/lib/tizen.ts`](web/src/lib/tizen.ts) — Tizen TV input/power helpers (`Return` key exit modal, screen keep-awake).

## Adding a Game

1. Add shared types in `shared/games/<id>.ts`.
2. Implement a `GameDefinition` in `server/games/<id>.ts` and register it in [`server/games/index.ts`](server/games/index.ts).
3. Implement `TvView` and `MobileView` in `web/src/games/<id>/` and register them in [`web/src/games/index.ts`](web/src/games/index.ts).

## Webhooks

- **Outbound:** Set `WEBHOOK_URLS` (comma-separated) and optionally `WEBHOOK_SECRET` (signs `X-Webhook-Signature` with `sha256=<hmac>`).
- **Inbound:** `POST /api/rooms/:code/events` (or `/api/rooms/:code/webhook`) with `{ "event": "...", "payload": ... }`, authenticated via `X-Host-Token`, `Authorization: Bearer <token>`, or `X-Webhook-Signature`.

## Development

```bash
bun install
bun run dev:server
bun run dev:web
bun test
```

## Tizen `.wgt`

```bash
bun run build:wgt
apps2samsung-cli install partygame.wgt --tv <TV_IP>
```
