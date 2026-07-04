# WGSL Shader Playground

A React + TypeScript + Vite playground for writing WGSL shader code and previewing it with WebGPU.

## Development

```sh
npm install
npm run dev
```

## Shader Uniforms

The app provides `time` and `resolution` through a WebGPU uniform buffer, but the MVP wrapper does not inject uniform declarations automatically.

To use those values, keep these declarations in the shader code:

```wgsl
struct Uniforms {
  time: f32,
  resolution: vec2f,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;
```

Removing them means `uniforms.time` and `uniforms.resolution` are not available to `mainImage`.
