import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBar } from './StatusBar'

describe('StatusBar', () => {
  it('renders compile status, fps, resolution, gpu name, backend, and WGSL label', () => {
    render(
      <StatusBar
        compileStatus="success"
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
        fps={0}
        resolution={{ width: 0, height: 0 }}
      />,
    )

    expect(screen.getByText(text)).toHaveClass(className)
  })
})
