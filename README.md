# Shaderbook

Shaderbook is a React + TypeScript + Vite playground for writing WGSL shaders in the browser and previewing the result with WebGPU.

Edit `shader.wgsl` on the left, then inspect the live or flipbook preview on the right. The app also includes an AI chat panel powered by Codex CLI or Claude CLI for explaining the current WGSL code and generating shader edits.

## Features

- WGSL code editing
- CodeMirror-based editor with line numbers and syntax highlighting
- Real-time WebGPU preview
- `time` and `resolution` uniforms
- Run, Reset, and Save actions
- Compile status, FPS, resolution, GPU, and backend display
- Live and Flipbook preview modes
- Flipbook frame count, frame interval, and start time controls
- Flipbook frame export as PNG files
- AI chat with Codex CLI or Claude CLI
- Apply AI-generated WGSL edits back into the editor

## Requirements

- Node.js
- npm
- A browser with WebGPU support
  - Chrome or Edge, for example
- Optional, for AI Chat
  - `codex` CLI
  - `claude` CLI

If the browser does not support WebGPU, the preview pane shows an unsupported-browser message.

## Setup

```sh
npm install
```

## Development

```sh
npm run dev
```

This starts the loopback Express API server and the Vite frontend together. Open the URL displayed by Vite in a browser with WebGPU support.

Vite proxies `/api/ai-chat/*` to Express during development. The API implementation itself does not run inside Vite.

To run the built frontend and API from one local server:

```sh
npm run build
npm start
```

The server binds to `127.0.0.1` and is not intended for external deployment.

## Commands

```sh
npm run dev
npm run build
npm run start
npm run preview
npm run test
npm run test:e2e
npm run typecheck
npm run lint
```

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Express API and Vite frontend in watch mode |
| `npm run build` | Typecheck and build the frontend and Node server |
| `npm run start` | Serve the built frontend and API on loopback |
| `npm run preview` | Start the built local server |
| `npm run test` | Run Vitest |
| `npm run test:e2e` | Build and test the real server and development proxy processes |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run oxlint |

## Usage

1. Edit WGSL code in the Editor pane.
2. Press `Run` to compile the current code and update the Preview pane.
3. Press `Reset` to restore the default shader.
4. Press `Save` to download the current WGSL code as `shader.wgsl`.
5. Switch the Preview mode between `Live` and `Flipbook`.
6. In Flipbook mode, adjust `Frames`, `Interval ms`, and `Start ms`.
7. In Flipbook mode, press `Download PNGs` to export each frame as a PNG file.

Keyboard shortcuts:

| Shortcut | Action |
| --- | --- |
| `Ctrl+Enter` / `Cmd+Enter` | Run |
| `Ctrl+S` / `Cmd+S` | Save |

AI Chat:

1. Select an Agent, Model, and Performance setting in the AI Chat panel.
2. Ask a question or request an edit for the current WGSL code.
3. Press `Send` to run the selected CLI.
4. If the assistant returns a code edit, press `Apply` to copy it into the editor.
5. Press `Cancel` to stop an in-flight request.

## WGSL Entry Point

Shaderbook expects user code to define `mainImage(fragCoord: vec2f) -> vec4f`. The app wraps that function with the vertex and fragment entry points needed to run it in WebGPU.

```wgsl
fn mainImage(fragCoord: vec2f) -> vec4f {
  let uv = fragCoord / uniforms.resolution;
  return vec4f(uv, 0.5 + 0.5 * sin(uniforms.time), 1.0);
}
```

## Shader Uniforms

To use `time` and `resolution`, keep the following declarations in the shader code:

```wgsl
struct Uniforms {
  time: f32,
  resolution: vec2f,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;
```

| Uniform | Type | Description |
| --- | --- | --- |
| `uniforms.time` | `f32` | Elapsed time. In Live mode this is animation time; in Flipbook mode this is the frame time. |
| `uniforms.resolution` | `vec2f` | The current render area width and height. |

If these declarations are removed, `uniforms.time` and `uniforms.resolution` are not available to `mainImage`.

## AI Chat Notes

AI Chat sends the full current WGSL code and recent chat history to the selected CLI, then expects a JSON response back from the agent.

- Codex CLI runs as `codex exec --sandbox read-only`.
- Claude CLI runs as `claude --print --output-format text --no-session-persistence --safe-mode --tools ''`.
- If the selected CLI is not available in `PATH`, the chat panel shows an error.
- AI-generated code is not applied automatically. It is copied into the editor only after pressing `Apply`.

## Project Structure

```text
src/
  aiChat/       AI Chat client state and shared types
  components/   React UI components
  constants/    Default WGSL shader
  editor/       WGSL editor language support
  gpu/          WebGPU context, pipeline, render loop, flipbook rendering
server/
  app.ts        Express app and static frontend serving
  index.ts      Loopback listener and graceful shutdown
  aiChat/       API routing, validation, and CLI runners
specs/          Product specs, plans, and task notes
public/         favicon and shared SVG icons
```

## Browser Support

Shaderbook depends on WebGPU. Shader preview does not run in browsers where WebGPU is disabled or unsupported. Use a WebGPU-capable browser such as Chrome or Edge.

## License

Shaderbook is licensed under the GNU Affero General Public License v3.0 only. See [LICENSE](LICENSE) for the full license text.
