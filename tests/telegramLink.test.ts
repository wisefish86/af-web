import {describe,expect,it} from 'vitest'
import {telegramAppLink,telegramExternalLink} from '../src/features/contacts/telegramLink'

describe('trainer Telegram handoff',()=>{
  it('keeps desktop on the normal web URL',()=>{
    expect(telegramExternalLink('https://t.me/example','Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('https://t.me/example')
  })

  it('uses an Android intent with Telegram package and browser fallback',()=>{
    const value=telegramExternalLink('https://t.me/example','Mozilla/5.0 (Linux; Android 15)')
    expect(value).toContain('intent://resolve?domain=example')
    expect(value).toContain('package=org.telegram.messenger')
    expect(value).toContain('S.browser_fallback_url=')
  })

  it('uses tg scheme on iOS without navigating the PWA to t.me',()=>{
    expect(telegramExternalLink('https://t.me/example','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('tg://resolve?domain=example')
    expect(telegramAppLink('https://t.me/example')).toBe('tg://resolve?domain=example')
  })
})
