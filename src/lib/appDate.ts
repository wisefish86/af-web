const TIMEZONE_KEY='andrey-fit-timezone'

function validTimeZone(value:string|null|undefined){
  if(!value)return null
  try{new Intl.DateTimeFormat('en-US',{timeZone:value}).format(new Date());return value}catch{return null}
}

function calendarParts(date:Date,timeZone:string){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',
  }).formatToParts(date)
  const get=(type:string)=>Number(parts.find(part=>part.type===type)?.value??0)
  return {year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute'),second:get('second')}
}

function offsetMs(date:Date,timeZone:string){
  const p=calendarParts(date,timeZone)
  const represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)
  const actual=Math.floor(date.getTime()/1000)*1000
  return represented-actual
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
  const p=calendarParts(date,timeZone)
  return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`
}

export function appMonthKey(date=new Date(),timeZone=getAppTimeZone()){
  return appDateKey(date,timeZone).slice(0,7)
}

export function addDaysToDateKey(dateKey:string,days:number){
  const [year,month,day]=dateKey.split('-').map(Number)
  const date=new Date(Date.UTC(year,month-1,day+days,12))
  return date.toISOString().slice(0,10)
}

export function appIsoWeekday(dateKey=appDateKey()){
  const day=new Date(dateKey+'T12:00:00Z').getUTCDay()
  return day===0?7:day
}

export function appWeekStartDateKey(dateKey=appDateKey()){
  return addDaysToDateKey(dateKey,-(appIsoWeekday(dateKey)-1))
}

export function appStartOfDayIso(dateKey=appDateKey(),timeZone=getAppTimeZone()){
  const [year,month,day]=dateKey.split('-').map(Number)
  const wallUtc=Date.UTC(year,month-1,day,0,0,0)
  let instant=wallUtc-offsetMs(new Date(wallUtc),timeZone)
  const corrected=wallUtc-offsetMs(new Date(instant),timeZone)
  if(corrected!==instant)instant=corrected
  return new Date(instant).toISOString()
}
