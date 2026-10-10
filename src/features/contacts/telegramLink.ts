const telegramHosts=new Set(['t.me','telegram.me','www.t.me','www.telegram.me'])

export function telegramAppLink(webUrl:string):string|null{
  try{
    const parsed=new URL(webUrl)
    if(parsed.protocol==='tg:'&&parsed.hostname==='resolve')return webUrl
    if(parsed.protocol!=='https:'||!telegramHosts.has(parsed.hostname.toLowerCase()))return null
    const username=parsed.pathname.split('/').filter(Boolean)[0]
    if(!username||!/^\w{5,32}$/.test(username))return null
    return `tg://resolve?domain=${encodeURIComponent(username)}`
  }catch{return null}
}

export function isMobileDevice(userAgent:string):boolean{
  return /Android|iPhone|iPad|iPod/i.test(userAgent)
}
