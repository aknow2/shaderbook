# AI chat standalone server specification

## Goal

Move the existing AI chat HTTP API out of Vite middleware and into a standalone Express server without changing browser-visible API contracts, stored data, or WGSL execution.

## Runtime behavior

- `npm run dev` starts the Express API server and Vite frontend together.
- During development, Vite proxies `/api/ai-chat/*` to Express so the browser keeps using same-origin relative URLs.
- `npm run build` produces the existing frontend assets and an executable Node server bundle.
- `npm start` serves both `dist/` and `/api/ai-chat/*` from one loopback-only Express process.
- The server binds to `127.0.0.1`. External network binding is not configurable.

## Preserved contracts

- `POST /api/ai-chat/messages` and `POST /api/ai-chat/cancel` keep their current request, response, status, timeout, and error behavior.
- `src/aiChat/types.ts` remains the shared browser/server contract.
- CLI executables, arguments, sandboxing, cancellation, and timeout ownership remain server-controlled.
- Chat remains memory-only. Shader drafts remain in browser localStorage and downloads remain local.
- Proposed WGSL remains user-applied and explicitly compiled; the server never executes WGSL.

## Lifecycle and safety

- One request registry is owned by each server process.
- `SIGINT` and `SIGTERM` stop accepting new HTTP requests and terminate registered CLI child processes.
- Development watch restarts must not leave registered CLI children running.
- Cross-origin access is not enabled. Development access uses the Vite proxy and built access is same-origin.

## Acceptance criteria

- A real built server process returns the frontend HTML from `/`.
- The same process returns the current JSON contract from `/api/ai-chat/cancel`.
- Message success, validation, missing CLI, timeout, and cancellation tests continue to pass.
- Vite no longer installs an AI API middleware plugin.
- The frontend source and shared API types do not require changes.
- E2E, unit tests, typecheck, lint, and build pass.
