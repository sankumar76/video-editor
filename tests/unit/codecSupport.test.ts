import { describe, expect, it } from 'vitest'
import { needsProxyForPreview } from '@core/media/codecSupport'

describe('needsProxyForPreview', () => {
  it('does not need a proxy for a plain H.264/AAC mp4', () => {
    expect(
      needsProxyForPreview({ containerExtension: 'mp4', videoCodec: 'h264', audioCodec: 'aac' })
    ).toBe(false)
  })

  it('needs a proxy for HEVC', () => {
    expect(
      needsProxyForPreview({ containerExtension: 'mp4', videoCodec: 'hevc', audioCodec: 'aac' })
    ).toBe(true)
  })

  it('needs a proxy for an unsafe container', () => {
    expect(
      needsProxyForPreview({ containerExtension: 'avi', videoCodec: 'h264', audioCodec: 'aac' })
    ).toBe(true)
  })

  it('handles a leading dot on the extension', () => {
    expect(
      needsProxyForPreview({ containerExtension: '.mp4', videoCodec: 'h264', audioCodec: 'aac' })
    ).toBe(false)
  })

  it('does not need a proxy for audio-only or image items (null codec is not flagged)', () => {
    expect(
      needsProxyForPreview({ containerExtension: 'mp4', videoCodec: null, audioCodec: 'aac' })
    ).toBe(false)
  })
})
