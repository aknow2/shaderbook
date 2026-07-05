import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBar } from './StatusBar'

describe('StatusBar', () => {
  it('renders compile status, fps, resolution, gpu name, backend, and WGSL label', () => {
    render(
      <StatusBar
        compileStatus="success"
        previewMode="animation"
        fps={59.95}
        resolution={{ width: 1280, height: 720 }}
        gpuName="Integrated GPU"
      />,
    )

    expect(screen.getByText('Compile: Success')).toBeInTheDocument()
    expect(screen.getByText('FPS: 60.0')).toBeInTheDocument()
    expect(screen.getByText('Resolution: 1280 x 720')).toBeInTheDocument()
    expect(screen.getByText('GPU: Integrated GPU')).toBeInTheDocument()
    expect(screen.getByText('Backend: WebGPU')).toBeInTheDocument()
    expect(screen.getByText('WGSL')).toBeInTheDocument()
  })

  it.each([
    ['idle', 'Compile: Idle', 'compile-idle'],
    ['success', 'Compile: Success', 'compile-success'],
    ['error', 'Compile: Error', 'compile-error'],
  ] as const)('renders %s compile status text and class', (compileStatus, text, className) => {
    render(
      <StatusBar
        compileStatus={compileStatus}
        previewMode="animation"
        fps={0}
        resolution={{ width: 0, height: 0 }}
      />,
    )

    expect(screen.getByText(text)).toHaveClass(className)
  })

  it('renders live FPS in animation mode', () => {
    render(
      <StatusBar
        compileStatus="success"
        previewMode="animation"
        fps={29.94}
        resolution={{ width: 640, height: 360 }}
      />,
    )

    expect(screen.getByText('FPS: 29.9')).toBeInTheDocument()
  })

  it('renders FPS as paused in flipbook mode while keeping the other status items', () => {
    render(
      <StatusBar
        compileStatus="error"
        previewMode="flipbook"
        fps={59.95}
        resolution={{ width: 800, height: 600 }}
        gpuName="Discrete GPU"
      />,
    )

    expect(screen.getByText('Compile: Error')).toBeInTheDocument()
    expect(screen.getByText('FPS: Paused')).toBeInTheDocument()
    expect(screen.getByText('Resolution: 800 x 600')).toBeInTheDocument()
    expect(screen.getByText('GPU: Discrete GPU')).toBeInTheDocument()
    expect(screen.getByText('Backend: WebGPU')).toBeInTheDocument()
    expect(screen.getByText('WGSL')).toBeInTheDocument()
  })
})
