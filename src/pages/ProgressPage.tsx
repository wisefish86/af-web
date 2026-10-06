import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BellRing, CalendarPlus, Camera, CheckCircle2, ChevronDown, Info, Pencil, RotateCcw, Save, X } from 'lucide-react'
import {
  ensureMyProgressCheckinReminder, isProgressPhotoDone, loadMeasurements, loadMonthlyCheckinHistory, loadMyTrackingSetup,
  setProgressPhotoDone, saveCurrentMonthCheckin, saveMeasurement,
  type Measurement, type MonthlyCheckin, type MonthlyCheckinHistory, type TrackingFieldState
} from '../features/tracking/service'
import { loadExerciseHistory, loadProgressExerciseOptions, type ProgressExerciseOption } from '../features/workouts/service'
import type { ExerciseHistoryEntry } from '../features/workouts/types'
import { estimateOneRepMax } from '../lib/numberInput'
import { appDateKey } from '../lib/appDate'
import { showAppToast } from '../lib/toast'
import { UiCard, UiLoadError, UiNotice, UiSectionHeader, UiStack } from '../ui/primitives'
import { BodyPotentialCard } from '../components/BodyPotentialCard'

type Props={preview:boolean;trainingEnabled:boolean}
type ProgressLoadFailure='measurements'|'setup'|'history'|'photo'
const progressLoadLabels:Record<ProgressLoadFailure,string>={
  measurements:'замеры',
  setup:'настройки полей',
  history:'история самооценки',
  photo:'отметка фото',
}

const previewMeasurements:Measurement[]=[
  {id:'1',measured_at:'2026-09-27',weight_kg:89.6,waist_cm:96,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
  {id:'2',measured_at:'2026-09-24',weight_kg:89.9,waist_cm:null,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
  {id:'3',measured_at:'2026-09-21',weight_kg:90.2,waist_cm:97,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
  {id:'4',measured_at:'2026-09-17',weight_kg:90.8,waist_cm:null,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
  {id:'5',measured_at:'2026-09-13',weight_kg:91.4,waist_cm:99,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
]
const blankMonthly:MonthlyCheckin={appearance:null,fitness:null,physical_comfort:null,energy:null,sleep_recovery:null,nutrition:null,relationship_with_food:null,improve:'',next_step:'',keep:'',comment:''}
const previewMonthlyHistory:MonthlyCheckinHistory[]=[
  {checkin_date:'2026-09-22',appearance:7,fitness:7,physical_comfort:8,energy:7,sleep_recovery:6,nutrition:8,relationship_with_food:8,improve:'Стабильнее держать режим сна.',next_step:'Ложиться в одно время хотя бы 5 дней в неделю.',keep:'Три силовые и заранее спланированное питание.',comment:''},
  {checkin_date:'2026-08-20',appearance:6,fitness:6,physical_comfort:7,energy:6,sleep_recovery:5,nutrition:7,relationship_with_food:7,improve:'Меньше хаотичных перекусов.',next_step:'Подготовить удобные варианты перекуса.',keep:'Регулярные тренировки.',comment:''},
]
const monthlyMeta:{key:keyof Pick<MonthlyCheckin,'appearance'|'fitness'|'physical_comfort'|'energy'|'sleep_recovery'|'nutrition'|'relationship_with_food'>;visibilityCode:string;label:string}[]=[
  {key:'appearance',visibilityCode:'appearance',label:'Как нравится внешний вид'},
  {key:'fitness',visibilityCode:'fitness',label:'Физическая форма'},
  {key:'physical_comfort',visibilityCode:'physical_comfort',label:'Физический комфорт'},
  {key:'energy',visibilityCode:'monthly_energy',label:'Энергия за месяц'},
  {key:'sleep_recovery',visibilityCode:'sleep_recovery',label:'Сон и восстановление'},
  {key:'nutrition',visibilityCode:'nutrition',label:'Насколько устраивает питание'},
  {key:'relationship_with_food',visibilityCode:'relationship_with_food',label:'Отношения с едой'},
]

function valueOrNull(value:string){const n=Number(value.replace(',','.'));return value.trim()===''||!Number.isFinite(n)?null:n}
function sameNullableNumber(a:number|null|undefined,b:number|null|undefined){return (a??null)===(b??null)}
function sameMonthlyCheckin(actual:MonthlyCheckinHistory,input:MonthlyCheckin){
  return monthlyMeta.every(meta=>sameNullableNumber(actual[meta.key] as number|null,input[meta.key] as number|null))
    && actual.improve.trim()===input.improve.trim()
    && actual.next_step.trim()===input.next_step.trim()
    && actual.keep.trim()===input.keep.trim()
    && actual.comment.trim()===input.comment.trim()
}
function display(value:number|null,digits=1){return value==null?'—':value.toFixed(digits).replace('.',',')}
function addDaysKey(key:string,days:number){
  const date=new Date(key+'T12:00:00')
  date.setDate(date.getDate()+days)
  const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0')
  return `${y}-${m}-${d}`
}
function makeChart(values:number[]){
  if(values.length<2)return ''
  const min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,Math.abs(max)*.04,1)
  const low=min-span*.08,high=max+span*.08
  return values.map((value,i)=>(i/(values.length-1)*100)+','+(100-(value-low)/(high-low)*100)).join(' ')
}

const previewStrengthExercises:ProgressExerciseOption[]=[
  {exercise_id:'preview-bench',name:'Жим гантелей на наклонной скамье',last_completed_at:'2026-09-27T18:00:00Z',tracking_type:'weight_reps'},
  {exercise_id:'preview-row',name:'Тяга горизонтального блока',last_completed_at:'2026-09-25T18:00:00Z',tracking_type:'weight_reps'},
]
const previewStrengthHistory:ExerciseHistoryEntry[]=[
  {workout_session_id:'p1',workout_date:'2026-08-20',completed_at:'2026-08-20T18:00:00Z',sets:[{set_number:1,weight_kg:22,reps:10,rir:2,is_warmup:false,completed_at:'2026-08-20T18:00:00Z'}]},
  {workout_session_id:'p2',workout_date:'2026-09-03',completed_at:'2026-09-03T18:00:00Z',sets:[{set_number:1,weight_kg:24,reps:10,rir:2,is_warmup:false,completed_at:'2026-09-03T18:00:00Z'}]},
  {workout_session_id:'p3',workout_date:'2026-09-17',completed_at:'2026-09-17T18:00:00Z',sets:[{set_number:1,weight_kg:26,reps:9,rir:1,is_warmup:false,completed_at:'2026-09-17T18:00:00Z'}]},
  {workout_session_id:'p4',workout_date:'2026-09-27',completed_at:'2026-09-27T18:00:00Z',sets:[{set_number:1,weight_kg:28,reps:8,rir:1,is_warmup:false,completed_at:'2026-09-27T18:00:00Z'}]},
]

export function ProgressPage({preview,trainingEnabled}:Props){
  const [searchParams]=useSearchParams()
  const entry=searchParams.get('entry')
  const [measurements,setMeasurements]=useState<Measurement[]>(preview?previewMeasurements:[])
  const [setup,setSetup]=useState<TrackingFieldState[]>([])
  const [monthly,setMonthly]=useState<MonthlyCheckin>(blankMonthly)
  const [monthlyHistory,setMonthlyHistory]=useState<MonthlyCheckinHistory[]>(preview?previewMonthlyHistory:[])
  const [checkinEditing,setCheckinEditing]=useState(!preview)
  const [compareMonthly,setCompareMonthly]=useState(false)
  const [photoDone,setPhotoDone]=useState(preview)
  const [photoSaving,setPhotoSaving]=useState(false)
  const [loading,setLoading]=useState(!preview)
  const [trackingLoaded,setTrackingLoaded]=useState(preview)
  const [saving,setSaving]=useState(false)
  const [notice,setNotice]=useState('')
  const [loadFailures,setLoadFailures]=useState<ProgressLoadFailure[]>([])
  const [quick,setQuick]=useState({weight:'',waist:'',note:''})
  const [editingQuick,setEditingQuick]=useState(false)
  const [quickWeightConfirmed,setQuickWeightConfirmed]=useState(false)
  const [historyEditor,setHistoryEditor]=useState<{mode:'add'|'edit';date:string;weight:string;waist:string;note:string}|null>(null)
  const [monthlyMeasures,setMonthlyMeasures]=useState({chest:'',hips:'',thigh:'',arm_relaxed:'',arm_flexed:''})
  const [trendMetric,setTrendMetric]=useState<'weight'|'waist'>('weight')
  const [strengthExercises,setStrengthExercises]=useState<ProgressExerciseOption[]>(preview?previewStrengthExercises:[])
  const [strengthExerciseId,setStrengthExerciseId]=useState(preview?'preview-bench':'')
  const [strengthHistory,setStrengthHistory]=useState<ExerciseHistoryEntry[]>(preview?previewStrengthHistory:[])
  const [strengthMetric,setStrengthMetric]=useState<'e1rm'|'weight'|'volume'|'reps'|'total_reps'>('e1rm')
  const [strengthLoading,setStrengthLoading]=useState(false)
  const [strengthError,setStrengthError]=useState('')
  const [strengthReloadKey,setStrengthReloadKey]=useState(0)

  function mergeMeasurementLocal(date:string,patch:Partial<Omit<Measurement,'id'|'measured_at'>>){
    setMeasurements(current=>{
      const existing=current.find(item=>item.measured_at===date)
      const next:Measurement={
        id:existing?.id??('local-'+date),
        measured_at:date,
        weight_kg:existing?.weight_kg??null,
        waist_cm:existing?.waist_cm??null,
        chest_cm:existing?.chest_cm??null,
        hips_cm:existing?.hips_cm??null,
        thigh_cm:existing?.thigh_cm??null,
        arm_relaxed_cm:existing?.arm_relaxed_cm??null,
        arm_flexed_cm:existing?.arm_flexed_cm??null,
        note:existing?.note??null,
        ...patch,
      }
      return [next,...current.filter(item=>item.measured_at!==date)].sort((a,b)=>b.measured_at.localeCompare(a.measured_at))
    })
  }

  function addProgressLoadFailure(code:ProgressLoadFailure){
    setLoadFailures(current=>current.includes(code)?current:[...current,code])
  }

  function applyMeasurementsData(m:Measurement[],preserveDraft=false){
    setMeasurements(m)
    const today=appDateKey()
    const current=m.find(x=>x.measured_at===today)
    const quickDirty=quick.weight.trim()!==''||quick.waist.trim()!==''||quick.note.trim()!==''
    if(current&&!(preserveDraft&&quickDirty))setQuick({
      weight:current.weight_kg==null?'':String(current.weight_kg).replace('.',','),
      waist:current.waist_cm==null?'':String(current.waist_cm).replace('.',','),
      note:current.note??'',
    })
    const month=today.slice(0,7)
    const monthlyMeasurement=m.find(x=>x.measured_at.startsWith(month)&&(
      x.chest_cm!=null||x.hips_cm!=null||x.thigh_cm!=null||x.arm_relaxed_cm!=null||x.arm_flexed_cm!=null
    ))
    const monthlyDirty=Object.values(monthlyMeasures).some(value=>value.trim()!=='')
    if(monthlyMeasurement&&!(preserveDraft&&monthlyDirty))setMonthlyMeasures({
      chest:monthlyMeasurement.chest_cm==null?'':String(monthlyMeasurement.chest_cm).replace('.',','),
      hips:monthlyMeasurement.hips_cm==null?'':String(monthlyMeasurement.hips_cm).replace('.',','),
      thigh:monthlyMeasurement.thigh_cm==null?'':String(monthlyMeasurement.thigh_cm).replace('.',','),
      arm_relaxed:monthlyMeasurement.arm_relaxed_cm==null?'':String(monthlyMeasurement.arm_relaxed_cm).replace('.',','),
      arm_flexed:monthlyMeasurement.arm_flexed_cm==null?'':String(monthlyMeasurement.arm_flexed_cm).replace('.',','),
    })
  }

  function applyMonthlyHistoryData(history:MonthlyCheckinHistory[],preserveDraft=false){
    setMonthlyHistory(history)
    const monthlyDirty=Object.values(monthly).some(value=>value!==null&&String(value).trim()!=='')
    if(preserveDraft&&monthlyDirty)return
    if(history.length){
      setMonthly(history[0])
      setCheckinEditing(false)
    }else{
      setMonthly(blankMonthly)
      setCheckinEditing(true)
    }
  }

  useEffect(()=>{
    if(preview){
      setMonthlyHistory(previewMonthlyHistory)
      setMonthly(previewMonthlyHistory[0])
      setCheckinEditing(false)
      setSetup(['weight','waist','chest','hips','thigh','arm_relaxed','arm_flexed','appearance','fitness','physical_comfort','sleep_recovery','nutrition'].map(code=>({
        code,section:code==='weight'||code==='waist'?'measurements':code==='chest'||code==='hips'||code==='thigh'||code.startsWith('arm_')?'measurements':'monthly',
        label:code,unit:null,enabled:true,required:false,frequency:'monthly',client_can_disable:true,hidden:false,reminder_enabled:true,settings:{},
      })))
      setLoading(false)
      return
    }
    setLoadFailures([])
    Promise.allSettled([loadMeasurements(),loadMyTrackingSetup(),loadMonthlyCheckinHistory(),isProgressPhotoDone()])
      .then(([measurementResult,setupResult,historyResult,photoResult])=>{
        const failed:string[]=[]
        if(measurementResult.status==='fulfilled')applyMeasurementsData(measurementResult.value)
        else failed.push('measurements')

        if(setupResult.status==='fulfilled'){setSetup(setupResult.value);setTrackingLoaded(true)}
        else {setTrackingLoaded(false);failed.push('setup')}

        if(historyResult.status==='fulfilled')applyMonthlyHistoryData(historyResult.value)
        else failed.push('history')

        if(photoResult.status==='fulfilled')setPhotoDone(photoResult.value)
        else failed.push('photo')

        failed.forEach(code=>addProgressLoadFailure(code as ProgressLoadFailure))
      })
      .finally(()=>setLoading(false))
  },[preview])

  function startFreshMonthlyCheckin(){
    setMonthly({...blankMonthly})
    setCheckinEditing(true)
    setCompareMonthly(false)
    setNotice('')
  }

  async function retryFailedProgressLoads(){
    const pending=[...loadFailures]
    if(!pending.length)return
    const succeeded:ProgressLoadFailure[]=[]
    await Promise.all(pending.map(async code=>{
      try{
        if(code==='measurements'){
          const data=await loadMeasurements()
          applyMeasurementsData(data,true)
        }else if(code==='setup'){
          const data=await loadMyTrackingSetup()
          setSetup(data);setTrackingLoaded(true)
        }else if(code==='history'){
          const data=await loadMonthlyCheckinHistory()
          applyMonthlyHistoryData(data,true)
        }else{
          setPhotoDone(await isProgressPhotoDone())
        }
        succeeded.push(code)
      }catch{}
    }))
    if(succeeded.length)setLoadFailures(current=>current.filter(code=>!succeeded.includes(code)))
  }

  useEffect(()=>{
    if(loading||preview||!entry)return
    const handle=window.setTimeout(()=>{
      if(entry==='weight'||entry==='waist'){
        setEditingQuick(true)
        const panel=document.querySelector('.quick-measure-panel')
        panel?.scrollIntoView({behavior:'smooth',block:'start'})
        window.setTimeout(()=>document.getElementById(entry==='weight'?'progress-weight-input':'progress-waist-input')?.focus(),250)
        return
      }
      if(entry==='monthly'){
        startFreshMonthlyCheckin()
        const panel=document.querySelector('details.monthly-progress-panel') as HTMLDetailsElement|null
        if(panel){
          panel.open=true
          panel.scrollIntoView({behavior:'smooth',block:'start'})
        }
      }
    },80)
    return()=>window.clearTimeout(handle)
  },[loading,preview,entry])

  useEffect(()=>{
    if(!trainingEnabled)return
    if(preview){setStrengthExercises(previewStrengthExercises);setStrengthExerciseId('preview-bench');return}
    let cancelled=false
    setStrengthLoading(true);setStrengthError('')
    loadProgressExerciseOptions().then(options=>{
      if(cancelled)return
      setStrengthExercises(options)
      const saved=localStorage.getItem('andrey-fit-strength-progress-exercise')
      setStrengthExerciseId(options.some(x=>x.exercise_id===saved)?saved??'':options[0]?.exercise_id??'')
    }).catch(e=>{if(!cancelled)setStrengthError(e instanceof Error?e.message:'Не удалось загрузить упражнения')})
      .finally(()=>{if(!cancelled)setStrengthLoading(false)})
    return()=>{cancelled=true}
  },[preview,trainingEnabled,strengthReloadKey])

  useEffect(()=>{
    if(!trainingEnabled||!strengthExerciseId)return
    if(preview){setStrengthHistory(previewStrengthHistory);return}
    let cancelled=false
    setStrengthLoading(true);setStrengthError('')
    localStorage.setItem('andrey-fit-strength-progress-exercise',strengthExerciseId)
    loadExerciseHistory(strengthExerciseId,24).then(history=>{if(!cancelled)setStrengthHistory(history)})
      .catch(e=>{if(!cancelled)setStrengthError(e instanceof Error?e.message:'Не удалось загрузить силовой прогресс')})
      .finally(()=>{if(!cancelled)setStrengthLoading(false)})
    return()=>{cancelled=true}
  },[preview,trainingEnabled,strengthExerciseId,strengthReloadKey])

  const isVisible=(code:string)=>{
    if(!trackingLoaded)return false
    const field=setup.find(f=>f.code===code)
    return field ? field.enabled&&!field.hidden : false
  }
  const isRequired=(code:string)=>{
    const field=setup.find(f=>f.code===code)
    return Boolean(field?.enabled&&!field.hidden&&field.required)
  }

  const todayKey=appDateKey()
  const latestCheckin=monthlyHistory[0]??null
  const nextRecommendedCheckin=latestCheckin?addDaysKey(latestCheckin.checkin_date,30):null
  const todayMeasurement=measurements.find(m=>m.measured_at===todayKey)
  const quickAlreadySaved=Boolean(todayMeasurement&&(todayMeasurement.weight_kg!=null||todayMeasurement.waist_cm!=null))
  const latestWeight=measurements.find(m=>m.weight_kg!=null)?.weight_kg??null
  const latestWaist=measurements.find(m=>m.waist_cm!=null)?.waist_cm??null
  const weightEntries=useMemo(()=>measurements.filter(m=>m.weight_kg!=null),[measurements])
  const waistEntries=useMemo(()=>measurements.filter(m=>m.waist_cm!=null),[measurements])
  const quickHistoryEntries=useMemo(()=>measurements.filter(m=>m.weight_kg!=null||m.waist_cm!=null||Boolean(m.note?.trim())),[measurements])
  const startWeight=weightEntries.at(-1)?.weight_kg??null
  const startWaist=waistEntries.at(-1)?.waist_cm??null
  const weeklyWeightSummary=useMemo(()=>{
    if(!weightEntries.length)return {currentAverage:null as number|null,previousAverage:null as number|null,currentCount:0,previousCount:0}
    const newest=new Date(weightEntries[0].measured_at+'T00:00:00').getTime()
    const recent=weightEntries.filter(m=>newest-new Date(m.measured_at+'T00:00:00').getTime()<=6*86400000)
    const prior=weightEntries.filter(m=>{
      const age=newest-new Date(m.measured_at+'T00:00:00').getTime()
      return age>=7*86400000&&age<=13*86400000
    })
    const average=(items:Measurement[])=>items.length?items.reduce((sum,m)=>sum+(m.weight_kg??0),0)/items.length:null
    return {currentAverage:average(recent),previousAverage:average(prior),currentCount:recent.length,previousCount:prior.length}
  },[weightEntries])
  const sevenDayAverage=weeklyWeightSummary.currentAverage
  const weeklyWeightTrendReady=weeklyWeightSummary.currentCount>=3&&weeklyWeightSummary.previousCount>=3
  const weeklyWeightDelta=weeklyWeightTrendReady&&weeklyWeightSummary.currentAverage!=null&&weeklyWeightSummary.previousAverage!=null
    ? weeklyWeightSummary.currentAverage-weeklyWeightSummary.previousAverage
    : null
  const bodyTrendPoints=useMemo(()=>{
    const source=trendMetric==='weight'?weightEntries:waistEntries
    return source.slice(0,18).reverse()
  },[trendMetric,weightEntries,waistEntries])
  const bodyChart=useMemo(()=>makeChart(bodyTrendPoints.map(p=>trendMetric==='weight'?(p.weight_kg as number):(p.waist_cm as number))),[bodyTrendPoints,trendMetric])
  const selectedStrengthExercise=strengthExercises.find(x=>x.exercise_id===strengthExerciseId)??null
  const repsOnly=selectedStrengthExercise?.tracking_type==='bodyweight_reps'||selectedStrengthExercise?.tracking_type==='reps_only'
  useEffect(()=>{
    if(!selectedStrengthExercise)return
    setStrengthMetric(current=>repsOnly
      ? (current==='reps'||current==='total_reps'?current:'reps')
      : (current==='e1rm'||current==='weight'||current==='volume'?current:'e1rm'))
  },[selectedStrengthExercise?.exercise_id,repsOnly])
  const strengthPoints=useMemo(()=>strengthHistory.slice().reverse().map(entry=>{
    const sets=entry.sets.filter(set=>!set.is_warmup&&set.completed_at&&set.reps!=null&&set.reps>0)
    if(!sets.length)return null
    const weighted=sets.filter(set=>set.weight_kg!=null&&set.weight_kg>0)
    const e1rm=weighted.length?Math.max(...weighted.map(set=>estimateOneRepMax(set.weight_kg as number,set.reps as number)??0)):0
    const maxWeight=weighted.length?Math.max(...weighted.map(set=>set.weight_kg as number)):0
    const volume=weighted.reduce((sum,set)=>sum+(set.weight_kg as number)*(set.reps as number),0)
    const maxReps=Math.max(...sets.map(set=>set.reps as number))
    const totalReps=sets.reduce((sum,set)=>sum+(set.reps as number),0)
    return {date:entry.workout_date,e1rm,maxWeight,volume,maxReps,totalReps}
  }).filter(Boolean) as {date:string;e1rm:number;maxWeight:number;volume:number;maxReps:number;totalReps:number}[],[strengthHistory])
  const strengthValue=(point:{e1rm:number;maxWeight:number;volume:number;maxReps:number;totalReps:number})=>strengthMetric==='e1rm'?point.e1rm:strengthMetric==='weight'?point.maxWeight:strengthMetric==='volume'?point.volume:strengthMetric==='reps'?point.maxReps:point.totalReps
  const strengthChart=useMemo(()=>makeChart(strengthPoints.map(strengthValue)),[strengthPoints,strengthMetric])
  const firstStrength=strengthPoints[0]??null
  const latestStrength=strengthPoints.at(-1)??null
  const bestStrength=strengthPoints.length?Math.max(...strengthPoints.map(strengthValue)):null
  const strengthUnit=strengthMetric==='volume'?' кг·повт.':strengthMetric==='reps'||strengthMetric==='total_reps'?' повт.':' кг'

  async function saveQuick(){
    if(!trackingLoaded){setNotice('Настройки замеров не загрузились. Сохранение временно отключено.');return}
    const weight=valueOrNull(quick.weight),waist=valueOrNull(quick.waist)
    const missingRequired=[
      isRequired('weight')&&weight==null?'Вес':null,
      isRequired('waist')&&waist==null?'Талия':null,
    ].filter(Boolean) as string[]
    if(missingRequired.length){setNotice('Заполни обязательные поля: '+missingRequired.join(', '));return}
    if(weight==null&&waist==null){setNotice('Укажи вес или талию.');return}

    const previousWeight=weightEntries.find(m=>m.measured_at<todayKey&&m.weight_kg!=null)
    if(weight!=null&&previousWeight?.weight_kg!=null&&!quickWeightConfirmed){
      const days=Math.round((new Date(todayKey+'T12:00:00').getTime()-new Date(previousWeight.measured_at+'T12:00:00').getTime())/86400000)
      const difference=Math.abs(weight-previousWeight.weight_kg)
      const threshold=Math.max(2.5,previousWeight.weight_kg*.03)
      if(days>=0&&days<=14&&difference>=threshold){
        setQuickWeightConfirmed(true)
        setNotice('Вес отличается от прошлого замера на '+display(difference)+' кг. Проверь число. Если всё верно — нажми «Сохранить» ещё раз.')
        return
      }
    }

    setSaving(true);setNotice('')
    try{
      if(!preview)await saveMeasurement({
        measured_at:appDateKey(),weight_kg:weight,waist_cm:waist,
        chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:quick.note,
      })
      if(!preview)mergeMeasurementLocal(todayKey,{weight_kg:weight,waist_cm:waist,note:quick.note||null})
      setQuick({weight:weight==null?'':String(weight).replace('.',','),waist:waist==null?'':String(waist).replace('.',','),note:quick.note})
      showAppToast(quickAlreadySaved?'Сегодняшний замер изменён.':'Замер за сегодня сохранён.')
      setQuickWeightConfirmed(false)
      setEditingQuick(false)
    }catch(e){
      if(!preview){
        try{
          const server=await loadMeasurements(90)
          const actual=server.find(item=>item.measured_at===todayKey)
          const noteMatches=(actual?.note??'').trim()===quick.note.trim()
          if(actual
            && (weight==null||sameNullableNumber(actual.weight_kg,weight))
            && (waist==null||sameNullableNumber(actual.waist_cm,waist))
            && noteMatches){
            setMeasurements(server)
            setQuick({weight:weight==null?'':String(weight).replace('.',','),waist:waist==null?'':String(waist).replace('.',','),note:quick.note})
            setQuickWeightConfirmed(false);setEditingQuick(false)
            showAppToast('Замер уже был сохранён на сервере.','info')
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось сохранить замер')
    }
    finally{setSaving(false)}
  }

  function openHistoryEditor(measurement?:Measurement){
    setNotice('')
    setHistoryEditor(measurement?{
      mode:'edit',
      date:measurement.measured_at,
      weight:measurement.weight_kg==null?'':String(measurement.weight_kg).replace('.',','),
      waist:measurement.waist_cm==null?'':String(measurement.waist_cm).replace('.',','),
      note:measurement.note??'',
    }:{
      mode:'add',date:todayKey,weight:'',waist:'',note:'',
    })
  }

  async function saveHistoryMeasurement(){
    if(!historyEditor||saving)return
    if(!historyEditor.date){setNotice('Укажи дату замера.');return}
    if(historyEditor.date>todayKey){setNotice('Нельзя добавить замер на будущую дату.');return}
    const weight=valueOrNull(historyEditor.weight),waist=valueOrNull(historyEditor.waist)
    if(weight==null&&waist==null){setNotice('Укажи вес или талию.');return}
    setSaving(true);setNotice('')
    try{
      if(preview){
        setMeasurements(current=>{
          const existing=current.find(m=>m.measured_at===historyEditor.date)
          const next:Measurement=existing?{
            ...existing,
            weight_kg:weight??existing.weight_kg,
            waist_cm:waist??existing.waist_cm,
            note:historyEditor.note,
          }:{
            id:'preview-'+historyEditor.date,
            measured_at:historyEditor.date,
            weight_kg:weight,waist_cm:waist,
            chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,
            note:historyEditor.note,
          }
          return [...current.filter(m=>m.measured_at!==historyEditor.date),next].sort((a,b)=>b.measured_at.localeCompare(a.measured_at))
        })
      }else{
        await saveMeasurement({
          measured_at:historyEditor.date,weight_kg:weight,waist_cm:waist,
          chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,
          note:historyEditor.note,
        })
        mergeMeasurementLocal(historyEditor.date,{weight_kg:weight,waist_cm:waist,note:historyEditor.note||null})
      }
      showAppToast(historyEditor.mode==='edit'?'Замер исправлен.':'Замер добавлен.')
      setHistoryEditor(null)
    }catch(e){
      if(!preview&&historyEditor){
        try{
          const server=await loadMeasurements(120)
          const actual=server.find(item=>item.measured_at===historyEditor.date)
          if(actual
            && (weight==null||sameNullableNumber(actual.weight_kg,weight))
            && (waist==null||sameNullableNumber(actual.waist_cm,waist))
            && (actual.note??'').trim()===historyEditor.note.trim()){
            setMeasurements(server)
            showAppToast(historyEditor.mode==='edit'?'Замер уже был исправлен на сервере.':'Замер уже был добавлен на сервере.','info')
            setHistoryEditor(null)
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось сохранить замер')
    }
    finally{setSaving(false)}
  }

  async function saveMonthlyMeasures(){
    if(!trackingLoaded){setNotice('Настройки прогресса не загрузились. Сохранение замеров временно отключено.');return}
    const values=[
      {code:'chest',label:'Грудь',value:valueOrNull(monthlyMeasures.chest)},
      {code:'hips',label:'Бёдра',value:valueOrNull(monthlyMeasures.hips)},
      {code:'thigh',label:'Бедро',value:valueOrNull(monthlyMeasures.thigh)},
      {code:'arm_relaxed',label:'Рука расслаблена',value:valueOrNull(monthlyMeasures.arm_relaxed)},
      {code:'arm_flexed',label:'Рука напряжена',value:valueOrNull(monthlyMeasures.arm_flexed)},
    ]
    const missingRequired=values.filter(item=>isRequired(item.code)&&item.value==null).map(item=>item.label)
    if(missingRequired.length){setNotice('Заполни обязательные поля: '+missingRequired.join(', '));return}
    if(values.every(item=>item.value==null)){setNotice('Укажи хотя бы один дополнительный замер.');return}
    setSaving(true);setNotice('')
    try{
      if(!preview){
        await saveMeasurement({
          measured_at:todayKey,weight_kg:null,waist_cm:null,
          chest_cm:valueOrNull(monthlyMeasures.chest),hips_cm:valueOrNull(monthlyMeasures.hips),
          thigh_cm:valueOrNull(monthlyMeasures.thigh),arm_relaxed_cm:valueOrNull(monthlyMeasures.arm_relaxed),
          arm_flexed_cm:valueOrNull(monthlyMeasures.arm_flexed),note:null,
        })
        mergeMeasurementLocal(todayKey,{
          chest_cm:valueOrNull(monthlyMeasures.chest),hips_cm:valueOrNull(monthlyMeasures.hips),
          thigh_cm:valueOrNull(monthlyMeasures.thigh),arm_relaxed_cm:valueOrNull(monthlyMeasures.arm_relaxed),
          arm_flexed_cm:valueOrNull(monthlyMeasures.arm_flexed),
        })
      }
      showAppToast('Дополнительные замеры сохранены.')
    }catch(e){
      if(!preview){
        try{
          const server=await loadMeasurements(90)
          const actual=server.find(item=>item.measured_at===todayKey)
          const requested={
            chest_cm:valueOrNull(monthlyMeasures.chest),hips_cm:valueOrNull(monthlyMeasures.hips),
            thigh_cm:valueOrNull(monthlyMeasures.thigh),arm_relaxed_cm:valueOrNull(monthlyMeasures.arm_relaxed),
            arm_flexed_cm:valueOrNull(monthlyMeasures.arm_flexed),
          }
          const matches=actual&&Object.entries(requested).every(([key,value])=>value==null||sameNullableNumber(actual[key as keyof Measurement] as number|null,value))
          if(matches){
            setMeasurements(server)
            showAppToast('Дополнительные замеры уже были сохранены на сервере.','info')
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось сохранить дополнительные замеры')
    }
    finally{setSaving(false)}
  }

  async function saveCheckin(){
    if(!trackingLoaded){setNotice('Настройки прогресса не загрузились. Сохранение самооценки временно отключено.');return}
    const missingRequired=monthlyMeta
      .filter(meta=>isRequired(meta.visibilityCode)&&monthly[meta.key]==null)
      .map(meta=>meta.label)
    if(missingRequired.length){setNotice('Заполни обязательные поля: '+missingRequired.join(', '));return}

    const visibleScores=monthlyMeta.filter(meta=>isVisible(meta.visibilityCode))
    if(visibleScores.length&&visibleScores.every(meta=>monthly[meta.key]==null)){
      setNotice('Поставь хотя бы одну оценку.');return
    }

    setSaving(true);setNotice('')
    try{
      let reminderScheduled=true
      if(preview){
        const item:MonthlyCheckinHistory={...monthly,checkin_date:todayKey}
        const next=[item,...monthlyHistory.filter(x=>x.checkin_date!==todayKey)]
        setMonthlyHistory(next)
        setMonthly(item)
      }else{
        await saveCurrentMonthCheckin(monthly)
        const item:MonthlyCheckinHistory={...monthly,checkin_date:todayKey}
        setMonthlyHistory(current=>[item,...current.filter(x=>x.checkin_date!==todayKey)])
        setMonthly(item)
        void ensureMyProgressCheckinReminder(addDaysKey(todayKey,30)).catch(()=>{
          reminderScheduled=false
          showAppToast('Самооценка сохранена, но напоминание пока не удалось настроить.','warning')
        })
      }
      setCheckinEditing(false)
      setCompareMonthly(false)
      showAppToast(reminderScheduled?'Самооценка сохранена. Напомним примерно через 30 дней.':'Самооценка сохранена, но напоминание пока не удалось настроить.',reminderScheduled?'success':'warning')
    }catch(e){
      if(!preview){
        try{
          const server=await loadMonthlyCheckinHistory(12)
          const actual=server.find(item=>item.checkin_date===todayKey)
          if(actual&&sameMonthlyCheckin(actual,monthly)){
            setMonthlyHistory(server);setMonthly(actual);setCheckinEditing(false);setCompareMonthly(false)
            void ensureMyProgressCheckinReminder(addDaysKey(todayKey,30)).catch(()=>{})
            showAppToast('Самооценка уже была сохранена на сервере.','info')
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось сохранить самооценку')
    }
    finally{setSaving(false)}
  }

  async function togglePhoto(done:boolean){
    const previous=photoDone
    setPhotoDone(done)
    setPhotoSaving(true)
    setNotice('')
    try{
      if(!preview)await setProgressPhotoDone(done)
      showAppToast(done?'Фото отмечено как сделанное в этом месяце.':'Отметка о фото снята.')
    }catch(e){
      if(!preview){
        try{
          const actual=await isProgressPhotoDone()
          setPhotoDone(actual)
          if(actual===done){
            showAppToast(done?'Фото уже отмечено на сервере.':'Отметка уже была снята на сервере.','info')
            return
          }
        }catch{}
      }
      setPhotoDone(previous)
      setNotice(e instanceof Error?e.message:'Не удалось сохранить отметку')
    }finally{
      setPhotoSaving(false)
    }
  }

  return <UiStack className="progress-live-page">
    {loadFailures.length>0&&<UiLoadError
      message={'Часть данных прогресса не загрузилась: '+loadFailures.map(code=>progressLoadLabels[code]).join(', ')+'.'}
      hint="Повторим только неудавшиеся запросы и не затронем введённые сейчас значения."
      onRetry={()=>void retryFailedProgressLoads()}
      retryLabel="Повторить загрузку"
    />}
    <UiCard className={'quick-measure-panel '+(quickAlreadySaved&&!editingQuick?'is-complete':'')}>
      <UiSectionHeader kicker="Быстрый замер" title="Вес и талия" action={quickAlreadySaved?<span className="measurement-saved-badge"><CheckCircle2 size={15}/>Сегодня заполнено</span>:undefined}/>
      {!trackingLoaded
        ? <div className="library-empty">Не удалось загрузить настройки замеров. История доступна, но ввод временно отключён.</div>
        : quickAlreadySaved&&!editingQuick
        ? <div className="quick-measure-complete"><div className="quick-measure-values">{isVisible('weight')&&todayMeasurement?.weight_kg!=null&&<span><small>Вес</small><strong>{display(todayMeasurement.weight_kg)} кг</strong></span>}{isVisible('waist')&&todayMeasurement?.waist_cm!=null&&<span><small>Талия</small><strong>{display(todayMeasurement.waist_cm)} см</strong></span>}</div>{todayMeasurement?.note&&<div className="quick-measure-saved-note"><small>Заметка к замеру</small><p>{todayMeasurement.note}</p></div>}<button className="ghost-button compact" onClick={()=>setEditingQuick(true)}>Изменить</button></div>
        : <><p className="panel-description">Вес можно вносить в любой день — для прогресса приложение ориентируется на среднее за 7 дней. Талию достаточно измерять раз в неделю в одинаковых условиях.</p>
          <p className="measurement-note-hint">Заметка к замеру необязательна и не отправляет отдельное сообщение тренеру. Например: утром натощак, после тренировки или необычный режим.</p>
          <div className="measurement-form live-measurement-form">
            {isVisible('weight')&&<label>Вес, кг<input id="progress-weight-input" className="measurement-value-input" inputMode="decimal" value={quick.weight} onChange={e=>{setQuick(v=>({...v,weight:e.target.value}));setQuickWeightConfirmed(false)}} placeholder={latestWeight!=null?display(latestWeight):'Введите вес'}/></label>}
            {isVisible('waist')&&<label>Талия, см<input id="progress-waist-input" className="measurement-value-input" inputMode="decimal" value={quick.waist} onChange={e=>setQuick(v=>({...v,waist:e.target.value}))} placeholder={latestWaist!=null?display(latestWaist):'Введите талию'}/></label>}
            <label className="wide">Заметка к замеру<textarea className="quick-measure-note" rows={1} value={quick.note} onChange={e=>setQuick(v=>({...v,note:e.target.value}))} placeholder="Например: необычный режим или условия замера"/></label>
            <div className="quick-measure-actions">{quickAlreadySaved&&<button className="ghost-button compact" onClick={()=>setEditingQuick(false)}>Отмена</button>}<button className="primary-button compact" disabled={saving} onClick={()=>void saveQuick()}><Save size={15}/>{saving?'Сохраняю…':quickAlreadySaved?'Сохранить изменения':'Сохранить замер'}</button></div>
          </div></>}
    </UiCard>

    <details className="panel monthly-progress-panel">
      <summary><div className="monthly-progress-summary-copy"><span className="eyebrow">Контрольная точка</span><div className="monthly-progress-title-row"><h3>Расширенный контроль</h3><ChevronDown className="monthly-progress-chevron" size={20}/></div><p>Дополнительные объёмы, фото и самооценка. Раз в месяц — рекомендация, а не ограничение.</p></div></summary>

      <div className="monthly-progress-content">
        <section>
          <div className="monthly-section-head"><div><h4>Дополнительные замеры</h4><p>Снимай объёмы тогда, когда это полезно. Для сравнения лучше одинаковые условия.</p></div></div>
          <div className="monthly-measure-grid">
            {isVisible('chest')&&<label>Грудь, см<input inputMode="decimal" value={monthlyMeasures.chest} onChange={e=>setMonthlyMeasures(v=>({...v,chest:e.target.value}))}/></label>}
            {isVisible('hips')&&<label>Бёдра, см<input inputMode="decimal" value={monthlyMeasures.hips} onChange={e=>setMonthlyMeasures(v=>({...v,hips:e.target.value}))}/></label>}
            {isVisible('thigh')&&<label>Бедро, см<input inputMode="decimal" value={monthlyMeasures.thigh} onChange={e=>setMonthlyMeasures(v=>({...v,thigh:e.target.value}))}/></label>}
            {isVisible('arm_relaxed')&&<label>Рука расслаблена, см<input inputMode="decimal" value={monthlyMeasures.arm_relaxed} onChange={e=>setMonthlyMeasures(v=>({...v,arm_relaxed:e.target.value}))}/></label>}
            {isVisible('arm_flexed')&&<label>Рука напряжена, см<input inputMode="decimal" value={monthlyMeasures.arm_flexed} onChange={e=>setMonthlyMeasures(v=>({...v,arm_flexed:e.target.value}))}/></label>}
          </div>
          <button className="ghost-button compact" disabled={saving||!trackingLoaded} onClick={()=>void saveMonthlyMeasures()}><Save size={15}/>Сохранить замеры</button>
        </section>

        <section className={'progress-photo-card '+(photoDone?'is-complete':'')}>
          <div><Camera size={20}/><div><strong>Фото прогресса</strong><span>Сделай для себя в одинаковом свете и ракурсе. Загружать фото сюда не нужно.</span></div></div>
          {photoDone
            ? <div className="progress-photo-status"><span><CheckCircle2 size={16}/>Отмечено в этом месяце</span><button type="button" className="ghost-button compact" disabled={photoSaving} onClick={()=>void togglePhoto(false)}><RotateCcw size={14}/>{photoSaving?'Сохраняю…':'Отменить отметку'}</button></div>
            : <button type="button" className="primary-button compact" disabled={photoSaving} onClick={()=>void togglePhoto(true)}><CheckCircle2 size={15}/>{photoSaving?'Сохраняю…':'Фото сделано'}</button>}
        </section>

        <section className="progress-checkin-section">
          <div className="monthly-section-head">
            <div><h4>Самооценка</h4><p>Проходить можно в любой день. Для стабильной динамики рекомендуем примерно раз в 30 дней.</p></div>
            {latestCheckin&&!checkinEditing&&<span className="checkin-saved-badge"><CheckCircle2 size={14}/>Сохранено</span>}
          </div>

          {!checkinEditing&&latestCheckin ? <>
            <div className="checkin-saved-summary">
              <div><span>Последняя самооценка</span><strong>{new Date(latestCheckin.checkin_date+'T00:00:00').toLocaleDateString('ru-RU')}</strong></div>
              <div><span>Рекомендуем повторить</span><strong>{nextRecommendedCheckin?new Date(nextRecommendedCheckin+'T00:00:00').toLocaleDateString('ru-RU'):'—'}</strong></div>
              <p><BellRing size={16}/>В рекомендуемую дату приложение напомнит о следующей контрольной точке. Telegram позже подключится к этому же напоминанию.</p>
            </div>

            <div className="checkin-score-summary">
              {monthlyMeta.filter(meta=>isVisible(meta.visibilityCode)).map(meta=>{
                const current=latestCheckin[meta.key]
                const previous=monthlyHistory[1]?.[meta.key]
                const delta=current!=null&&previous!=null?Number(current)-Number(previous):null
                return <article key={meta.key}><span>{meta.label}</span><strong>{current??'—'}</strong>{delta!=null&&delta!==0?<small className={delta>0?'is-positive':'is-negative'}>{delta>0?'+':''}{delta} к прошлой</small>:<small>из 10</small>}</article>
              })}
            </div>

            <div className="checkin-text-summary">
              <div><span>Что улучшить</span><p>{latestCheckin.improve||'—'}</p></div>
              <div><span>Следующий шаг</span><p>{latestCheckin.next_step||'—'}</p></div>
              <div><span>Что оставить</span><p>{latestCheckin.keep||'—'}</p></div>
            </div>

            <div className="monthly-compare-actions">
              <button type="button" className="ghost-button compact" onClick={startFreshMonthlyCheckin}>Пройти самооценку снова</button>
              {monthlyHistory.length>1&&<button type="button" className="ghost-button compact" onClick={()=>setCompareMonthly(v=>!v)}>{compareMonthly?'Скрыть динамику':'Динамика самооценки'}</button>}
            </div>
          </> : <>
            <div className="checkin-edit-note"><Info size={16}/><span>После сохранения ответы перейдут в режим просмотра. Если захочешь пройти самооценку раньше 30 дней — это можно сделать в любой момент.</span></div>
            <div className="monthly-score-grid">
              {monthlyMeta.filter(meta=>isVisible(meta.visibilityCode)).map(meta=><div className="monthly-score-field" key={meta.key}><span className="monthly-score-label">{meta.label}</span><div className="monthly-score-scale" role="group" aria-label={meta.label}>{Array.from({length:10},(_,i)=>i+1).map(n=><button key={n} type="button" className={monthly[meta.key]===n?'is-selected':''} aria-pressed={monthly[meta.key]===n} onClick={()=>setMonthly(v=>({...v,[meta.key]:v[meta.key]===n?null:n}))}>{n}</button>)}</div><div className="monthly-score-anchors"><span>Плохо</span><span>Отлично</span></div></div>)}
            </div>
            <div className="monthly-text-grid">
              <label>Что улучшить?<textarea rows={2} value={monthly.improve} onChange={e=>setMonthly(v=>({...v,improve:e.target.value}))}/></label>
              <label>Следующий шаг<textarea rows={2} value={monthly.next_step} onChange={e=>setMonthly(v=>({...v,next_step:e.target.value}))}/></label>
              <label>Что точно оставить?<textarea rows={2} value={monthly.keep} onChange={e=>setMonthly(v=>({...v,keep:e.target.value}))}/></label>
              <label>Комментарий тренеру <small>необязательно · тренер получит уведомление</small><textarea rows={2} value={monthly.comment} onChange={e=>setMonthly(v=>({...v,comment:e.target.value}))} placeholder="Если есть что обсудить отдельно"/></label>
            </div>
            <div className="monthly-compare-actions">
              <button className="primary-button compact" disabled={saving||!trackingLoaded} onClick={()=>void saveCheckin()}><Save size={15}/>{saving?'Сохраняю…':'Сохранить самооценку'}</button>
              {latestCheckin&&<button type="button" className="ghost-button compact" disabled={saving} onClick={()=>{setMonthly(latestCheckin);setCheckinEditing(false)}}>Отмена</button>}
            </div>
          </>}

          {compareMonthly&&monthlyHistory.length>1&&<div className="monthly-history-compare checkin-history-compare">
            <div className="monthly-history-head"><span>Дата</span>{monthlyMeta.filter(meta=>isVisible(meta.visibilityCode)).map(meta=><span key={meta.key}>{meta.label}</span>)}</div>
            {monthlyHistory.map(item=><div className="monthly-history-row" key={item.checkin_date}><strong>{new Date(item.checkin_date+'T00:00:00').toLocaleDateString('ru-RU',{day:'2-digit',month:'short',year:'2-digit'})}</strong>{monthlyMeta.filter(meta=>isVisible(meta.visibilityCode)).map(meta=><span key={meta.key}>{item[meta.key]??'—'}</span>)}</div>)}
          </div>}
        </section>
      </div>
    </details>

    {!loading&&<details className="panel measurement-history-panel progress-collapsible-panel">
      <summary className="progress-collapse-summary">
        <div><span className="eyebrow">Последние записи</span><div className="progress-collapse-title"><h3>История замеров</h3><ChevronDown className="progress-collapse-chevron" size={20}/></div><p>{quickHistoryEntries.length?<>Последние {Math.min(quickHistoryEntries.length,12)} записей веса, талии и заметок.</>:'Можно добавить пропущенный замер за прошлую дату.'}</p></div>
      </summary>
      <div className="measurement-history-content">
        <div className="measurement-history-toolbar"><button type="button" className="ghost-button compact" onClick={()=>openHistoryEditor()}><CalendarPlus size={15}/>Добавить за другую дату</button></div>
        {quickHistoryEntries.length===0?<div className="library-empty">Истории пока нет. Добавь первый замер за нужную дату.</div>:<div className="measurement-history-list">{quickHistoryEntries.slice(0,12).map(m=><div key={m.id}><strong>{new Date(m.measured_at+'T00:00:00').toLocaleDateString('ru-RU')}</strong><div className="measurement-history-entry"><span>{m.weight_kg!=null?'Вес '+display(m.weight_kg)+' кг':''}{m.weight_kg!=null&&m.waist_cm!=null?' · ':''}{m.waist_cm!=null?'Талия '+display(m.waist_cm)+' см':''}</span>{m.note&&<small className="measurement-history-note">{m.note}</small>}</div><button type="button" className="icon-button measurement-history-edit" aria-label={'Изменить замер за '+m.measured_at} onClick={()=>openHistoryEditor(m)}><Pencil size={14}/></button></div>)}</div>}
      </div>
    </details>}

    <div className="stats-grid compact-stats progress-summary-grid">
      <article className="stat-card"><div className="stat-label">Средний вес · 7 дней</div><div className="stat-value">{display(sevenDayAverage)}{sevenDayAverage!=null?' кг':''}</div><div className="stat-unit">{weeklyWeightDelta==null?`Для тренда нужно по 3+ замера за обе недели · сейчас ${weeklyWeightSummary.currentCount}/${weeklyWeightSummary.previousCount}`:`${weeklyWeightDelta>0?'+':''}${display(weeklyWeightDelta)} кг к прошлой неделе`}</div></article>
      <article className="stat-card"><div className="stat-label">Талия</div><div className="stat-value">{display(latestWaist)}{latestWaist!=null?' см':''}</div><div className="stat-unit">{startWaist!=null?`старт: ${display(startWaist)} см`:'последний сохранённый'}</div></article>
      <article className="stat-card"><div className="stat-label">Вес от старта</div><div className="stat-value">{latestWeight!=null&&startWeight!=null?`${latestWeight-startWeight>0?'+':''}${display(latestWeight-startWeight)} кг`:'—'}</div><div className="stat-unit">{startWeight!=null?`старт: ${display(startWeight)} кг`:'пока нет стартового замера'}</div></article>
      <article className="stat-card"><div className="stat-label">Талия от старта</div><div className="stat-value">{latestWaist!=null&&startWaist!=null?`${latestWaist-startWaist>0?'+':''}${display(latestWaist-startWaist)} см`:'—'}</div><div className="stat-unit">{startWaist!=null?`старт: ${display(startWaist)} см`:'пока нет стартового замера'}</div></article>
    </div>

    <BodyPotentialCard preview={preview} latestWaist={latestWaist} latestWeight={latestWeight}/>

    {notice&&<UiNotice tone="warning">{notice}</UiNotice>}

    <section className="panel chart-panel progress-trend-panel">
      <div className="panel-head progress-chart-head"><div><span className="eyebrow">История</span><h3>Динамика тела</h3></div><div className="progress-metric-tabs"><button className={trendMetric==='weight'?'is-active':''} onClick={()=>setTrendMetric('weight')}>Вес</button><button className={trendMetric==='waist'?'is-active':''} onClick={()=>setTrendMetric('waist')}>Талия</button></div></div>
      {bodyChart?<><div className="chart-wrap"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={bodyChart} fill="none" vectorEffect="non-scaling-stroke"/></svg></div><div className="chart-labels"><span>{bodyTrendPoints[0]?.measured_at}</span><span>{bodyTrendPoints.at(-1)?.measured_at}</span></div></>:<div className="library-empty">Нужно хотя бы два замера {trendMetric==='weight'?'веса':'талии'}, чтобы показать динамику.</div>}
    </section>

    {historyEditor&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setHistoryEditor(null)}}>
      <aside className="exercise-drawer workout-sheet measurement-history-sheet">
        <div className="drawer-head">
          <div><span className="eyebrow">История замеров</span><h3>{historyEditor.mode==='edit'?'Исправить замер':'Добавить замер'}</h3></div>
          <button className="icon-button" disabled={saving} onClick={()=>setHistoryEditor(null)}><X size={18}/></button>
        </div>
        <div className="drawer-body">
          <div className="measurement-history-form">
            <label>Дата<input type="date" max={todayKey} disabled={historyEditor.mode==='edit'} value={historyEditor.date} onChange={e=>setHistoryEditor(v=>v?{...v,date:e.target.value}:v)}/></label>
            {isVisible('weight')&&<label>Вес, кг<input inputMode="decimal" value={historyEditor.weight} onChange={e=>setHistoryEditor(v=>v?{...v,weight:e.target.value}:v)} placeholder={latestWeight!=null?display(latestWeight):'Введите вес'}/></label>}
            {isVisible('waist')&&<label>Талия, см<input inputMode="decimal" value={historyEditor.waist} onChange={e=>setHistoryEditor(v=>v?{...v,waist:e.target.value}:v)} placeholder={latestWaist!=null?display(latestWaist):'Введите талию'}/></label>}
            <label className="wide">Заметка к замеру<textarea rows={2} value={historyEditor.note} onChange={e=>setHistoryEditor(v=>v?{...v,note:e.target.value}:v)} placeholder="Необязательно"/></label>
          </div>
          <p className="sheet-description">Если на эту дату уже есть запись, введённые вес и талия обновят её; остальные замеры тела за этот день сохранятся.</p>
          <div className="finish-workout-actions">
            <button className="ghost-button" disabled={saving} onClick={()=>setHistoryEditor(null)}>Отмена</button>
            <button className="primary-button" disabled={saving} onClick={()=>void saveHistoryMeasurement()}><Save size={15}/>{saving?'Сохраняю…':'Сохранить'}</button>
          </div>
        </div>
      </aside>
    </div>}

    {trainingEnabled&&<details className="panel strength-progress-panel progress-collapsible-panel">
      <summary className="progress-collapse-summary">
        <div><span className="eyebrow">Силовой прогресс</span><div className="progress-collapse-title"><h3>{selectedStrengthExercise?.name??'Упражнения'}</h3><ChevronDown className="progress-collapse-chevron" size={20}/></div><p>Выбери упражнение и смотри изменение силы отдельно от веса тела.</p></div>
      </summary>
      <div className="strength-progress-content">
      <div className="coach-note strength-progress-coach-note"><strong>Комментарий тренера</strong><span>Здесь показываются только упражнения, по которым уже есть минимум две завершённые тренировки с рабочими подходами. Поэтому часть упражнений появится в списке позже — когда будет достаточно данных для честного сравнения.</span></div>
      {!strengthError&&strengthExercises.length>0&&<div className="strength-progress-controls">
        <label>Упражнение<select value={strengthExerciseId} onChange={e=>setStrengthExerciseId(e.target.value)}>{strengthExercises.map(item=><option key={item.exercise_id} value={item.exercise_id}>{item.name}</option>)}</select></label>
        {repsOnly
          ? <div className="progress-metric-tabs strength-metric-tabs"><button className={strengthMetric==='reps'?'is-active':''} onClick={()=>setStrengthMetric('reps')}>Макс. повторов</button><button className={strengthMetric==='total_reps'?'is-active':''} onClick={()=>setStrengthMetric('total_reps')}>Повторы за тренировку</button></div>
          : <div className="progress-metric-tabs strength-metric-tabs"><button className={strengthMetric==='e1rm'?'is-active':''} onClick={()=>setStrengthMetric('e1rm')}>Расч. 1ПМ</button><button className={strengthMetric==='weight'?'is-active':''} onClick={()=>setStrengthMetric('weight')}>Макс. вес</button><button className={strengthMetric==='volume'?'is-active':''} onClick={()=>setStrengthMetric('volume')}>Объём</button></div>}
      </div>}
      {strengthError
        ? <UiLoadError message={strengthError} hint="Повторим загрузку упражнений и их истории." onRetry={()=>setStrengthReloadKey(value=>value+1)}/>
        : strengthLoading?<div className="library-empty">Загружаю силовой прогресс…</div>:strengthExercises.length===0?<div className="library-empty">Пока нет упражнений с двумя завершёнными тренировками и рабочими подходами.</div>:strengthChart&&latestStrength&&firstStrength?<>
        <div className="strength-progress-summary"><div><span>Сейчас</span><strong>{display(strengthValue(latestStrength),strengthMetric==='volume'||strengthMetric==='reps'||strengthMetric==='total_reps'?0:1)}{strengthUnit}</strong></div><div><span>Лучшее</span><strong>{bestStrength==null?'—':display(bestStrength,strengthMetric==='volume'||strengthMetric==='reps'||strengthMetric==='total_reps'?0:1)}{bestStrength!=null?strengthUnit:''}</strong></div><div><span>От первой записи</span><strong>{display(strengthValue(latestStrength)-strengthValue(firstStrength),strengthMetric==='volume'||strengthMetric==='reps'||strengthMetric==='total_reps'?0:1)}{strengthUnit}</strong></div></div>
        <div className="chart-wrap"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={strengthChart} fill="none" vectorEffect="non-scaling-stroke"/></svg></div>
        <div className="chart-labels"><span>{strengthPoints[0]?.date}</span><span>{strengthPoints.at(-1)?.date}</span></div>
        {strengthMetric==='e1rm'&&<p className="strength-progress-note">Расчётный 1ПМ — ориентир по лучшему рабочему подходу за тренировку, а не тест настоящего максимума.</p>}
      </>:<div className="library-empty">Для выбранного упражнения пока недостаточно данных для графика.</div>}
      </div>
    </details>}


  </UiStack>
}
