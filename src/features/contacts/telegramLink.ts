const telegramHosts=new Set(['t.me','telegram.me','www.t.me','www.telegram.me'])

function telegramUsername(webUrl:string):string|null{
  try{
    const parsed=new URL(webUrl)
    if(parsed.protocol==='tg:'&&parsed.hostname==='resolve'){
      const username=parsed.searchParams.get('domain')||''
      return /^\w{5,32}$/.test(username)?username:null
    }
    if(parsed.protocol!=='https:'||!telegramHosts.has(parsed.hostname.toLowerCase()))return null
    const username=parsed.pathname.split('/').filter(Boolean)[0]||''
    return /^\w{5,32}$/.test(username)?username:null
  }catch{return null}
}

export function telegramAppLink(webUrl:string):string|null{
  const username=telegramUsername(webUrl)
  return username?`tg://resolve?domain=${encodeURIComponent(username)}`:null
}

export function telegramExternalLink(webUrl:string,userAgent:string):string{
  const username=telegramUsername(webUrl)
  if(!username)return webUrl
  if(/Android/i.test(userAgent)){
    return `intent://resolve?domain=${encodeURIComponent(username)}#Intent;scheme=tg;package=org.telegram.messenger;S.browser_fallback_url=${encodeURIComponent(webUrl)};end`
  }
  if(/iPhone|iPad|iPod/i.test(userAgent))return `tg://resolve?domain=${encodeURIComponent(username)}`
  return webUrl
}

export function isMobileDevice(userAgent:string):boolean{
  return /Android|iPhone|iPad|iPod/i.test(userAgent)
}
