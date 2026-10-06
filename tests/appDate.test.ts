import { describe, expect, it } from 'vitest'
import { addDaysToDateKey, appDateKey, appIsoWeekday, appStartOfDayIso, appWeekStartDateKey } from '../src/lib/appDate'

describe('app date/timezone invariants',()=>{
  it('uses the client timezone rather than UTC for the local workout day',()=>{
    const instant=new Date('2026-10-06T21:30:00.000Z')
    expect(appDateKey(instant,'Europe/Moscow')).toBe('2026-10-07')
    expect(appDateKey(instant,'Europe/Berlin')).toBe('2026-10-06')
  })

  it('keeps Monday as ISO weekday 1 and Sunday as 7',()=>{
    expect(appIsoWeekday('2026-10-05')).toBe(1)
    expect(appIsoWeekday('2026-10-11')).toBe(7)
  })

  it('calculates week start without browser timezone dependence',()=>{
    expect(appWeekStartDateKey('2026-10-11')).toBe('2026-10-05')
    expect(addDaysToDateKey('2026-10-31',1)).toBe('2026-11-01')
  })

  it('handles DST start when converting a local day to UTC',()=>{
    expect(appStartOfDayIso('2026-03-29','Europe/Berlin')).toBe('2026-03-28T23:00:00.000Z')
  })
})
