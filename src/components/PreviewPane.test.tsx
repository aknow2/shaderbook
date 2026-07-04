import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultShader } from '../constants/defaultShader'
import { PreviewPane } from './PreviewPane'

type ResizeCallback = ResizeObserverCallback

class MockResizeObserver {
  static instances: MockResizeObserver[] = []

  callback: ResizeCallback
  disconnect = vi.fn()
  observe = vi.fn()

  constructor(callback: ResizeCallback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }
}

function installRafMock() {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId
    nextId += 1
    callbacks.set(id, callback)
    return id
  })
  const cancelAnimationFrame = vi.fn((id: number) => {
    callbacks.delete(id)
  })
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

  return { requestAnimationFrame, cancelAnimationFrame }
}

function setNavigatorGpu(gpu: unknown) {
  Object.defineProperty(navigator, 'gpu', {
    configurable: true,
    value: gpu,
  })
}

function createDeferredLostInfo() {
  let resolve!: (info: GPUDeviceLostInfo) => void
  const promise = new Promise<GPUDeviceLostInfo>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

function createWebGpuMock() {
  const lost = createDeferredLostInfo()
  const context = {
    configure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({
      createView: vi.fn(() => ({ label: 'view' })),
    })),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as GPUCanvasContext,
  )

  const createShaderModule = vi.fn(() => ({
    getCompilationInfo: vi.fn().mockResolvedValue({ messages: [] }),
  }))
  const createRenderPipelineAsync = vi.fn(() =>
    Promise.resolve({
      getBindGroupLayout: vi.fn(() => ({ label: 'bind group layout' })),
    }),
  )
  const device = {
    createBuffer: vi.fn(() => ({ label: 'uniform buffer' })),
    createShaderModule,
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn(() => Promise.resolve(null)),
    createRenderPipelineAsync,
    createBindGroup: vi.fn(() => ({ label: 'bind group' })),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: vi.fn(() => ({
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        draw: vi.fn(),
        end: vi.fn(),
      })),
      finish: vi.fn(() => ({ label: 'command buffer' })),
    })),
    queue: {
      writeBuffer: vi.fn(),
      submit: vi.fn(),
    },
    destroy: vi.fn(),
    lost: lost.promise,
  }
  const adapter = {
    info: { description: 'Mock GPU' },
    requestDevice: vi.fn(() => Promise.resolve(device)),
  }
  const gpu = {
    requestAdapter: vi.fn(() => Promise.resolve(adapter)),
    getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm'),
  }
  setNavigatorGpu(gpu)

  return { gpu, adapter, device, context, createShaderModule, createRenderPipelineAsync, lost }
}

function renderPreview(overrides?: Partial<React.ComponentProps<typeof PreviewPane>>) {
  return render(
    <PreviewPane
      code={defaultShader}
      shouldCompile={false}
      onCompileSuccess={vi.fn()}
      onCompileError={vi.fn()}
      onFpsChange={vi.fn()}
      onResolutionChange={vi.fn()}
      onGpuInfo={vi.fn()}
      {...overrides}
    />,
  )
}

describe('PreviewPane WebGPU integration', () => {
  beforeEach(() => {
    MockResizeObserver.instances = []
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    vi.spyOn(performance, 'now').mockReturnValue(0)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('shows the spec message when WebGPU is unsupported', async () => {
    setNavigatorGpu(undefined)
    installRafMock()

    renderPreview()

    const message = await screen.findByText(
      'WebGPU is not supported in this browser. Please use a browser that supports WebGPU.',
    )
    expect(message).toBeInTheDocument()
    expect(message).toHaveTextContent(
      'WebGPU is not supported in this browser.\nPlease use a browser that supports WebGPU.',
      { normalizeWhitespace: false },
    )
  })

  it('compiles once and starts one render loop under React StrictMode', async () => {
    const raf = installRafMock()
    const gpu = createWebGpuMock()
    const onCompileSuccess = vi.fn()

    render(
      <StrictMode>
        <PreviewPane
          code={defaultShader}
          shouldCompile={false}
          onCompileSuccess={onCompileSuccess}
          onCompileError={vi.fn()}
          onFpsChange={vi.fn()}
          onResolutionChange={vi.fn()}
          onGpuInfo={vi.fn()}
        />
      </StrictMode>,
    )

    await waitFor(() => expect(onCompileSuccess).toHaveBeenCalledTimes(1))
    expect(gpu.createShaderModule).toHaveBeenCalledTimes(1)
    expect(gpu.createRenderPipelineAsync).toHaveBeenCalledTimes(1)
    expect(raf.requestAnimationFrame).toHaveBeenCalledTimes(1)
  })

  it('cleans up animation frame, observer, and device on unmount', async () => {
    const raf = installRafMock()
    const gpu = createWebGpuMock()
    const { unmount } = renderPreview()

    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalledTimes(1))
    const observer = MockResizeObserver.instances[0]

    unmount()

    expect(raf.cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
    expect(gpu.device.destroy).toHaveBeenCalledTimes(1)
  })

  it('updates canvas size with devicePixelRatio and reports resolution on resize', async () => {
    installRafMock()
    const gpu = createWebGpuMock()
    const onResolutionChange = vi.fn()
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2,
    })

    renderPreview({ onResolutionChange })
    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalledTimes(1))
    const canvas = screen.getByLabelText('WebGPU shader preview') as HTMLCanvasElement
    const observer = MockResizeObserver.instances[0]

    act(() => {
      observer.callback(
        [
          {
            contentRect: { width: 320, height: 180 },
          } as ResizeObserverEntry,
        ],
        observer as unknown as ResizeObserver,
      )
    })

    expect(canvas.width).toBe(640)
    expect(canvas.height).toBe(360)
    expect(onResolutionChange).toHaveBeenLastCalledWith(640, 360)
  })

  it('renders an accessible Fit scale menu with Fit as the only option', () => {
    setNavigatorGpu(undefined)
    installRafMock()

    renderPreview()

    const scaleMenu = screen.getByRole('combobox', { name: 'Preview scale' })
    const options = screen.getAllByRole('option')

    expect(scaleMenu).toHaveAttribute('aria-label', 'Preview scale')
    expect(scaleMenu).toHaveValue('fit')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Fit')
    expect(options[0]).toHaveValue('fit')

    fireEvent.change(scaleMenu, { target: { value: 'fit' } })
    expect(scaleMenu).toHaveValue('fit')
  })

  it('requests fullscreen on the preview frame when the fullscreen button is clicked', () => {
    setNavigatorGpu(undefined)
    installRafMock()
    const requestFullscreen = vi.fn(function (this: HTMLElement) {
      return Promise.resolve(this)
    })
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })

    const { container } = renderPreview()

    fireEvent.click(screen.getByRole('button', { name: 'Enter fullscreen preview' }))

    const previewFrame = container.querySelector('.canvas-frame')
    expect(requestFullscreen).toHaveBeenCalledTimes(1)
    expect(requestFullscreen.mock.contexts[0]).toBe(previewFrame)
  })

  it('exits fullscreen and switches the button name after fullscreenchange', () => {
    setNavigatorGpu(undefined)
    installRafMock()
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: vi.fn(() => Promise.resolve()),
    })
    const exitFullscreen = vi.fn(() => Promise.resolve())
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    })

    const { container } = renderPreview()
    const previewFrame = container.querySelector('.canvas-frame')

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: previewFrame,
    })
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })

    const fullscreenButton = screen.getByRole('button', { name: 'Exit fullscreen preview' })
    expect(fullscreenButton).toHaveTextContent('Exit fullscreen')

    fireEvent.click(fullscreenButton)
    expect(exitFullscreen).toHaveBeenCalledTimes(1)
  })

  it('exposes the preview controls with accessible names', () => {
    setNavigatorGpu(undefined)
    installRafMock()

    renderPreview()

    expect(screen.getByRole('combobox', { name: 'Preview scale' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Enter fullscreen preview' }),
    ).toBeInTheDocument()
  })

  it('recompiles on every shouldCompile toggle, including a second Run', async () => {
    installRafMock()
    const gpu = createWebGpuMock()
    const onCompileSuccess = vi.fn()
    const props = {
      code: defaultShader,
      onCompileSuccess,
      onCompileError: vi.fn(),
      onFpsChange: vi.fn(),
      onResolutionChange: vi.fn(),
      onGpuInfo: vi.fn(),
    }
    const { rerender } = render(
      <PreviewPane {...props} shouldCompile={false} />,
    )

    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalledTimes(1))

    rerender(<PreviewPane {...props} shouldCompile />)
    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalledTimes(2))

    rerender(<PreviewPane {...props} shouldCompile={false} />)
    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalledTimes(3))
    expect(onCompileSuccess).toHaveBeenCalledTimes(3)
  })

  it('ignores destroyed device lost reasons without showing a message', async () => {
    installRafMock()
    const gpu = createWebGpuMock()

    renderPreview()
    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalledTimes(1))

    await act(async () => {
      gpu.lost.resolve({ reason: 'destroyed', message: '' } as GPUDeviceLostInfo)
    })

    expect(screen.queryByText('GPU device was lost. Please reload the page.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('WebGPU shader preview')).toBeInTheDocument()
  })

  it('shows device lost message and stops the render loop for non-destroyed reasons', async () => {
    const raf = installRafMock()
    const gpu = createWebGpuMock()

    renderPreview()
    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalledTimes(1))

    await act(async () => {
      gpu.lost.resolve({ reason: 'unknown', message: '' } as GPUDeviceLostInfo)
    })

    expect(screen.getByText('GPU device was lost. Please reload the page.')).toBeInTheDocument()
    expect(raf.cancelAnimationFrame).toHaveBeenCalledTimes(1)
  })
})
