import {describe,expect,it} from 'vitest'
import {throwFirstQueryError} from '../src/lib/queryGuard'

describe('throwFirstQueryError',()=>{
  it('does nothing when all reads succeeded',()=>{
    expect(()=>throwFirstQueryError({error:null},{error:null})).not.toThrow()
  })

  it('throws the first failed read instead of treating missing data as false',()=>{
    const first=new Error('measurement read failed')
    const second=new Error('photo read failed')
    expect(()=>throwFirstQueryError({error:first},{error:second})).toThrow(first)
  })
})
