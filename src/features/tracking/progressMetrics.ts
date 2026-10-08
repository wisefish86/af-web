type DatedValue={date:string;value:number}

function dateKeyMs(dateKey:string){
  const [year,month,day]=dateKey.slice(0,10).split('-').map(Number)
  return Date.UTC(year,month-1,day,12)
}

export function summarizeWeeklyWeights(entries:{measured_at:string;weight_kg:number|null}[],todayKey:string){
  const todayMs=dateKeyMs(todayKey)
  const current=entries.filter(item=>{
    if(item.weight_kg==null)return false
    const age=Math.floor((todayMs-dateKeyMs(item.measured_at))/86400000)
    return age>=0&&age<=6
  })
  const previous=entries.filter(item=>{
    if(item.weight_kg==null)return false
    const age=Math.floor((todayMs-dateKeyMs(item.measured_at))/86400000)
    return age>=7&&age<=13
  })
  const average=(items:typeof current)=>items.length
    ? items.reduce((sum,item)=>sum+(item.weight_kg as number),0)/items.length
    : null
  return {
    currentAverage:average(current),
    previousAverage:average(previous),
    currentCount:current.length,
    previousCount:previous.length,
  }
}

export function makeDatedChart(points:DatedValue[]){
  if(points.length<2)return ''
  const times=points.map(point=>dateKeyMs(point.date))
  const minTime=Math.min(...times),maxTime=Math.max(...times)
  const minValue=Math.min(...points.map(point=>point.value))
  const maxValue=Math.max(...points.map(point=>point.value))
  const valueSpan=Math.max(maxValue-minValue,Math.abs(maxValue)*.04,1)
  const low=minValue-valueSpan*.08
  const high=maxValue+valueSpan*.08
  const timeSpan=Math.max(maxTime-minTime,1)
  return points.map((point,index)=>{
    const x=maxTime===minTime
      ? (points.length===1?50:index/(points.length-1)*100)
      : (dateKeyMs(point.date)-minTime)/timeSpan*100
    const y=100-(point.value-low)/(high-low)*100
    return `${x},${y}`
  }).join(' ')
}
