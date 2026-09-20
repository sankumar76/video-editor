import { describe, expect, it } from 'vitest'
import {
  formatTimecode,
  framesToTicks,
  secondsToTicks,
  ticksToFrames,
  ticksToSeconds
} from '@core/time'

describe('time conversions', () => {
  it('round-trips seconds through ticks', () => {
    expect(ticksToSeconds(secondsToTicks(12.5))).toBeCloseTo(12.5, 6)
  })

  it('round-trips frames through ticks at 30fps', () => {
    expect(ticksToFrames(framesToTicks(90, 30), 30)).toBe(90)
  })

  it('formats timecode at 30fps', () => {
    expect(formatTimecode(framesToTicks(90, 30), 30)).toBe('00:00:03:00')
  })

  it('formats timecode with hours and frames at 24fps', () => {
    const oneHourFrames = 24 * 3600
    expect(formatTimecode(framesToTicks(oneHourFrames + 24 * 2 + 5, 24), 24)).toBe('01:00:02:05')
  })
})
