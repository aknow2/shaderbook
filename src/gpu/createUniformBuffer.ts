export const USER_UNIFORM_WRITE_SIZE = 16
export const VIEWPORT_ORIGIN_WRITE_SIZE = 8

export function createUniformBuffer(device: GPUDevice): GPUBuffer {
  return device.createBuffer({
    label: 'Shader uniforms',
    size: USER_UNIFORM_WRITE_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
}

export function writeUserUniforms(
  buffer: GPUBuffer,
  device: GPUDevice,
  offset: number,
  time: number,
  width: number,
  height: number,
) {
  device.queue.writeBuffer(buffer, offset, new Float32Array([time, 0, width, height]))
}

export function updateUniforms(
  buffer: GPUBuffer,
  device: GPUDevice,
  time: number,
  width: number,
  height: number,
) {
  writeUserUniforms(buffer, device, 0, time, width, height)
}

export function createViewportOriginBuffer(device: GPUDevice): GPUBuffer {
  return device.createBuffer({
    label: 'Viewport origin uniforms',
    size: VIEWPORT_ORIGIN_WRITE_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
}

export function writeViewportOrigin(
  buffer: GPUBuffer,
  device: GPUDevice,
  offset: number,
  x: number,
  y: number,
) {
  device.queue.writeBuffer(buffer, offset, new Float32Array([x, y]))
}

export function alignUniformStride(writeSize: number, alignment: number): number {
  return Math.ceil(writeSize / alignment) * alignment
}
