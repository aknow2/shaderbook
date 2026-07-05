import { StrictMode, type ComponentProps } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultShader } from '../constants/defaultShader'
import { initialFlipbookSettings } from '../types/preview'
import { PreviewPane } from './PreviewPane'

const renderFlipbookMocks = vi.hoisted(() => {
  const calls: any[][] = []
  const results: Array<{ value: any }> = []
  const onceImplementations: Array<(input: any) => any> = []
  let implementation: ((input: any) => any) | undefined

  const createResult = () => ({
    grid: {
      columns: 1,
      rows: 1,
      gapDevicePx: 0,
      cellWidth: 100,
      cellHeight: 100,
      cells: [
        {
          index: 0,
          row: 0,
          column: 0,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          timeSeconds: 0,
        },
      ],
    },
    resources: {
      userUniformBuffer: { destroy: vi.fn() },
      viewportOriginBuffer: { destroy: vi.fn() },
      bindGroups: [],
    },
  })

  const renderFlipbook: any = (input: any) => {
    const summarizedInput = {
      canvasWidth: input.canvasWidth,
      canvasHeight: input.canvasHeight,
      devicePixelRatio: input.devicePixelRatio,
      settings: { ...input.settings },
    }
    calls.push([summarizedInput])

    const nextImplementation = onceImplementations.shift() ?? implementation
    const result = nextImplementation ? nextImplementation(summarizedInput) : createResult()
    results.push({ value: result })
    return result
  }
  renderFlipbook.mock = { calls, results }
  renderFlipbook.mockReset = () => {
    calls.length = 0
    results.length = 0
    onceImplementations.length = 0
    implementation = undefined
  }
  renderFlipbook.mockImplementation = (nextImplementation: (input: any) => any) => {
    implementation = nextImplementation
    return renderFlipbook
  }
  renderFlipbook.mockImplementationOnce = (nextImplementation: (input: any) => any) => {
    onceImplementations.push(nextImplementation)
    return renderFlipbook
  }

  return {
    renderFlipbook,
    createResult,
    destroyFlipbookFrameResources: vi.fn((resources: any) => {
      resources?.userUniformBuffer.destroy()
      resources?.viewportOriginBuffer.destroy()
    }),
  }
})

const flipbookControlsMocks = vi.hoisted(() => ({
  commitFrameCount: (_value: string) => {},
  draftFrameCount: (_value: string) => {},
}))

vi.mock('../gpu/renderFlipbook', () => ({
  renderFlipbook: renderFlipbookMocks.renderFlipbook,
  destroyFlipbookFrameResources: renderFlipbookMocks.destroyFlipbookFrameResources,
}))

vi.mock('./FlipbookControls', async () => {
  const React = await import('react')
  const {
    normalizeFlipbookDraft,
    normalizeFlipbookSettings,
  } = await import('../flipbookSettings')

  return {
    FlipbookControls: ({ settings, draft, onDraftChange, onCommit }: any) => {
      const currentDraft = draft ?? {
        frameCount: String(settings.frameCount),
        frameIntervalMs: String(settings.frameIntervalMs),
        startTimeMs: String(settings.startTimeMs),
      }

      const commit = (nextDraft: any) => {
        const normalizedSettings = normalizeFlipbookSettings(nextDraft)
        onCommit(normalizedSettings, normalizeFlipbookDraft(normalizedSettings))
      }
      flipbookControlsMocks.commitFrameCount = (value: string) => {
        commit({ ...currentDraft, frameCount: value })
      }
      flipbookControlsMocks.draftFrameCount = (value: string) => {
        // PreviewPane's Run path reads its local draft state before compiling.
        // The real input event path is covered by FlipbookControls.test.tsx.
        const nextDraft = { ...currentDraft, frameCount: value }
        onDraftChange(nextDraft)
      }

      return React.createElement('div', { className: 'flipbook-controls' }, [
        React.createElement('input', {
          key: 'frameCount',
          type: 'number',
          'aria-label': 'Flipbook frame count',
          defaultValue: currentDraft.frameCount,
          onBlur: (event: any) => {
            commit({ ...currentDraft, frameCount: event.currentTarget.value })
          },
          onKeyDown: (event: any) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit({ ...currentDraft, frameCount: event.currentTarget.value })
            }
          },
        }),
      ])
    },
  }
})

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

  return {
    requestAnimationFrame,
    cancelAnimationFrame,
    runFrame(id?: number) {
      const frameId = id ?? Math.min(...callbacks.keys())
      const callback = callbacks.get(frameId)
      callbacks.delete(frameId)
      callback?.(0)
    },
    flushRaf() {
      this.runFrame()
    },
    getPendingCount() {
      return callbacks.size
    },
  }
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
  const buffers: any[] = []
  const renderPasses: any[] = []
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
    createBuffer: vi.fn((descriptor?: GPUBufferDescriptor) => {
      const buffer = {
        label: descriptor?.label ?? 'uniform buffer',
        destroy: vi.fn(),
      }
      buffers.push(buffer)
      return buffer
    }),
    createShaderModule,
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn(() => Promise.resolve(null)),
    createRenderPipelineAsync,
    createBindGroup: vi.fn(() => ({ label: 'bind group' })),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: vi.fn(() => {
        const pass = {
          setPipeline: vi.fn(),
          setBindGroup: vi.fn(),
          setViewport: vi.fn(),
          setScissorRect: vi.fn(),
          draw: vi.fn(),
          end: vi.fn(),
        }
        renderPasses.push(pass)
        return pass
      }),
      finish: vi.fn(() => ({ label: 'command buffer' })),
    })),
    queue: {
      writeBuffer: vi.fn(),
      submit: vi.fn(),
    },
    limits: {},
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

  return {
    gpu,
    adapter,
    buffers,
    device,
    context,
    createShaderModule,
    createRenderPipelineAsync,
    lost,
    renderPasses,
  }
}

function createMockFlipbookResult() {
  return renderFlipbookMocks.createResult()
}

function getRenderFlipbookCallCount() {
  return renderFlipbookMocks.renderFlipbook.mock.calls.length
}

function getLastRenderFlipbookInput() {
  return renderFlipbookMocks.renderFlipbook.mock.calls.at(-1)?.[0]
}

function createFailingShaderModule(message: string) {
  return {
    getCompilationInfo: vi.fn().mockResolvedValue({
      messages: [{ type: 'error', message }],
    }),
  }
}

function createPreviewProps(
  overrides?: Partial<ComponentProps<typeof PreviewPane>>,
): ComponentProps<typeof PreviewPane> {
  return {
    code: defaultShader,
    shouldCompile: false,
    previewMode: 'live',
    flipbook: initialFlipbookSettings,
    onPreviewModeChange: vi.fn(),
    onFlipbookChange: vi.fn(),
    onCompileSuccess: vi.fn(),
    onCompileError: vi.fn(),
    onFpsChange: vi.fn(),
    onResolutionChange: vi.fn(),
    onGpuInfo: vi.fn(),
    ...overrides,
  }
}

function renderPreview(overrides?: Partial<ComponentProps<typeof PreviewPane>>) {
  return render(<PreviewPane {...createPreviewProps(overrides)} />)
}

async function renderAndFlushFlipbook(overrides?: Partial<ComponentProps<typeof PreviewPane>>) {
  const raf = installRafMock()
  const gpu = createWebGpuMock()
  const props = createPreviewProps(overrides)
  const view = render(<PreviewPane {...props} previewMode="live" />)

  await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: 'Flipbook' }))

  const flipbookProps = { ...props, previewMode: 'flipbook' as const }
  view.rerender(<PreviewPane {...flipbookProps} />)
  act(() => {
    raf.flushRaf()
  })

  return { ...view, raf, gpu, props: flipbookProps }
}

describe('PreviewPane WebGPU integration', () => {
  beforeEach(() => {
    MockResizeObserver.instances = []
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 1,
    })
    vi.spyOn(performance, 'now').mockReturnValue(0)
    renderFlipbookMocks.renderFlipbook.mockReset()
    renderFlipbookMocks.renderFlipbook.mockImplementation(() => createMockFlipbookResult())
    renderFlipbookMocks.destroyFlipbookFrameResources.mockClear()
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
          previewMode="live"
          flipbook={initialFlipbookSettings}
          onPreviewModeChange={vi.fn()}
          onFlipbookChange={vi.fn()}
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

    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalled())
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
    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalled())
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

  it('starts in live mode without flipbook controls or flipbook draw work', async () => {
    const raf = installRafMock()
    const gpu = createWebGpuMock()

    renderPreview()

    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalled())
    expect(screen.getByLabelText('WebGPU shader preview')).toBeInTheDocument()
    expect(screen.queryByLabelText('Flipbook frame count')).not.toBeInTheDocument()
    expect(raf.requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(gpu.device.queue.submit).not.toHaveBeenCalled()
  })

  it('stops the live render loop and draws the flipbook once when switching to flipbook mode', async () => {
    const raf = installRafMock()
    const gpu = createWebGpuMock()
    const onPreviewModeChange = vi.fn()

    const { rerender } = renderPreview({ onPreviewModeChange })
    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Flipbook' }))
    rerender(
      <PreviewPane
        code={defaultShader}
        shouldCompile={false}
        previewMode="flipbook"
        flipbook={initialFlipbookSettings}
        onPreviewModeChange={onPreviewModeChange}
        onFlipbookChange={vi.fn()}
        onCompileSuccess={vi.fn()}
        onCompileError={vi.fn()}
        onFpsChange={vi.fn()}
        onResolutionChange={vi.fn()}
        onGpuInfo={vi.fn()}
      />,
    )

    expect(onPreviewModeChange).toHaveBeenCalledWith('flipbook')
    expect(raf.cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(raf.getPendingCount()).toBe(1)

    act(() => {
      raf.flushRaf()
    })

    expect(getRenderFlipbookCallCount()).toBe(1)
  })

  it('cancels pending flipbook RAF, destroys resources, and starts live loop when switching to live mode', async () => {
    const onPreviewModeChange = vi.fn()
    const { raf } = await renderAndFlushFlipbook({ onPreviewModeChange })

    const firstResources = renderFlipbookMocks.renderFlipbook.mock.results[0].value.resources
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
    expect(raf.getPendingCount()).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Live' }))

    expect(onPreviewModeChange).toHaveBeenCalledWith('live')
    expect(raf.cancelAnimationFrame).toHaveBeenCalledTimes(2)
    expect(firstResources.userUniformBuffer.destroy).toHaveBeenCalledTimes(1)
    expect(firstResources.viewportOriginBuffer.destroy).toHaveBeenCalledTimes(1)
    expect(raf.getPendingCount()).toBe(1)
  })

  it('redraws once with normalized flipbook settings committed by blur', async () => {
    const onFlipbookChange = vi.fn()
    const { raf } = await renderAndFlushFlipbook({ onFlipbookChange })
    const renderCountBefore = getRenderFlipbookCallCount()

    ;(performance.now as any).mockRestore?.()
    act(() => {
      flipbookControlsMocks.commitFrameCount('5')
    })

    expect(onFlipbookChange.mock.calls.at(-1)?.[0]).toEqual({
      frameCount: 5,
      frameIntervalMs: 100,
      startTimeMs: 0,
    })
    expect(raf.getPendingCount()).toBe(1)

    act(() => {
      raf.flushRaf()
    })

    expect(getRenderFlipbookCallCount()).toBe(renderCountBefore + 1)
    expect(getLastRenderFlipbookInput()).toEqual(
      expect.objectContaining({
        settings: {
          frameCount: 5,
          frameIntervalMs: 100,
          startTimeMs: 0,
        },
      }),
    )
  })

  it('coalesces settings changes and resize events before the next RAF into one flipbook redraw', async () => {
    const { raf } = await renderAndFlushFlipbook()
    const renderCountBefore = getRenderFlipbookCallCount()

    ;(performance.now as any).mockRestore?.()
    act(() => {
      flipbookControlsMocks.commitFrameCount('9')
    })

    const observer = MockResizeObserver.instances[0]
    act(() => {
      observer.callback(
        [
          {
            contentRect: { width: 640, height: 360 },
          } as ResizeObserverEntry,
        ],
        observer as unknown as ResizeObserver,
      )
      observer.callback(
        [
          {
            contentRect: { width: 800, height: 450 },
          } as ResizeObserverEntry,
        ],
        observer as unknown as ResizeObserver,
      )
    })

    expect(raf.getPendingCount()).toBe(1)

    act(() => {
      raf.flushRaf()
    })

    expect(getRenderFlipbookCallCount()).toBe(renderCountBefore + 1)
    expect(getLastRenderFlipbookInput()).toEqual(
      expect.objectContaining({
        canvasWidth: 800,
        canvasHeight: 450,
        settings: {
          frameCount: 9,
          frameIntervalMs: 100,
          startTimeMs: 0,
        },
      }),
    )
  })

  it('redraws flipbook after a successful Run compile in flipbook mode', async () => {
    const { rerender, raf, gpu, props } = await renderAndFlushFlipbook()
    const renderCountBefore = getRenderFlipbookCallCount()

    rerender(<PreviewPane {...props} shouldCompile />)
    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalledTimes(2))
    expect(raf.getPendingCount()).toBe(1)

    act(() => {
      raf.flushRaf()
    })

    expect(getRenderFlipbookCallCount()).toBe(renderCountBefore + 1)
  })

  it('does not redraw flipbook after a successful Run compile in live mode', async () => {
    installRafMock()
    const gpu = createWebGpuMock()
    const props = {
      code: defaultShader,
      previewMode: 'live' as const,
      flipbook: initialFlipbookSettings,
      onPreviewModeChange: vi.fn(),
      onFlipbookChange: vi.fn(),
      onCompileSuccess: vi.fn(),
      onCompileError: vi.fn(),
      onFpsChange: vi.fn(),
      onResolutionChange: vi.fn(),
      onGpuInfo: vi.fn(),
    }
    const { rerender } = render(<PreviewPane {...props} shouldCompile={false} />)

    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalledTimes(1))

    rerender(<PreviewPane {...props} shouldCompile />)
    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalledTimes(2))

    expect(getRenderFlipbookCallCount()).toBe(0)
  })

  it('does not redraw after compile failure and keeps the previous flipbook grid visible', async () => {
    const onCompileError = vi.fn()
    const { rerender, gpu, props } = await renderAndFlushFlipbook({ onCompileError })
    expect(screen.getByText('#0 0.00s')).toBeInTheDocument()
    const renderCountBefore = getRenderFlipbookCallCount()
    gpu.createShaderModule.mockReturnValueOnce(createFailingShaderModule('bad shader'))

    rerender(<PreviewPane {...props} shouldCompile />)

    await waitFor(() => expect(onCompileError).toHaveBeenCalledWith('WGSL compilation failed:\nbad shader'))
    expect(getRenderFlipbookCallCount()).toBe(renderCountBefore)
    expect(screen.getByText('#0 0.00s')).toBeInTheDocument()
  })

  it('destroys the previous flipbook resources before the next redraw', async () => {
    const { raf } = await renderAndFlushFlipbook()
    const firstResources = renderFlipbookMocks.renderFlipbook.mock.results[0].value.resources
    renderFlipbookMocks.renderFlipbook.mockImplementationOnce(() => {
      expect(firstResources.userUniformBuffer.destroy).toHaveBeenCalledTimes(1)
      expect(firstResources.viewportOriginBuffer.destroy).toHaveBeenCalledTimes(1)
      return createMockFlipbookResult()
    })

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
    expect(firstResources.userUniformBuffer.destroy).not.toHaveBeenCalled()

    act(() => {
      raf.flushRaf()
    })

    expect(getRenderFlipbookCallCount()).toBe(2)
  })

  it('destroys latest flipbook resources on unmount', async () => {
    const { unmount } = await renderAndFlushFlipbook()
    const firstResources = renderFlipbookMocks.renderFlipbook.mock.results[0].value.resources

    unmount()

    expect(firstResources.userUniformBuffer.destroy).toHaveBeenCalledTimes(1)
    expect(firstResources.viewportOriginBuffer.destroy).toHaveBeenCalledTimes(1)
  })

  it('normalizes unblurred draft input before compiling on Run in flipbook mode', async () => {
    const onFlipbookChange = vi.fn()
    const { rerender, raf, gpu, props } = await renderAndFlushFlipbook({ onFlipbookChange })
    const renderCountBefore = getRenderFlipbookCallCount()

    ;(performance.now as any).mockRestore?.()
    act(() => {
      flipbookControlsMocks.draftFrameCount('12.7')
    })
    rerender(<PreviewPane {...props} shouldCompile />)

    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalledTimes(2))

    expect(onFlipbookChange.mock.calls.at(-1)?.[0]).toEqual({
      frameCount: 12,
      frameIntervalMs: 100,
      startTimeMs: 0,
    })
    expect(onFlipbookChange.mock.invocationCallOrder[0]).toBeLessThan(
      gpu.createShaderModule.mock.invocationCallOrder[1],
    )

    act(() => {
      raf.flushRaf()
    })

    expect(getRenderFlipbookCallCount()).toBe(renderCountBefore + 1)
    expect(getLastRenderFlipbookInput()).toEqual(
      expect.objectContaining({
        settings: {
          frameCount: 12,
          frameIntervalMs: 100,
          startTimeMs: 0,
        },
      }),
    )
  })

  it('does not enter a rerender loop when shouldCompile toggles in flipbook mode', async () => {
    const raf = installRafMock()
    const gpu = createWebGpuMock()
    const onCompileSuccess = vi.fn()
    const onFlipbookChange = vi.fn()
    const props = createPreviewProps({
      previewMode: 'flipbook',
      onCompileSuccess,
      onFlipbookChange,
    })
    const { rerender } = render(<PreviewPane {...props} shouldCompile={false} />)

    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalledTimes(1))
    act(() => {
      raf.flushRaf()
    })
    const renderCountBeforeRun = getRenderFlipbookCallCount()
    onCompileSuccess.mockClear()
    onFlipbookChange.mockClear()

    rerender(<PreviewPane {...props} shouldCompile />)

    await waitFor(() => expect(gpu.createShaderModule).toHaveBeenCalledTimes(2))
    await act(async () => {})

    expect(onFlipbookChange).toHaveBeenCalledTimes(1)
    expect(onCompileSuccess).toHaveBeenCalledTimes(1)
    expect(gpu.createShaderModule).toHaveBeenCalledTimes(2)
    expect(raf.getPendingCount()).toBe(1)

    act(() => {
      raf.flushRaf()
    })

    expect(getRenderFlipbookCallCount()).toBe(renderCountBeforeRun + 1)
  })

  it('recompiles on every shouldCompile toggle, including a second Run', async () => {
    installRafMock()
    const gpu = createWebGpuMock()
    const onCompileSuccess = vi.fn()
    const props = {
      code: defaultShader,
      previewMode: 'live' as const,
      flipbook: initialFlipbookSettings,
      onPreviewModeChange: vi.fn(),
      onFlipbookChange: vi.fn(),
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
