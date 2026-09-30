const TIMEZONE_KEY='andrey-fit-timezone'

function validTimeZone(value:string|null|undefined){
  if(!value)return null
  try{new Intl.DateTimeFormat('en-US',{timeZone:value}).format(new Date());return value}catch{return null}
}

export function getAppTimeZone(){
  const stored=typeof window!=='undefined'?validTimeZone(window.localStorage.getItem(TIMEZONE_KEY)):null
  return stored??validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)??'Europe/Moscow'
}

export function setAppTimeZone(timeZone:string|null|undefined){
  if(typeof window==='undefined')return
  const valid=validTimeZone(timeZone)
  if(valid)window.localStorage.setItem(TIMEZONE_KEY,valid)
}

export function appDateKey(date=new Date(),timeZone=getAppTimeZone()){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone,year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(date)
  const get=(type:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===type)?.value??''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function appMonthKey(date=new Date(),timeZone=getAppTimeZone()){
  return appDateKey(date,timeZone).slice(0,7)
}
