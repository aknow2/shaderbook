export function createUniformBuffer(device: GPUDevice): GPUBuffer {
  return device.createBuffer({
    label: 'Shader uniforms',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
}

export function updateUniforms(
  buffer: GPUBuffer,
  device: GPUDevice,
  time: number,
  width: number,
  height: number,
) {
  device.queue.writeBuffer(buffer, 0, new Float32Array([time, 0, width, height]))
}
