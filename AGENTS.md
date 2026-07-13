# Shaderbook: AI implementation guide

This file is the starting point for AI agents working in this repository. Read it before changing code. It describes the current implementation; the older documents under `specs/` also preserve feature requirements and design decisions.

## 0. Project working agreement (loop engineering)

### Mission

このリポジトリでは、1回の反復につき1つの原因だけを修正する。
大規模な一括変更より、検証可能な小さな変更を優先する。

### Required workflow

コードを変更する前に:

1. 対象Issue、仕様(`specs/`)、関連コードを読む。
2. 変更箇所に最も近いVitestファイルと品質ゲート(`npm run test`、`npm run typecheck`、`npm run lint`)を実行してベースラインを取得する。
3. `.loop/STATE.md` に原因仮説を書く。ファイルが存在しない場合は最初の反復時に作成する(`.loop/` はgit管理外のworking memory)。

コードを変更した後に:

1. 変更箇所に最も近いテストを実行する。
2. 品質ゲート(`npm run test`、`npm run typecheck`、`npm run lint`)を実行する。
3. 評価結果と次の仮説を `.loop/STATE.md` に追記する。
4. 変更が悪化を起こした場合は、その変更を残す理由を説明する。

### Definition of done (per iteration)

以下をすべて満たすこと(変更全体の完了条件はセクション11も参照):

- 対象不具合を再現するテストが存在する
- 再現テストが成功する
- 単体テストが成功する
- lintが成功する
- 型チェックが成功する
- 関係のない差分がない
- 残存リスクが `.loop/STATE.md` に記録されている

### Safety boundaries

明示的な許可がない限り、以下を行わない:

- 公開API・共有コントラクトの変更(`src/aiChat/types.ts`、WGSL/バインディング契約など)
- 本番依存関係の追加
- データ削除または不可逆なマイグレーション
- 認証・認可方式の変更
- シークレットの読み取りまたは出力
- force push
- mainブランチへの直接commit

## 1. Product summary

Shaderbook is a desktop-oriented WGSL playground built with React, TypeScript, Vite, CodeMirror, and WebGPU. A user edits one shader, explicitly runs it, and views the result either as a live animation or as a flipbook. The app can save WGSL, export flipbook cells as PNGs, record a live preview as WebM, and ask a locally installed Codex or Claude CLI for explanations or a replacement shader.

The application is deliberately local-first:

- the shader draft is versioned in browser `localStorage`; chat state lives only in memory;
- Save/export/record actions create local downloads;
- there is no account, database, cloud persistence, sharing, or externally deployed API server;
- AI chat runs through a loopback-only Express server during development or local built execution.

## 2. Sources of truth

Use this precedence when sources disagree:

1. Current code and tests describe existing behavior.
2. The relevant feature `spec.md` describes accepted product behavior.
3. The feature `plan.md` explains intended architecture and tradeoffs.
4. The feature `task.md` is historical implementation tracking, not a live backlog.
5. `README.md` is the user-facing setup and usage summary.

Feature documents:

| Area | Documents |
| --- | --- |
| Base editor and WebGPU preview | `specs/spec.md`, `specs/plan.md`, `specs/task.md` |
| Flipbook mode | `specs/flipbook/` |
| AI chat | `specs/ai-chat/` |
| AI CLI/model selection | `specs/ai-chat-cli-selection/` |
| Standalone AI chat server | `specs/ai-chat-standalone-server/` |
| Live recording and aspect ratio | `specs/live-recording-aspect-ratio/` |

Some plans predate later features. Do not remove a current capability merely because the base plan does not mention it. When adding a feature, update its spec/plan/task set and this guide if it changes a cross-cutting contract.

## 3. Commands and quality gate

```sh
npm install
npm run dev
npm run start
npm run test
npm run test:e2e
npm run typecheck
npm run lint
npm run build
```

For normal changes, run the closest Vitest file while iterating, then run `npm run test`, `npm run typecheck`, and `npm run lint`. Run `npm run build` for changes affecting bundling, Vite integration, or release readiness. WebGPU, fullscreen, downloads, canvas capture, MediaRecorder, and real CLI execution also need manual browser checks because jsdom tests use mocks.

The repository may already contain uncommitted user work. Inspect `git status` and the relevant diff first; preserve unrelated modifications.

## 4. Architecture at a glance

```text
Browser (React)
  App.tsx                         state owner and feature composition
    components/EditorPane        controlled CodeMirror editor
    components/PreviewPane       WebGPU lifecycle and preview controls
      gpu/*                       framework-independent GPU helpers
    components/ChatPanel         chat UI and request lifecycle
      aiChat/client.ts            HTTP client
      aiChat/state.ts             pure state/validation helpers
      aiChat/types.ts             browser/server API contract
          |
          | POST /api/ai-chat/*
          v
Loopback Express server
  server/index.ts                 listener and graceful shutdown
    server/app.ts                 Express app, API mount, static frontend
      aiChat/router.ts            Express routing boundary
      aiChat/handler.ts           HTTP validation and response mapping
      aiChat/aiAgentRunner.ts     agent dispatch
        aiChat/codexRunner.ts     fixed Codex CLI invocation
        aiChat/claudeRunner.ts    fixed Claude CLI invocation
      aiChat/requestRegistry.ts   timeout/cancel/process ownership
      aiChat/promptBuilder.ts     constrained WGSL prompt
      aiChat/parseAiOutput.ts     common JSON response validation
```

There is no router or external state library. `App.tsx` owns state shared across panes; components own local UI and resource-lifecycle state. Pure calculations and protocol rules belong outside components so they can be tested without rendering.

## 5. Directory responsibilities

- `src/App.tsx`: top-level state, header actions, keyboard shortcuts, resizable editor/preview/chat layout, and callbacks between features.
- `src/components/`: UI boundaries. Keep components controlled when their state affects another part of the app.
- `src/gpu/`: WebGPU context, shader wrapping/compilation, uniforms, live rendering, and flipbook rendering. Keep DOM/React concerns out where possible.
- `src/aiChat/`: shared API types, client-side validation/state helpers, and fetch client. `types.ts` is imported by both browser and server.
- `src/editor/`: CodeMirror WGSL language support.
- `src/constants/`: default user shader.
- `server/app.ts` and `server/index.ts`: loopback Express app, built frontend serving, listener, and shutdown lifecycle.
- `server/aiChat/`: Express API routing, HTTP validation, and subprocess integration.
- `specs/`: requirements, architectural plans, and implementation task records by feature.
- `public/`: static assets copied by Vite.

Tests are colocated as `*.test.ts` or `*.test.tsx`. Test externally visible behavior and resource cleanup, not private React implementation details.

## 6. Core frontend state and flows

### Editing and compiling

`code` is the editable source. Typing does not compile. `Run` changes a compile trigger owned by `App`; `PreviewPane` reads the latest code from a ref and compiles only on that trigger. This distinction is a product contract, so do not add `code` as an effect dependency that recompiles on every keystroke.

Reset restores `defaultShader`; Save downloads the current text as `shader.wgsl`. `Cmd/Ctrl+Enter` runs and `Cmd/Ctrl+S` saves. Chat input handles its own keyboard events so shortcuts must not accidentally submit and run simultaneously.

Compilation is transactional: create and validate a new shader module/pipeline first, then replace the active pipeline only on success. A compile error is shown while the last valid rendering remains available.

### Preview modes

`PreviewMode` is `live | flipbook`.

- Live uses `requestAnimationFrame`, updating time and resolution uniforms per frame. Playback can loop or render once.
- Flipbook computes a near-square grid, renders all requested timestamps in one canvas, labels cells in the UI, and can crop/download each cell as PNG.
- Aspect ratio is `fit | 1:1 | 16:9 | 9:16`. Fixed ratios letterbox inside the available frame; the canvas drawing buffer and `uniforms.resolution` match the visible canvas, not the outer stage.
- Live recording uses `canvas.captureStream()` and `MediaRecorder`, is limited to live mode, and downloads WebM after a successful stop.

Changing mode, recompiling, resizing, entering fullscreen, recording, and unmounting can overlap. Use generation/sequence guards for async work, cancel pending animation frames, and release stale GPU/MediaRecorder resources. Do not let an older async compile or render overwrite a newer one.

### Layout

The editor/preview split and optional chat panel are resized in `App.tsx`. Preserve pointer capture, min-width constraints, keyboard-operable separators, and ARIA values. When adding controls, keep the main workspace usable at constrained desktop widths; mobile optimization is not currently a product goal.

## 7. WGSL and WebGPU contracts

User code must define:

```wgsl
fn mainImage(fragCoord: vec2f) -> vec4f
```

`src/gpu/shaderWrapper.ts` appends/provides the host vertex and fragment entry points around this function. User code normally declares the following binding when it needs time or resolution:

```wgsl
struct Uniforms {
  time: f32,
  resolution: vec2f,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;
```

Binding/layout assumptions are cross-file contracts shared by the wrapper, pipeline creation, uniform buffers, live rendering, and flipbook rendering. If a binding or uniform layout changes, update all of them and their tests together. Respect WebGPU alignment (`minUniformBufferOffsetAlignment`) when using dynamic offsets.

Important lifecycle rules:

- configure the canvas using the preferred WebGPU format;
- size the drawing buffer from CSS size and device pixel ratio;
- validation errors must become useful compile messages;
- stop render loops before replacing/destroying their resources;
- destroy buffers and devices and disconnect observers during cleanup;
- handle device loss and avoid further rendering through a lost device;
- effects must remain safe under React development remount/setup-cleanup cycles.

Keep GPU math and allocation helpers pure or dependency-injected enough to unit test with small GPU mocks.

## 8. AI chat contract

The browser calls:

- `POST /api/ai-chat/messages` to send the message, full current WGSL, recent history, selection, request ID, and an optional Codex session ID;
- `POST /api/ai-chat/cancel` to cancel by request ID.

`src/aiChat/types.ts` is the canonical cross-boundary schema. Any request/response change must be made end-to-end: shared types and normalization, client, handler, panel/state, relevant runner, tests, and feature spec. Preserve length/history limits and keep client and server timeouts intentionally ordered.

The selected agent is mapped to a fixed executable and fixed argument templates in `server/aiChat/agentConfig.ts`. Never accept an executable, raw argv, shell fragment, or working directory from the HTTP request. Subprocesses must be spawned without a shell. Codex runs read-only; Claude runs without tools. The request registry owns cancellation and must unregister every completed, failed, timed-out, or canceled process.

The agent is instructed to return one JSON object:

```json
{
  "message": "Japanese response",
  "proposedCode": "complete WGSL source or null",
  "notes": ["optional note"]
}
```

Parse and validate the structure before returning it. Never apply proposed code automatically: the user must press Apply. Apply updates the editor and deliberately triggers compilation as one explicit user action. Chat history is bounded and non-persistent. A Codex session ID is valid only for Codex; changing agents must not leak incompatible session state.

Vite does not own the API implementation. During `npm run dev`, it proxies `/api/ai-chat/*` to the loopback Express server. `npm run build` emits both frontend assets and a Node server bundle; `npm start` serves them from one local same-origin process. External deployment, authentication, and non-loopback binding remain separate architectural decisions.

## 9. Implementation patterns

Follow these patterns when extending the project:

1. Define user-visible behavior and edge cases in a feature spec.
2. Put shared domain types in the narrowest stable module (`src/types`, feature types, or the cross-boundary AI types).
3. Extract normalization, layout math, mappings, and parsing into pure functions.
4. Keep orchestration and browser-resource ownership in the component that creates the resource.
5. Pass shared changes upward through callbacks; avoid module-level mutable UI state.
6. Implement resource cleanup and stale-async protection at the same time as the happy path.
7. Add focused unit/component tests next to the changed module, including failure and cleanup cases.
8. Update README only for user-facing setup/usage changes; update this file for architectural conventions.

Prefer discriminated string unions over booleans when a state has more than two meaningful phases. Normalize numeric text input at an explicit commit boundary so users can temporarily type incomplete values. Preserve the last known-good resource when replacement can fail. Keep user-triggered downloads in small helpers and always revoke object URLs.

Avoid:

- automatic shader compilation caused by editor state changes;
- duplicating API literals or model mappings in multiple layers;
- React components that contain otherwise reusable protocol or GPU calculations;
- state updates from stale promises after a newer request or unmount;
- shell-based CLI execution or request-controlled CLI arguments;
- tests that only cover success while omitting cleanup, cancellation, validation, or unsupported-browser paths;
- broad formatting/refactors mixed into a focused feature change.

## 10. Testing map

- Component behavior and accessibility: `src/components/*.test.tsx`, `src/App.test.tsx`.
- WGSL editor language: `src/editor/wgslLanguage.test.ts`.
- Shader wrapper, pipeline validation, buffers, render loop, flipbook grid/resources: `src/gpu/*.test.ts`.
- Flipbook input/export: `src/flipbookSettings.test.ts`, `src/flipbookExport.test.ts`.
- AI selection, validation, history, client behavior: `src/aiChat/*.test.ts`.
- HTTP validation, Express routing, prompt/parser, runner argv/timeout/cancel, registry, and development proxy: `server/*.test.ts`, `server/aiChat/*.test.ts`.
- Built server and Vite proxy process boundaries: `e2e/*.e2e.ts` through `npm run test:e2e`.

Mock the boundary, not the behavior under test. GPU tests should assert command/buffer interactions; runner tests should inject/mock process spawning; HTTP tests should exercise serialized request/response contracts. Use fake timers and deterministic RAF where time drives behavior. Restore globals and mocks after each test.

Manual checks for a preview-related change should cover a WebGPU-capable browser, compile success and failure, resize/fullscreen, mode switching, and cleanup after repeated actions. Recording changes need supported and unsupported MediaRecorder paths. AI changes need a missing-CLI error plus at least one real selected CLI when available.

## 11. Definition of done

A change is complete when:

- behavior matches the relevant current spec and preserves unrelated features;
- public/shared contracts and documentation are updated;
- async and browser resources have explicit cleanup;
- focused success, failure, and race/cleanup tests exist where applicable;
- tests, typecheck, lint, and the appropriate build/manual checks pass;
- no unrelated user changes were overwritten.
