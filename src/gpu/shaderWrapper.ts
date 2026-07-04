export type ShaderWrapperInput = {
  userCode: string
}

export type ShaderWrapperOutput = {
  wgsl: string
}

const wrapper = `
struct VertexOutput {
  @builtin(position) position: vec4f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );

  var output: VertexOutput;
  output.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  return output;
}

@fragment
fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
  return mainImage(position.xy);
}
`

export function wrapShader({ userCode }: ShaderWrapperInput): ShaderWrapperOutput {
  if (userCode.trim().length === 0) {
    throw new Error('Shader code is empty')
  }

  if (!userCode.includes('mainImage')) {
    throw new Error('mainImage function not found')
  }

  return { wgsl: `${userCode}\n${wrapper}` }
}
