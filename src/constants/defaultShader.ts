export const defaultShader = `// Shaderbook
// To use time and resolution, keep the struct Uniforms declaration and the @group(0) @binding(0) uniform binding in this code.

struct Uniforms {
  time: f32,
  resolution: vec2f,
}

@group(0) @binding(0)
var<uniform> uniforms: Uniforms;

fn palette(t: f32) -> vec3f {
  let a = vec3f(0.5, 0.5, 0.5);
  let b = vec3f(0.5, 0.5, 0.5);
  let c = vec3f(1.0, 1.0, 1.0);
  let d = vec3f(0.00, 0.33, 0.67);

  return a + b * cos(6.28318 * (c * t + d));
}

fn mainImage(fragCoord: vec2f) -> vec4f {
  let uv = (fragCoord / uniforms.resolution) * 2.0 - vec2f(1.0, 1.0);
  let aspect = uniforms.resolution.x / uniforms.resolution.y;
  let p = vec2f(uv.x * aspect, uv.y);

  let r = length(p);
  let a = atan2(p.y, p.x);
  let wave = sin(12.0 * r - uniforms.time * 2.0 + a * 3.0);

  let color = palette(r + wave * 0.1 + uniforms.time * 0.05);
  let vignette = 1.0 - smoothstep(0.6, 1.5, r);

  return vec4f(color * vignette, 1.0);
}
`
