import { describe, expect, it } from 'vitest'
import {
  flipbookFieldSpecs,
  normalizeFlipbookSettings,
  normalizeFlipbookValue,
} from './flipbookSettings'
import { initialFlipbookSettings, initialPreviewMode } from './types/preview'

describe('flipbook settings defaults', () => {
  it('defines the initial preview mode and flipbook settings', () => {
    expect(initialPreviewMode).toBe('animation')
    expect(initialFlipbookSettings).toEqual({
      frameCount: 16,
      frameIntervalMs: 100,
      startTimeMs: 0,
    })
  })

  it('exposes field metadata from the spec', () => {
    expect(flipbookFieldSpecs).toEqual({
      frameCount: { defaultValue: 16, min: 1, max: 64, step: 1 },
      frameIntervalMs: { defaultValue: 100, min: 0, max: 60000, step: 1 },
      startTimeMs: { defaultValue: 0, min: 0, max: 3600000, step: 1 },
    })
  })
})

describe('normalizeFlipbookValue', () => {
  it.each(['', 'abc', Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'normalizes invalid frameCount value %s to the default',
    (value) => {
      expect(normalizeFlipbookValue('frameCount', value)).toBe(16)
    },
  )

  it.each([
    [1.9, 1],
    [0, 1],
    [65, 64],
  ])('normalizes frameCount %s to %s', (value, expected) => {
    expect(normalizeFlipbookValue('frameCount', value)).toBe(expected)
  })

  it.each([
    ['', 100],
    [12.9, 12],
    [-1, 0],
    [60001, 60000],
  ])('normalizes frameIntervalMs %s to %s', (value, expected) => {
    expect(normalizeFlipbookValue('frameIntervalMs', value)).toBe(expected)
  })

  it.each([
    ['', 0],
    [123.9, 123],
    [-1, 0],
    [3600001, 3600000],
  ])('normalizes startTimeMs %s to %s', (value, expected) => {
    expect(normalizeFlipbookValue('startTimeMs', value)).toBe(expected)
  })
})

describe('normalizeFlipbookSettings', () => {
  it('returns every field as an integer', () => {
    const settings = normalizeFlipbookSettings({
      frameCount: '8.9',
      frameIntervalMs: 12.3,
      startTimeMs: '456.7',
    })

    expect(settings).toEqual({
      frameCount: 8,
      frameIntervalMs: 12,
      startTimeMs: 456,
    })
    expect(Object.values(settings).every(Number.isInteger)).toBe(true)
  })
})
