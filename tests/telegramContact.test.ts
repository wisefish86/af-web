import { describe, expect, it } from 'vitest'
import { isMobileDevice, telegramAppLink } from '../src/features/contacts/telegramLink'

describe('trainer Telegram contact',()=>{
  it('builds a native app link from the configured web profile',()=>{
    expect(telegramAppLink('https://t.me/andrey_fit')).toBe('tg://resolve?domain=andrey_fit')
  })

  it('keeps unsupported links on their normal web path',()=>{
    expect(telegramAppLink('https://example.com/andrey')).toBeNull()
    expect(telegramAppLink('not a url')).toBeNull()
  })

  it('uses the native attempt only on mobile devices',()=>{
    expect(isMobileDevice('Mozilla/5.0 (Linux; Android 15)')).toBe(true)
    expect(isMobileDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false)
  })
})
