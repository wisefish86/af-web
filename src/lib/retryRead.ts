export function isTransientReadError(error:unknown){
  if(!error||typeof error!=='object')return false
  const value=error as {code?:unknown;message?:unknown;status?:unknown}
  const code=typeof value.code==='string'?value.code:''
  const message=typeof value.message==='string'?value.message.toLowerCase():''
  const status=typeof value.status==='number'?value.status:Number(value.status)
  return code==='57014'
    || status===408||status===429||status===500||status===502||status===503||status===504
    || message.includes('statement timeout')
    || message.includes('timeout')
    || message.includes('failed to fetch')
    || message.includes('networkerror')
}

export async function withTransientReadRetry<T>(
  read:()=>Promise<T>,
  options:{retries?:number;delayMs?:number}={}
):Promise<T>{
  const retries=Math.max(0,options.retries??1)
  const delayMs=Math.max(0,options.delayMs??250)
  let attempt=0
  while(true){
    try{return await read()}
    catch(error){
      if(attempt>=retries||!isTransientReadError(error))throw error
      attempt++
      if(delayMs)await new Promise(resolve=>setTimeout(resolve,delayMs*attempt))
    }
  }
}
