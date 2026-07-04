export type CreatePipelineInput = {
  device: GPUDevice
  format: GPUTextureFormat
  wgsl: string
  uniformBuffer: GPUBuffer
}

export type CreatePipelineOutput = {
  pipeline: GPURenderPipeline
  bindGroup: GPUBindGroup
}

function formatError(error: GPUError): Error {
  return new Error(error.message)
}

async function withValidationScope<T>(
  device: GPUDevice,
  action: () => T | Promise<T>,
): Promise<T> {
  device.pushErrorScope('validation')

  let result: T | undefined
  let actionError: unknown
  let scopeError: GPUError | null = null

  try {
    try {
      result = await action()
    } catch (error) {
      actionError = error
    }
  } finally {
    scopeError = await device.popErrorScope()
  }

  if (actionError) {
    throw actionError
  }

  if (scopeError) {
    throw formatError(scopeError)
  }

  return result as T
}

export async function createShaderPipeline({
  device,
  format,
  wgsl,
  uniformBuffer,
}: CreatePipelineInput): Promise<CreatePipelineOutput> {
  const shaderModule = device.createShaderModule({ code: wgsl })
  const compilationInfo = await shaderModule.getCompilationInfo()
  const compilationErrors = compilationInfo.messages.filter((message) => message.type === 'error')

  if (compilationErrors.length > 0) {
    throw new Error(
      `WGSL compilation failed:\n${compilationErrors.map((message) => message.message).join('\n')}`,
    )
  }

  const pipeline = await withValidationScope(device, () =>
    device.createRenderPipelineAsync({
      label: 'Shader pipeline',
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [{ format }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    }),
  )

  const bindGroupLayout = pipeline.getBindGroupLayout(0)
  const bindGroup = await withValidationScope(device, () =>
    device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    }),
  )

  return { pipeline, bindGroup }
}
