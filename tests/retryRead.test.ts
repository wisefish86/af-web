import {describe,expect,it,vi} from 'vitest'
import {isTransientReadError,withTransientReadRetry} from '../src/lib/retryRead'

describe('transient read retry',()=>{
  it('recognizes timeout and transient gateway failures',()=>{
    expect(isTransientReadError({code:'57014',message:'canceling statement due to statement timeout'})).toBe(true)
    expect(isTransientReadError({status:503,message:'Service unavailable'})).toBe(true)
    expect(isTransientReadError({code:'42501',message:'permission denied'})).toBe(false)
  })

  it('retries a transient read once and returns the recovered value',async()=>{
    const read=vi.fn()
      .mockRejectedValueOnce({code:'57014',message:'statement timeout'})
      .mockResolvedValueOnce('ok')
    await expect(withTransientReadRetry(read,{retries:1,delayMs:0})).resolves.toBe('ok')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('does not retry authorization or validation failures',async()=>{
    const error={code:'42501',message:'permission denied'}
    const read=vi.fn().mockRejectedValue(error)
    await expect(withTransientReadRetry(read,{retries:2,delayMs:0})).rejects.toBe(error)
    expect(read).toHaveBeenCalledTimes(1)
  })
})
