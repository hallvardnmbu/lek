# AGENTS.md

## Overview

Living-room party game foundation for a **Tizen TV host** and **mobile phone controllers**.
Stack: **Bun**, **TypeScript**, **SolidJS**, **WebSockets**, **Tizen 8 (`.wgt`)**.

## Codebase Map

- `shared/protocol.ts` — Shared `RoomPhase` (`LOBBY | GAME_SELECT | PLAYING | ENDED`), `RoomState`, `GameAction`, WS message unions, and webhook types.
- `shared/games/` — Shared per-game state/view types (e.g., `shared/games/sandbox.ts`).
- `server/index.ts` — Bun HTTP/WebSocket server, static `web/dist` host, and `/api/rooms/:code/(events|webhook)` endpoint.
- `server/roomManager.ts` — Game-agnostic room lifecycle, VIP failover, timers, state versioning, and webhook emission.
- `server/game.ts` — `GameDefinition`, `GameContext`, and `GameRegistry`.
- `server/games/` — Server game implementations, registered in `server/games/index.ts` (`createGameRegistry`).
- `server/webhooks.ts` — `WebhookManager` with HMAC-SHA256 signing/verification.
- `web/src/pages/` — `Home.tsx`, `TvHost.tsx`, `MobilePlay.tsx`.
- `web/src/components/tv/` & `web/src/components/mobile/` — Shared phase views (`Lobby`, `GameSelector`, `Ended`, `GameFallback`, `TvExitModal`).
- `web/src/games/` — `registry.ts` (`GameUiDefinition`, `registerGameUi`), `index.ts`, and per-game UI modules (e.g., `web/src/games/sandbox/`).
- `web/src/lib/` — `ws.ts` (`createGameSocket`), `dpad.ts` (`createDpadNav`), `tizen.ts` (Return key, keep-awake, exit).
- `tizen/` — Tizen `.wgt` wrapper (`config.xml`, `index.html`, `build.sh`).

### Adding a Game

1. Types in `shared/games/<id>.ts`.
2. `GameDefinition` in `server/games/<id>.ts`, registered in `server/games/index.ts`.
3. `TvView` + `MobileView` in `web/src/games/<id>/`, registered in `web/src/games/index.ts`.

## Commands

- `bun run dev:server` — Start Bun server (`--watch`)
- `bun run dev:web` — Start Vite dev server
- `bun run build:web` — Build `web/dist`
- `bun test` — Run `server/roomManager.test.ts`
- `bun run build:wgt` — Package `tizen/partygame.wgt`

## Engineering Principles

- **No code comments:** Write self-explanatory code; do not add inline or block comments.
- **Bare-minimum & simple:** Build only what is needed. Avoid speculative abstractions, unused options, and over-engineering.
- **Modular & scoped:** Keep files small, self-contained, and single-purpose. Avoid god-files.
- **No repeated code:** Be critical of duplication—extract shared helpers or parameterize variants cleanly.
- **Agile refactoring:** Refactor freely when it reduces overall complexity and improves agility.
- **Consistent style:** Match existing TypeScript, SolidJS, and CSS conventions across files.
- **GPU-weak Tizen TV target:** Keep TV UI and CSS lightweight—no heavy animations, blurs, shadows, or fancy visual effects. Ensure TV views work with D-pad navigation (`createDpadNav`).
- **Avoid updating the Tizen build (`tizen/` / `build:wgt`):** Only modify or rebuild it when absolutely necessary, and give a short, clear explanation of why.
- **Minimal, functional tests:** Test real behavior and state transitions only where necessary (e.g., room/game lifecycle, actions, webhooks), not trivial UI/string presence checks.
