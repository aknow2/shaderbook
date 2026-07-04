export type WebGPUContext = {
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
  adapterInfo?: GPUAdapterInfo
}

export async function createWebGPUContext(canvas: HTMLCanvasElement): Promise<WebGPUContext> {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported in this browser')
  }

  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) {
    throw new Error('No suitable GPU adapter found')
  }

  const device = await adapter.requestDevice()
  const context = canvas.getContext('webgpu') as GPUCanvasContext | null
  if (!context) {
    throw new Error('Unable to create WebGPU canvas context')
  }

  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
  })

  return {
    device,
    context,
    format,
    adapterInfo: adapter.info,
  }
}
