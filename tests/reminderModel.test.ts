import {describe,expect,it} from 'vitest'
import {makeReminderPreset,reminderWeekdaysIssue} from '../src/features/notifications/reminderModel'

describe('reminder model',()=>{
  it('keeps preset weekdays inside ISO 1..7 and preserves timezone',()=>{
    for(const type of ['weight','waist','nutrition','daily_checkin','monthly_measurements','progress_photo','monthly_checkin','workout']){
      const preset=makeReminderPreset('client',type,'Europe/Berlin')
      expect(preset.timezone).toBe('Europe/Berlin')
      expect(preset.weekdays.every(day=>day>=1&&day<=7)).toBe(true)
    }
  })

  it('uses the workout fallback for unknown reminder type',()=>{
    const preset=makeReminderPreset('client','unknown')
    expect(preset.reminder_type).toBe('workout')
    expect(preset.weekdays).toEqual([1,3,5])
  })

  it('rejects enabled reminders without days and invalid weekdays',()=>{
    expect(reminderWeekdaysIssue(true,[])).toMatch(/хотя бы один день/)
    expect(reminderWeekdaysIssue(true,[0,8])).toMatch(/от 1 до 7/)
    expect(reminderWeekdaysIssue(false,[])).toBeNull()
    expect(reminderWeekdaysIssue(true,[1,7])).toBeNull()
  })
})
