# AI chat standalone server implementation plan

## Architecture

```text
development: Browser -> Vite -> /api proxy -> Express -> CLI runner
built:       Browser -> Express static/API -> CLI runner
```

Express owns API routing and the request registry. Vite is only a frontend development server and proxy. The browser continues to call relative `/api/ai-chat/*` URLs.

## Implementation sequence

1. Add a process-level E2E that proves one built process serves `/` and `/api/ai-chat/cancel`.
2. Add an Express app/router around the existing validation and runner orchestration.
3. Add the loopback server entry point and graceful shutdown of the request registry.
4. Replace the Vite plugin with a development proxy.
5. Add frontend/server build and development orchestration scripts.
6. Remove the Vite plugin and migrate its tests to Express and proxy coverage.
7. Update repository architecture documentation and run all gates.

## Dependency decision

- Add Express as the only new production dependency.
- Use development-only TypeScript execution and process orchestration packages for local watch mode.
- Use the existing Vite build tool to produce the Node server bundle.
- Use Vitest, Node `fetch`, and child processes for E2E; do not add a browser automation or HTTP assertion dependency for this backend-only migration.
