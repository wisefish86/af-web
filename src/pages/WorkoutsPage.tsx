import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Activity, ArrowLeft, BellRing, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Dumbbell, Info, MessageCircle,
  Minus, Play, Plus, RefreshCcw, Repeat2, TimerReset, Trash2, TrendingUp, X
} from 'lucide-react'
import {
  addWorkoutComment, completeCardioEntry, completeWorkout, completeWorkoutExercise, deleteWorkoutSet, loadActiveTrainingPlan,
  loadExerciseHistory, loadInProgressWorkout, loadLatestCompletedWorkout, loadMyWorkoutSchedule, loadWorkout, loadWorkoutHistory, reopenWorkout, reopenWorkoutExercise, replaceWorkoutExercise, saveMyWorkoutSchedule, saveWorkoutSet, saveWorkoutUiState, startWorkout
} from '../features/workouts/service'
import type { WorkoutHistorySummary } from '../features/workouts/service'
import { loadMyWorkoutFeedback, replyToFeedback, subscribeToFeedbackThread } from '../features/feedback/service'
import type { FeedbackThread } from '../features/feedback/types'
import type {
  ActiveTrainingPlan, ExerciseHistoryEntry, LiveWorkout, LiveWorkoutExercise, WorkoutSchedule, WorkoutSetRecord
} from '../features/workouts/types'
import { estimateOneRepMax, normalizeDecimalInput, parseDecimal } from '../lib/numberInput'
import { CoachHint } from '../components/CoachHint'
import { appDateKey, appIsoWeekday, getAppTimeZone } from '../lib/appDate'
import { showAppToast } from '../lib/toast'
import { UiCard, UiNotice, UiSectionHeader, UiStack } from '../ui/primitives'

type Props = { preview: boolean }

type SetDraft = {
  weight:string
  reps:string
  rir:number | null
  isWarmup:boolean
  completed:boolean
  completedAt:string | null
}

type LoadSuggestion = {exerciseId:string;nextSet:number;currentWeight:number;suggestedWeight:number;reps:number;rir:number|null;hasRir:boolean}
type WorkoutRecord={exerciseId:string;name:string;labels:string[]}

type SheetState =
  | {type:'technique';exercise:LiveWorkoutExercise}
  | {type:'comment';exercise:LiveWorkoutExercise}
  | {type:'replace';exercise:LiveWorkoutExercise}
  | {type:'history';exercise:LiveWorkoutExercise}
  | {type:'warmup';exercise:LiveWorkoutExercise}
  | null

const previewPlan: ActiveTrainingPlan = {
  id:'preview-plan',
  name:'Full Body',
  description:'Две силовые тренировки в неделю. Между тренировками — минимум 48 часов.',
  weekly_frequency:2,
  sessions:[
    {id:'preview-day',name:'Full Body',session_type:'mixed',planned_duration_minutes:70,notes:null},
    {id:'preview-cardio',name:'Кардио',session_type:'cardio',planned_duration_minutes:30,notes:null},
  ],
}

const previewSchedule:WorkoutSchedule={
  id:'preview-schedule',
  weekdays:[1,4],
  local_time:'18:00:00',
  timezone:'Europe/Moscow',
  enabled:true,
  session_by_weekday:{'1':'preview-day','4':'preview-cardio'},
}

const previewWorkout: LiveWorkout = {
  id:'preview-workout',
  training_day_id:'preview-day',
  program_name:'Full Body',
  session_name:'Full Body',
  session_type:'mixed',
  started_at:new Date().toISOString(),
  status:'in_progress',
  comment:null,
  exercises:[
    {
      id:'we-press',exercise_id:'ex-press',name:'Жим гантелей на наклонной скамье',
      instructions:'Сведи лопатки, уверенно упрись стопами. Опускай гантели под контролем и не проваливай плечо.',
      technique_url:null,image_url:null,primary_muscle:'chest',primary_muscles:['Грудь'],secondary_muscles:['Передняя дельта','Трицепс'],sort_order:10,prescribed_sets:3,
      reps_min:8,reps_max:12,rir_min:1,rir_max:2,rir_enabled:true,rest_seconds:180,
      warmup_enabled:true,warmup_load_percent_min:50,warmup_load_percent_max:60,warmup_reps_min:8,warmup_reps_max:10,warmup_rest_seconds:60,warmup_notes:'Разогреться без утомления перед первым рабочим сетом.',
      allow_substitution:true,substitution_group_id:'sg-press',substitution_policy:'strict',exercise_role:'main',
      trainer_notes:'Не уходи чрезмерно глубоко в нижней точке.',completed_at:null,
      sets:[],load_recommendation:null,previous_sets:[
        {set_number:1,weight_kg:30,reps:10,rir:2},
        {set_number:2,weight_kg:30,reps:9,rir:1},
        {set_number:3,weight_kg:28,reps:11,rir:1},
      ],
      substitution_options:[
        {id:'alt-1',name:'Жим штанги на наклонной скамье'},
        {id:'alt-2',name:'Наклонный жим в машине Смита'},
      ],
    },
    {
      id:'we-row',exercise_id:'ex-row',name:'Горизонтальная тяга в блочном тренажёре',
      instructions:'Сохраняй нейтральную поясницу. Тяни локти назад, а не плечи вверх.',
      technique_url:null,image_url:null,primary_muscle:'back',primary_muscles:['Середина спины'],secondary_muscles:['Широчайшие','Бицепс'],sort_order:20,prescribed_sets:3,
      reps_min:8,reps_max:12,rir_min:1,rir_max:2,rir_enabled:true,rest_seconds:150,
      warmup_enabled:true,warmup_load_percent_min:50,warmup_load_percent_max:60,warmup_reps_min:8,warmup_reps_max:10,warmup_rest_seconds:60,warmup_notes:'Разогреться без утомления перед первым рабочим сетом.',
      allow_substitution:true,substitution_group_id:'sg-row',substitution_policy:'flexible',exercise_role:'main',
      trainer_notes:null,completed_at:null,sets:[],previous_sets:[
        {set_number:1,weight_kg:55,reps:12,rir:2},
        {set_number:2,weight_kg:55,reps:11,rir:1},
        {set_number:3,weight_kg:55,reps:10,rir:1},
      ],
      substitution_options:[{id:'alt-3',name:'Тяга гантели одной рукой'}],
    },
    {
      id:'we-leg',exercise_id:'ex-leg',name:'Жим ногами',
      instructions:'Колени по линии носков, таз не отрывай от спинки.',
      technique_url:null,image_url:null,primary_muscle:'quads',primary_muscles:['Квадрицепс','Ягодицы'],secondary_muscles:['Бицепс бедра'],sort_order:30,prescribed_sets:3,
      reps_min:10,reps_max:15,rir_min:1,rir_max:2,rir_enabled:true,rest_seconds:180,
      warmup_enabled:true,warmup_load_percent_min:50,warmup_load_percent_max:60,warmup_reps_min:8,warmup_reps_max:10,warmup_rest_seconds:60,warmup_notes:'Разогреться без утомления перед первым рабочим сетом.',
      allow_substitution:false,substitution_group_id:null,substitution_policy:'strict',exercise_role:'accessory',
      trainer_notes:null,completed_at:null,sets:[],previous_sets:[
        {set_number:1,weight_kg:120,reps:14,rir:2},
        {set_number:2,weight_kg:120,reps:12,rir:1},
        {set_number:3,weight_kg:120,reps:11,rir:1},
      ],
      substitution_options:[],
    },
  ],
  cardio:[
    {
      id:'wc-1',modality_code:'treadmill',modality_name:'Беговая дорожка',
      name:null,sort_order:100,prescribed_duration_minutes:15,prescribed_hr_min:120,
      prescribed_hr_max:135,prescribed_speed_kmh:null,prescribed_incline_percent:6,
      prescribed_distance_km:null,trainer_notes:'Спокойный темп после силовой.',
      actual_duration_minutes:null,actual_hr_avg:null,actual_rpe:null,actual_distance_km:null,
      client_notes:null,completed_at:null,
    },
  ],
}

function sessionStrengthMetrics(sets:WorkoutSetRecord[]){
  const working=sets.filter(set=>!set.is_warmup&&set.completed_at&&set.reps!=null&&set.reps>0)
  if(!working.length)return null
  const weighted=working.filter(set=>set.weight_kg!=null&&set.weight_kg>0)
  return {
    maxWeight:weighted.length?Math.max(...weighted.map(set=>set.weight_kg as number)):null,
    e1rm:weighted.length?Math.max(...weighted.map(set=>estimateOneRepMax(set.weight_kg as number,set.reps as number)??0)):null,
    volume:weighted.length?weighted.reduce((sum,set)=>sum+(set.weight_kg as number)*(set.reps as number),0):null,
    maxReps:Math.max(...working.map(set=>set.reps as number)),
    totalReps:working.reduce((sum,set)=>sum+(set.reps as number),0),
  }
}

function errorMessage(error:unknown,fallback:string){
  if(error instanceof Error&&error.message)return error.message
  if(error&&typeof error==='object'&&'message' in error&&typeof (error as {message?:unknown}).message==='string'){
    const message=(error as {message:string}).message.trim()
    if(message)return message
  }
  return fallback
}

function roleLabel(role: LiveWorkoutExercise['exercise_role']) {
  return role === 'main' ? 'Основное' : role === 'accessory' ? 'Дополнительное' : 'Опционально'
}

function ExerciseMuscleChips({exercise,compact=false}:{exercise:LiveWorkoutExercise;compact?:boolean}) {
  const primary=exercise.primary_muscles??[]
  const secondary=compact?[]:(exercise.secondary_muscles??[])
  if(!primary.length&&!secondary.length)return null
  return <div className={'exercise-muscle-groups'+(compact?' compact':'')}>
    {primary.length>0&&<div className="exercise-muscle-row primary">
      {!compact&&<small>Основные</small>}
      <div>{primary.map(name=><span className="muscle-chip primary" key={'p:'+name}>{name}</span>)}</div>
    </div>}
    {secondary.length>0&&<div className="exercise-muscle-row secondary">
      <small>Дополнительно</small>
      <div>{secondary.map(name=><span className="muscle-chip secondary" key={'s:'+name}>{name}</span>)}</div>
    </div>}
  </div>
}

function previousLabel(exercise:LiveWorkoutExercise) {
  if (!exercise.previous_sets.length) return 'Пока нет предыдущих результатов'
  return exercise.previous_sets
    .map(set => {
      const weight = set.weight_kg == null ? '—' : Number(set.weight_kg).toLocaleString('ru-RU',{maximumFractionDigits:2})
      const reps = set.reps ?? '—'
      return `${weight} × ${reps}`
    })
    .join(' · ')
}

function elapsedLabel(from:string | null,now:number) {
  if (!from) return ''
  const elapsed=Math.max(0,Math.floor((now-new Date(from).getTime())/1000))
  const hours=Math.floor(elapsed/3600)
  const minutes=Math.floor((elapsed%3600)/60)
  const seconds=elapsed%60
  return hours>0
    ? `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`
    : `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`
}

function restLabel(seconds:number) {
  const minutes=Math.floor(seconds/60)
  const rest=seconds%60
  if (!minutes) return `${rest} сек`
  return rest ? `${minutes} мин ${rest} сек` : `${minutes} мин`
}

const WEEKDAYS=[
  {iso:1,short:'Пн',full:'Понедельник'},
  {iso:2,short:'Вт',full:'Вторник'},
  {iso:3,short:'Ср',full:'Среда'},
  {iso:4,short:'Чт',full:'Четверг'},
  {iso:5,short:'Пт',full:'Пятница'},
  {iso:6,short:'Сб',full:'Суббота'},
  {iso:7,short:'Вс',full:'Воскресенье'},
]

function isoWeekday(date:Date){const day=date.getDay();return day===0?7:day}
function dateKey(date:Date){
  const y=date.getFullYear()
  const m=String(date.getMonth()+1).padStart(2,'0')
  const d=String(date.getDate()).padStart(2,'0')
  return `${y}-${m}-${d}`
}

function roundLoadDown(value:number,step=2.5){ return Math.max(step,Math.floor((value+1e-9)/step)*step) }

function liveLoadSuggestion(exercise:LiveWorkoutExercise,draft:SetDraft){
  const weight=parseDecimal(draft.weight)
  const reps=draft.reps.trim()===''?null:Number(draft.reps)
  if(weight==null||weight<=0||reps==null||!Number.isFinite(reps)||reps<=0||exercise.reps_max==null)return null
  const rir=exercise.rir_enabled&&draft.rir!=null?draft.rir:0
  const effective=Math.min(30,reps+rir)
  const e1rm=weight*(1+effective/30)
  const targetEffective=exercise.reps_max+(exercise.rir_enabled?(exercise.rir_min??1):0)
  const step=exercise.load_recommendation?.load_increment_kg ?? 2.5
  const suggested=roundLoadDown(e1rm/(1+targetEffective/30),step)
  if(suggested<=weight||reps<=exercise.reps_max)return null
  return {suggested,e1rm,hasRir:exercise.rir_enabled&&draft.rir!=null}
}

function defaultDraft(exercise:LiveWorkoutExercise,setNumber:number):SetDraft {
  const current = exercise.sets.find(set=>set.set_number===setNumber)
  return {
    weight:current?.weight_kg != null ? String(current.weight_kg) : '',
    reps:current?.reps != null ? String(current.reps) : '',
    rir:current?.rir ?? null,
    isWarmup:current?.is_warmup ?? false,
    completed:Boolean(current?.completed_at),
    completedAt:current?.completed_at ?? null,
  }
}

function beep() {
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const master = ctx.createGain()
    master.gain.setValueAtTime(.0001,ctx.currentTime)
    master.gain.exponentialRampToValueAtTime(.32,ctx.currentTime+.02)
    master.gain.setValueAtTime(.32,ctx.currentTime+.95)
    master.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+1.45)
    master.connect(ctx.destination)

    const notes=[523.25,659.25,783.99,1046.5]
    notes.forEach((frequency,index)=>{
      const osc=ctx.createOscillator()
      const gain=ctx.createGain()
      const start=ctx.currentTime+index*.28
      osc.type='sine'
      osc.frequency.value=frequency
      gain.gain.setValueAtTime(.0001,start)
      gain.gain.exponentialRampToValueAtTime(.9,start+.02)
      gain.gain.setValueAtTime(.9,start+.16)
      gain.gain.exponentialRampToValueAtTime(.0001,start+.26)
      osc.connect(gain)
      gain.connect(master)
      osc.start(start)
      osc.stop(start+.28)
    })
    window.setTimeout(()=>void ctx.close(),1700)
  } catch {}
  navigator.vibrate?.([180,80,180,80,280])
}

export function WorkoutsPage({ preview }:Props) {
  const navigate=useNavigate()
  const location=useLocation()
  const [searchParams]=useSearchParams()
  const routeWorkoutId=searchParams.get('workout')
  const routeExerciseId=searchParams.get('exercise')
  const routeComments=searchParams.get('comments')==='1'
  const [plan,setPlan] = useState<ActiveTrainingPlan | null>(preview ? previewPlan : null)
  const [planLoaded,setPlanLoaded]=useState(preview)
  const [workout,setWorkout] = useState<LiveWorkout | null>(null)
  const [inProgressWorkout,setInProgressWorkout]=useState<LiveWorkout|null>(null)
  const [recentCompletedWorkout,setRecentCompletedWorkout] = useState<LiveWorkout | null>(null)
  const [workoutHistory,setWorkoutHistory]=useState<WorkoutHistorySummary[]>([])
  const [historyExpanded,setHistoryExpanded]=useState(false)
  const [workoutSchedule,setWorkoutSchedule]=useState<WorkoutSchedule|null>(preview?previewSchedule:null)
  const [scheduleOpen,setScheduleOpen]=useState(false)
  const [scheduleWeekdays,setScheduleWeekdays]=useState<number[]>(preview?previewSchedule.weekdays:[])
  const [scheduleTime,setScheduleTime]=useState(preview?previewSchedule.local_time.slice(0,5):'18:00')
  const [scheduleSessions,setScheduleSessions]=useState<Record<string,string>>(preview?previewSchedule.session_by_weekday:{})
  const [calendarMonth,setCalendarMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1))
  const [loading,setLoading] = useState(!preview)
  const [busy,setBusy] = useState(false)
  const [notice,setNotice] = useState('')
  const [setDrafts,setSetDrafts] = useState<Record<string,SetDraft>>({})
  const [activeExerciseId,setActiveExerciseId] = useState<string | null>(null)
  const [extraSets,setExtraSets] = useState<Record<string,number>>({})
  const [sheet,setSheet] = useState<SheetState>(null)
  const [comment,setComment] = useState('')
  const [commentNotice,setCommentNotice]=useState('')
  const [commentThread,setCommentThread]=useState<FeedbackThread|null>(null)
  const [commentLoading,setCommentLoading]=useState(false)
  const [exerciseHistory,setExerciseHistory] = useState<ExerciseHistoryEntry[]>([])
  const [historyLoading,setHistoryLoading] = useState(false)
  const [timerEnd,setTimerEnd] = useState<number | null>(null)
  const [timerName,setTimerName] = useState('')
  const [remaining,setRemaining] = useState(0)
  const [now,setNow] = useState(()=>Date.now())
  const timerFinishedRef = useRef(false)
  const [cardioDrafts,setCardioDrafts] = useState<Record<string,{duration:string;hr:string;rpe:string;distance:string}>>({})
  const [finishConfirmation,setFinishConfirmation] = useState<string | null>(null)
  const [finishComment,setFinishComment]=useState('')
  const [removeSetConfirmation,setRemoveSetConfirmation]=useState<{exercise:LiveWorkoutExercise;setNumber:number}|null>(null)
  const [loadSuggestion,setLoadSuggestion]=useState<LoadSuggestion|null>(null)
  const [workoutRecords,setWorkoutRecords]=useState<WorkoutRecord[]>([])
  const [recordsLoading,setRecordsLoading]=useState(false)
  const commentRequestRef=useRef<{key:string;body:string;id:string}|null>(null)
  const commentExerciseId=sheet?.type==='comment'?sheet.exercise.id:null
  const setWriteQueuesRef=useRef<Record<string,Promise<void>>>({})

  function localSetDraftKey(exerciseId:string,setNumber:number){
    return workout&&!preview?`andrey-fit:set-draft:${workout.id}:${exerciseId}:${setNumber}`:null
  }

  function workoutFeedbackDraftKey(exerciseId:string){return 'andrey-fit:feedback-draft:'+exerciseId}
  function readWorkoutFeedbackDraft(exerciseId:string):{body:string;requestId:string}|null{
    if(preview)return null
    try{
      const raw=localStorage.getItem(workoutFeedbackDraftKey(exerciseId))
      if(!raw)return null
      const parsed=JSON.parse(raw) as {body?:unknown;requestId?:unknown}
      return typeof parsed.body==='string'&&typeof parsed.requestId==='string'?{body:parsed.body,requestId:parsed.requestId}:null
    }catch{return null}
  }
  function storeWorkoutFeedbackDraft(exerciseId:string,body:string){
    if(preview)return null
    const text=body
    if(!text){try{localStorage.removeItem(workoutFeedbackDraftKey(exerciseId))}catch{};return null}
    const current=readWorkoutFeedbackDraft(exerciseId)
    const draft=current?.body===text?current:{body:text,requestId:crypto.randomUUID()}
    try{localStorage.setItem(workoutFeedbackDraftKey(exerciseId),JSON.stringify(draft))}catch{}
    return draft
  }
  function clearWorkoutFeedbackDraft(exerciseId:string){
    if(preview)return
    try{localStorage.removeItem(workoutFeedbackDraftKey(exerciseId))}catch{}
  }

  function saveLocalSetDraft(exerciseId:string,setNumber:number,draft:SetDraft){
    const key=localSetDraftKey(exerciseId,setNumber)
    if(!key)return
    try{localStorage.setItem(key,JSON.stringify(draft))}catch{}
  }

  function clearLocalSetDraft(exerciseId:string,setNumber:number){
    const key=localSetDraftKey(exerciseId,setNumber)
    if(!key)return
    try{localStorage.removeItem(key)}catch{}
  }

  function restoreLocalSetDraft(exerciseId:string,setNumber:number,fallback:SetDraft):SetDraft{
    const key=localSetDraftKey(exerciseId,setNumber)
    if(!key)return fallback
    try{
      const raw=localStorage.getItem(key)
      if(!raw)return fallback
      const saved=JSON.parse(raw) as Partial<SetDraft>
      return {
        weight:typeof saved.weight==='string'?saved.weight:fallback.weight,
        reps:typeof saved.reps==='string'?saved.reps:fallback.reps,
        rir:typeof saved.rir==='number'||saved.rir===null?saved.rir:fallback.rir,
        isWarmup:typeof saved.isWarmup==='boolean'?saved.isWarmup:fallback.isWarmup,
        completed:fallback.completed,
        completedAt:fallback.completedAt,
      }
    }catch{return fallback}
  }

  async function queueSetWrite(exerciseId:string,setNumber:number,write:()=>Promise<void>){
    const key=`${exerciseId}:${setNumber}`
    const previous=setWriteQueuesRef.current[key]??Promise.resolve()
    const next=previous.catch(()=>{}).then(write)
    setWriteQueuesRef.current[key]=next
    try{await next}
    finally{if(setWriteQueuesRef.current[key]===next)delete setWriteQueuesRef.current[key]}
  }


  useEffect(()=>{
    if(preview)return
    let cancelled=false
    setLoading(true)
    Promise.allSettled([loadActiveTrainingPlan(),loadInProgressWorkout(),loadLatestCompletedWorkout(),loadWorkoutHistory(90),loadMyWorkoutSchedule()])
      .then(async ([planResult,workoutResult,recentResult,historyResult,scheduleResult])=>{
        if(cancelled)return
        const failed:string[]=[]
        let activeWorkout=workoutResult.status==='fulfilled'?workoutResult.value:null
        let history=historyResult.status==='fulfilled'?historyResult.value:null

        if(planResult.status==='fulfilled'){setPlan(planResult.value);setPlanLoaded(true)}
        else {setPlanLoaded(false);failed.push('активная программа')}

        if(workoutResult.status==='fulfilled')setInProgressWorkout(activeWorkout)
        else failed.push('текущая тренировка')

        if(recentResult.status==='fulfilled')setRecentCompletedWorkout(recentResult.value)
        else failed.push('последняя тренировка')

        if(history)setWorkoutHistory(history)
        else failed.push('история')

        if(scheduleResult.status==='fulfilled'){
          const schedule=scheduleResult.value
          setWorkoutSchedule(schedule)
          if(schedule){
            setScheduleWeekdays(schedule.weekdays)
            setScheduleTime(schedule.local_time.slice(0,5))
            setScheduleSessions(schedule.session_by_weekday)
          }
        }else failed.push('расписание')

        if(routeWorkoutId&&activeWorkout?.id===routeWorkoutId){
          setWorkout(activeWorkout)
        }else if(!routeWorkoutId&&activeWorkout){
          setWorkout(activeWorkout)
          navigate('/workouts?workout='+encodeURIComponent(activeWorkout.id),{replace:true,state:{fromWorkouts:true,autoResume:true}})
        }else{
          setWorkout(null)
        }
        setNotice(failed.length?'Часть данных тренировок не загрузилась: '+failed.join(', ')+'. Доступные части страницы можно использовать.':'')
      })
      .finally(()=>{if(!cancelled)setLoading(false)})
    return ()=>{cancelled=true}
  },[preview])

  useEffect(()=>{
    if(preview||workout?.status!=='completed'){
      setWorkoutRecords([])
      setRecordsLoading(false)
      return
    }
    let cancelled=false
    setRecordsLoading(true)
    detectWorkoutRecords(workout)
      .then(records=>{if(!cancelled)setWorkoutRecords(records)})
      .catch(()=>{if(!cancelled)setWorkoutRecords([])})
      .finally(()=>{if(!cancelled)setRecordsLoading(false)})
    return()=>{cancelled=true}
  },[preview,workout?.id,workout?.status])

  useEffect(()=>{
    if(preview||loading)return
    if(!routeWorkoutId){
      setWorkout(null)
      setActiveExerciseId(null)
      return
    }
    if(workout?.id===routeWorkoutId)return
    if(inProgressWorkout?.id===routeWorkoutId){
      setWorkout(inProgressWorkout)
      return
    }
    let cancelled=false
    setBusy(true)
    loadWorkout(routeWorkoutId)
      .then(item=>{if(!cancelled)setWorkout(item)})
      .catch(error=>{if(!cancelled)showAppToast(error instanceof Error?error.message:'Не удалось открыть тренировку','error')})
      .finally(()=>{if(!cancelled)setBusy(false)})
    return ()=>{cancelled=true}
  },[preview,loading,routeWorkoutId,inProgressWorkout?.id])

  useEffect(()=>{
    if(!workout){
      setActiveExerciseId(null)
      return
    }
    if(routeExerciseId&&workout.exercises.some(exercise=>exercise.id===routeExerciseId)){
      setActiveExerciseId(routeExerciseId)
    }else{
      setActiveExerciseId(null)
    }
  },[routeExerciseId,workout?.id])

  useEffect(()=>{
    if(!routeComments||!workout||!routeExerciseId)return
    const exercise=workout.exercises.find(item=>item.id===routeExerciseId)
    if(exercise)void openComment(exercise)
  },[routeComments,routeExerciseId,workout?.id])

  useEffect(()=>{
    if(preview||!commentThread?.id||!commentExerciseId)return
    let debounceTimer:number|null=null
    const refreshThread=()=>void loadMyWorkoutFeedback(commentExerciseId).then(thread=>{if(thread)setCommentThread(thread)}).catch(()=>{})
    const scheduleRefresh=()=>{
      if(debounceTimer!==null)window.clearTimeout(debounceTimer)
      debounceTimer=window.setTimeout(refreshThread,100)
    }
    const stop=subscribeToFeedbackThread(commentThread.id,scheduleRefresh)
    const pollTimer=window.setInterval(refreshThread,30000)
    const onVisible=()=>{if(document.visibilityState==='visible')scheduleRefresh()}
    window.addEventListener('online',scheduleRefresh)
    document.addEventListener('visibilitychange',onVisible)
    return()=>{
      if(debounceTimer!==null)window.clearTimeout(debounceTimer)
      window.clearInterval(pollTimer)
      window.removeEventListener('online',scheduleRefresh)
      document.removeEventListener('visibilitychange',onVisible)
      stop()
    }
  },[preview,commentThread?.id,commentExerciseId])

  useEffect(()=>{
    if (!workout) return
    const drafts:Record<string,SetDraft> = {}
    for (const exercise of workout.exercises) {
      const count = Math.max(exercise.prescribed_sets,...exercise.sets.map(set=>set.set_number))
      if (exercise.warmup_enabled) {
        const fallback={...defaultDraft(exercise,0),isWarmup:true}
        drafts[`${exercise.id}:0`] = restoreLocalSetDraft(exercise.id,0,fallback)
      }
      for (let n=1;n<=count;n++) {
        const fallback=defaultDraft(exercise,n)
        drafts[`${exercise.id}:${n}`] = restoreLocalSetDraft(exercise.id,n,fallback)
      }
    }
    setSetDrafts(drafts)
    setExtraSets(Object.fromEntries(workout.exercises.map(exercise=>{
      const highestSavedSet=Math.max(exercise.prescribed_sets,...exercise.sets.map(set=>set.set_number))
      return [exercise.id,Math.max(0,highestSavedSet-exercise.prescribed_sets)]
    })))
    if (workout.status==='in_progress') {
      setTimerEnd(workout.rest_timer_end_at ? new Date(workout.rest_timer_end_at).getTime() : null)
      setTimerName(workout.rest_timer_name ?? '')
    }
    setCardioDrafts(Object.fromEntries(workout.cardio.map(item=>[item.id,{
      duration:item.actual_duration_minutes==null?'':String(item.actual_duration_minutes),
      hr:item.actual_hr_avg==null?'':String(item.actual_hr_avg),
      rpe:item.actual_rpe==null?'':String(item.actual_rpe),
      distance:item.actual_distance_km==null?'':String(item.actual_distance_km),
    }])))
  },[workout?.id])

  useEffect(()=>{
    if (preview || !workout || workout.status!=='in_progress') return
    const handle=window.setTimeout(()=>{
      void saveWorkoutUiState(workout.id,activeExerciseId,timerEnd ? new Date(timerEnd).toISOString() : null,timerName).catch(()=>{})
    },250)
    return ()=>window.clearTimeout(handle)
  },[preview,workout?.id,workout?.status,activeExerciseId,timerEnd,timerName])

  useEffect(()=>{
    if (!workout || workout.status!=='in_progress') return
    setNow(Date.now())
    const id=window.setInterval(()=>setNow(Date.now()),1000)
    return ()=>window.clearInterval(id)
  },[workout?.id,workout?.status])

  useEffect(()=>{
    if (!timerEnd) {
      setRemaining(0)
      timerFinishedRef.current=false
      return
    }
    const tick = () => {
      const next = Math.max(0,Math.ceil((timerEnd-Date.now())/1000))
      setRemaining(next)
      if (next===0 && !timerFinishedRef.current) {
        timerFinishedRef.current=true
        beep()
      }
    }
    tick()
    const id = window.setInterval(tick,250)
    return ()=>window.clearInterval(id)
  },[timerEnd])

  function openWorkoutRoute(item:LiveWorkout){
    setWorkout(item)
    setActiveExerciseId(null)
    navigate('/workouts?workout='+encodeURIComponent(item.id),{state:{fromWorkouts:true}})
  }

  function openExercise(exerciseId:string){
    if(!workout)return
    setActiveExerciseId(exerciseId)
    navigate('/workouts?workout='+encodeURIComponent(workout.id)+'&exercise='+encodeURIComponent(exerciseId),{state:{fromWorkout:true}})
  }

  function closeExercise(){
    setActiveExerciseId(null)
    if(location.state?.fromWorkout)navigate(-1)
    else if(workout)navigate('/workouts?workout='+encodeURIComponent(workout.id),{replace:true})
    else navigate('/workouts',{replace:true})
  }

  function closeWorkout(){
    setWorkout(null)
    setActiveExerciseId(null)
    if(location.state?.fromWorkouts)navigate(-1)
    else navigate('/workouts',{replace:true})
  }

  function openPastWorkout(id:string){
    setNotice('')
    setActiveExerciseId(null)
    navigate('/workouts?workout='+encodeURIComponent(id)+'&history=1',{state:{fromWorkouts:true,history:true}})
  }

  const workoutElapsedSeconds=workout?.status==='in_progress'?Math.max(0,Math.floor((now-new Date(workout.started_at).getTime())/1000)):0
  const workoutElapsedLabel=`${String(Math.floor(workoutElapsedSeconds/3600)).padStart(2,'0')}:${String(Math.floor((workoutElapsedSeconds%3600)/60)).padStart(2,'0')}:${String(workoutElapsedSeconds%60).padStart(2,'0')}`

  const completedSetCount = useMemo(()=>{
    if (!workout) return 0
    return Object.entries(setDrafts).filter(([,draft])=>draft.completed&&!draft.isWarmup).length
  },[workout,setDrafts])

  function sessionForWeekday(weekday:number){
    if(!plan?.sessions.length)return null
    const explicit=workoutSchedule?.session_by_weekday?.[String(weekday)] ?? scheduleSessions[String(weekday)]
    const found=explicit?plan.sessions.find(session=>session.id===explicit):null
    if(found)return found
    const sorted=[...(workoutSchedule?.weekdays??scheduleWeekdays)].sort((a,b)=>a-b)
    const index=Math.max(0,sorted.indexOf(weekday))
    return plan.sessions[index%plan.sessions.length] ?? plan.sessions[0]
  }

  function toggleScheduleDay(weekday:number){
    setScheduleWeekdays(current=>{
      const on=current.includes(weekday)
      const next=on?current.filter(day=>day!==weekday):[...current,weekday].sort((a,b)=>a-b)
      if(on){
        setScheduleSessions(map=>{const copy={...map};delete copy[String(weekday)];return copy})
      }else if(plan?.sessions.length){
        const used=next.filter(day=>day!==weekday).length
        setScheduleSessions(map=>({...map,[String(weekday)]:map[String(weekday)]??plan.sessions[used%plan.sessions.length].id}))
      }
      return next
    })
  }

  async function saveSchedule(){
    setBusy(true);setNotice('')
    try{
      if(scheduleWeekdays.length&&plan?.sessions.length){
        const missing=scheduleWeekdays.filter(day=>!(scheduleSessions[String(day)]??sessionForWeekday(day)?.id))
        if(missing.length)throw new Error('Для каждого выбранного дня укажи тренировку.')
      }
      const timezone=getAppTimeZone()
      if(preview){
        const next:WorkoutSchedule={id:'preview-schedule',weekdays:scheduleWeekdays,local_time:scheduleTime+':00',timezone,enabled:scheduleWeekdays.length>0,session_by_weekday:scheduleSessions}
        setWorkoutSchedule(next)
      }else{
        const next=await saveMyWorkoutSchedule({id:workoutSchedule?.id,weekdays:scheduleWeekdays,localTime:scheduleTime,sessionByWeekday:scheduleSessions,timezone})
        setWorkoutSchedule(next)
      }
      setScheduleOpen(false)
      showAppToast(scheduleWeekdays.length?'Расписание тренировок сохранено. Напоминание придёт в выбранные дни.':'Расписание отключено.')
    }catch(error){showAppToast(error instanceof Error?error.message:'Не удалось сохранить расписание','error')}
    finally{setBusy(false)}
  }

  async function begin(sessionId:string) {
    setBusy(true);setNotice('')
    try {
      if (preview) {
        const item={...previewWorkout,session_name:previewPlan.sessions.find(s=>s.id===sessionId)?.name ?? 'Full Body'}
        openWorkoutRoute(item)
      } else {
        const id = await startWorkout(sessionId)
        const item=await loadWorkout(id)
        setInProgressWorkout(item)
        openWorkoutRoute(item)
      }
    } catch (error) {
      showAppToast(error instanceof Error ? error.message : 'Не удалось начать тренировку','error')
    } finally {setBusy(false)}
  }

  async function resumeCompletedWorkout(target:LiveWorkout){
    setBusy(true);setNotice('')
    try{
      if(preview){
        const item={...target,status:'in_progress' as const}
        setInProgressWorkout(item)
        openWorkoutRoute(item)
        if(recentCompletedWorkout?.id===target.id)setRecentCompletedWorkout(null)
      }else{
        const id=await reopenWorkout(target.id)
        const item=await loadWorkout(id)
        setInProgressWorkout(item)
        openWorkoutRoute(item)
        if(id===target.id){
          if(recentCompletedWorkout?.id===target.id)setRecentCompletedWorkout(null)
          showAppToast('Тренировка возобновлена. Все сохранённые результаты на месте.','info')
        }else{
          showAppToast('У тебя уже была незавершённая тренировка — продолжаем её.','info')
        }
      }
    }catch(error){showAppToast(errorMessage(error,'Не удалось возобновить тренировку'),'error')}
    finally{setBusy(false)}
  }

  async function continueCompletedWorkout(){
    if(recentCompletedWorkout)await resumeCompletedWorkout(recentCompletedWorkout)
  }

  function patchSet(exerciseId:string,setNumber:number,patch:Partial<SetDraft>) {
    const key=`${exerciseId}:${setNumber}`
    setSetDrafts(current=>{
      const next={...(current[key] ?? {weight:'',reps:'',rir:null,isWarmup:false,completed:false,completedAt:null}),...patch}
      if(!next.completed)saveLocalSetDraft(exerciseId,setNumber,next)
      return {...current,[key]:next}
    })
  }

  async function finishSet(exercise:LiveWorkoutExercise,setNumber:number) {
    const key=`${exercise.id}:${setNumber}`
    const draft=setDrafts[key] ?? defaultDraft(exercise,setNumber)
    const reps=draft.reps.trim()==='' ? null : Number(draft.reps)
    const weight=parseDecimal(draft.weight)
    if (reps==null || !Number.isInteger(reps) || reps<0) {
      showAppToast('Укажи количество повторов целым числом.','warning')
      return
    }

    const isWarmup=setNumber===0 || draft.isWarmup
    const completedAt=new Date().toISOString()
    setBusy(true);setNotice('')
    try {
      if (!preview) {
        await queueSetWrite(exercise.id,setNumber,async()=>{
          await saveWorkoutSet(exercise.id,{
            set_number:setNumber,weight_kg:weight,reps,rir:isWarmup ? null : (exercise.rir_enabled ? draft.rir : null),is_warmup:isWarmup,completed_at:completedAt,
          })
        })
        clearLocalSetDraft(exercise.id,setNumber)
      }
      patchSet(exercise.id,setNumber,{completed:true,completedAt,isWarmup})
      if(!isWarmup){
        const smart=liveLoadSuggestion(exercise,{...draft,completed:true,completedAt,isWarmup:false})
        if(smart){
          const nextSet=setNumber+1
          const total=exercise.prescribed_sets+(extraSets[exercise.id] ?? 0)
          if(nextSet<=total){
            setLoadSuggestion({exerciseId:exercise.id,nextSet,currentWeight:weight??0,suggestedWeight:smart.suggested,reps,rir:draft.rir,hasRir:smart.hasRir})
          }
        }
      }
      const supersetPartner=!isWarmup && exercise.superset_group!=null ? workout?.exercises.find(item=>item.superset_group===exercise.superset_group && item.id!==exercise.id) : null
      const partnerSet=supersetPartner ? (setDrafts[`${supersetPartner.id}:${setNumber}`] ?? defaultDraft(supersetPartner,setNumber)) : null
      const exerciseHasNext=setNumber < exercise.prescribed_sets+(extraSets[exercise.id] ?? 0)
      const partnerHasThisSet=Boolean(supersetPartner && setNumber <= supersetPartner.prescribed_sets+(extraSets[supersetPartner.id] ?? 0))
      if (supersetPartner && exercise.superset_position===1 && partnerHasThisSet && !partnerSet?.completed) {
        // A1 -> A2 immediately. Rest belongs to the whole pair, not to A1.
        setTimerEnd(null)
        setTimerName('')
        setActiveExerciseId(supersetPartner.id)
        navigate('/workouts?workout='+encodeURIComponent(workout!.id)+'&exercise='+encodeURIComponent(supersetPartner.id),{replace:true,state:{fromWorkout:true}})
        showAppToast('Связка: дальше — '+supersetPartner.name+'.','info')
      } else if (supersetPartner && exercise.superset_position===2) {
        const firstExercise=supersetPartner.superset_position===1 ? supersetPartner : exercise
        const firstTotal=firstExercise.prescribed_sets+(extraSets[firstExercise.id] ?? 0)
        const secondTotal=exercise.prescribed_sets+(extraSets[exercise.id] ?? 0)
        const nextRound=setNumber+1
        const firstHasNext=nextRound<=firstTotal
        const secondHasNext=nextRound<=secondTotal
        if (firstHasNext || secondHasNext) {
          setTimerName('Связка '+String.fromCharCode(64+(exercise.superset_group ?? 1)))
          setTimerEnd(Date.now()+exercise.rest_seconds*1000)
          timerFinishedRef.current=false
          // Unequal pair: continue whichever exercise still has prescribed sets.
          const nextExerciseId=firstHasNext ? firstExercise.id : exercise.id
          setActiveExerciseId(nextExerciseId)
          navigate('/workouts?workout='+encodeURIComponent(workout!.id)+'&exercise='+encodeURIComponent(nextExerciseId),{replace:true,state:{fromWorkout:true}})
        } else {
          setTimerEnd(null)
          setTimerName('')
          setActiveExerciseId(null)
          showAppToast('Связка завершена.')
        }
      } else if (supersetPartner && exercise.superset_position===1 && !partnerHasThisSet) {
        // A1 has more rounds than A2: continue A1 as a normal standalone exercise.
        if(exerciseHasNext){
          setTimerName(exercise.name)
          setTimerEnd(Date.now()+exercise.rest_seconds*1000)
          timerFinishedRef.current=false
        }else{
          setTimerEnd(null);setTimerName('')
        }
      } else {
        setTimerName(isWarmup ? exercise.name+' · после разминки' : exercise.name)
        setTimerEnd(Date.now()+(isWarmup ? exercise.warmup_rest_seconds : exercise.rest_seconds)*1000)
        timerFinishedRef.current=false
      }
    } catch (error) {
      showAppToast(error instanceof Error ? error.message : 'Не удалось сохранить сет','error')
    } finally {setBusy(false)}
  }

  async function openExerciseHistory(exercise:LiveWorkoutExercise) {
    setSheet({type:'history',exercise})
    setExerciseHistory([])
    if(preview){
      setExerciseHistory([
        {workout_session_id:'h1',workout_date:'2026-09-20',completed_at:null,sets:exercise.previous_sets.map((set,i)=>({...set,id:'p'+i,is_warmup:false,completed_at:'2026-09-20T10:00:00Z'}))},
        {workout_session_id:'h2',workout_date:'2026-09-13',completed_at:null,sets:exercise.previous_sets.map((set,i)=>({...set,id:'q'+i,weight_kg:set.weight_kg==null?null:Math.max(0,set.weight_kg-2.5),reps:set.reps==null?null:Math.max(1,set.reps-1),is_warmup:false,completed_at:'2026-09-13T10:00:00Z'}))},
      ])
      return
    }
    setHistoryLoading(true)
    try{
      setExerciseHistory(await loadExerciseHistory(exercise.exercise_id,12))
    }catch(error){
      showAppToast(error instanceof Error?error.message:'Не удалось загрузить историю упражнения','error')
    }finally{setHistoryLoading(false)}
  }

  async function persistSetDraft(exercise:LiveWorkoutExercise,setNumber:number,draft:SetDraft) {
    if (preview || draft.completed) return
    const reps=draft.reps.trim()==='' ? null : Number(draft.reps)
    const weight=parseDecimal(draft.weight)
    if (weight==null && reps==null && draft.rir==null) return
    const isWarmup=setNumber===0 || draft.isWarmup
    try {
      await queueSetWrite(exercise.id,setNumber,async()=>{
        await saveWorkoutSet(exercise.id,{
          set_number:setNumber,
          weight_kg:weight,
          reps:Number.isInteger(reps) ? reps : null,
          rir:isWarmup ? null : (exercise.rir_enabled ? draft.rir : null),
          is_warmup:isWarmup,
          completed_at:null,
        })
      })
      clearLocalSetDraft(exercise.id,setNumber)
    } catch (error) {
      showAppToast(error instanceof Error ? error.message : 'Не удалось сохранить черновик сета','error')
    }
  }

  async function deleteExtraSet(exercise:LiveWorkoutExercise,setNumber:number) {
    const extraCount=extraSets[exercise.id] ?? 0
    if(extraCount<=0)return
    const key=`${exercise.id}:${setNumber}`
    setBusy(true);setNotice('')
    try {
      if (!preview) {
        await queueSetWrite(exercise.id,setNumber,async()=>{await deleteWorkoutSet(exercise.id,setNumber)})
        clearLocalSetDraft(exercise.id,setNumber)
      }
      setSetDrafts(current=>{
        const next={...current}
        delete next[key]
        return next
      })
      setExtraSets(current=>({...current,[exercise.id]:Math.max(0,extraCount-1)}))
      setRemoveSetConfirmation(null)
      showAppToast('Дополнительный сет удалён.')
    } catch (error) {
      showAppToast(error instanceof Error ? error.message : 'Не удалось удалить сет','error')
    } finally {setBusy(false)}
  }

  async function removeLastExtraSet(exercise:LiveWorkoutExercise) {
    const extraCount=extraSets[exercise.id] ?? 0
    if (extraCount<=0) return

    const setNumber=exercise.prescribed_sets+extraCount
    const key=`${exercise.id}:${setNumber}`
    const draft=setDrafts[key] ?? defaultDraft(exercise,setNumber)
    const hasData=draft.weight.trim()!=='' || draft.reps.trim()!=='' || draft.rir!=null || draft.completed

    if(hasData){
      setRemoveSetConfirmation({exercise,setNumber})
      return
    }
    await deleteExtraSet(exercise,setNumber)
  }

  async function finishExercise(exercise:LiveWorkoutExercise) {
    const completedAt=new Date().toISOString()
    setBusy(true);setNotice('')
    try {
      if (!preview) await completeWorkoutExercise(exercise.id,completedAt)
      setWorkout(current=>current ? {
        ...current,
        exercises:current.exercises.map(item=>item.id===exercise.id?{...item,completed_at:completedAt}:item),
      } : current)
      setLoadSuggestion(null)
      setActiveExerciseId(null)
      setTimerEnd(null)
    } catch (error) {
      showAppToast(error instanceof Error ? error.message : 'Не удалось завершить упражнение','error')
    } finally {setBusy(false)}
  }

  async function replaceExercise(exercise:LiveWorkoutExercise,newExerciseId:string) {
    setBusy(true);setNotice('')
    try {
      if (preview) {
        const option=exercise.substitution_options.find(item=>item.id===newExerciseId)
        if (option) setWorkout(current=>current ? {...current,exercises:current.exercises.map(item=>item.id===exercise.id?{...item,exercise_id:option.id,name:option.name}:item)} : current)
      } else {
        await replaceWorkoutExercise(exercise.id,newExerciseId)
        setWorkout(await loadWorkout(workout!.id))
      }
      setSheet(null)
    } catch (error) {
      showAppToast(error instanceof Error ? error.message : 'Не удалось заменить упражнение','error')
    } finally {setBusy(false)}
  }

  async function openComment(exercise:LiveWorkoutExercise){
    setSheet({type:'comment',exercise})
    const storedDraft=readWorkoutFeedbackDraft(exercise.id)
    setComment(storedDraft?.body??'')
    if(storedDraft)commentRequestRef.current={key:'exercise:'+exercise.id,body:storedDraft.body,id:storedDraft.requestId}
    setCommentNotice('')
    setCommentThread(null)
    if(preview)return
    setCommentLoading(true)
    try{
      setCommentThread(await loadMyWorkoutFeedback(exercise.id))
    }catch(error){
      setCommentNotice(error instanceof Error?error.message:'Не удалось загрузить переписку')
    }finally{setCommentLoading(false)}
  }

  async function sendComment(exercise:LiveWorkoutExercise) {
    const body=comment.trim()
    if (!body) {
      setCommentNotice('Напиши сообщение перед отправкой.')
      return
    }
    setBusy(true);setCommentNotice('')
    try {
      if (preview) {
        const now=new Date().toISOString()
        const clientId='preview-client'
        setCommentThread(current=>current?{
          ...current,status:'new',updated_at:now,messages:[...current.messages,{id:'preview-'+Date.now(),author_id:clientId,body,created_at:now}],
        }:{
          id:'preview-thread',client_id:clientId,client_name:'Вы',workout_exercise_id:exercise.id,exercise_name:exercise.name,
          status:'new',created_at:now,updated_at:now,messages:[{id:'preview-'+Date.now(),author_id:clientId,body,created_at:now}],
        })
      } else {
        const requestKey=commentThread?.id??('exercise:'+exercise.id)
        const stored=readWorkoutFeedbackDraft(exercise.id)
        const previous=commentRequestRef.current
        const request=stored?.body===body
          ? {key:requestKey,body,id:stored.requestId}
          : previous&&previous.body===body
            ? {...previous,key:requestKey}
            : {key:requestKey,body,id:crypto.randomUUID()}
        commentRequestRef.current=request
        try{localStorage.setItem(workoutFeedbackDraftKey(exercise.id),JSON.stringify({body,requestId:request.id}))}catch{}
        if(commentThread)await replyToFeedback(commentThread.id,body,request.id)
        else await addWorkoutComment(exercise.id,body,request.id)
        setCommentThread(await loadMyWorkoutFeedback(exercise.id))
        commentRequestRef.current=null
        clearWorkoutFeedbackDraft(exercise.id)
      }
      setCommentNotice('Сообщение отправлено тренеру.')
      setComment('')
    } catch (error) {
      setCommentNotice(error instanceof Error ? error.message : 'Не удалось отправить комментарий')
    } finally {setBusy(false)}
  }

  async function detectWorkoutRecords(item:LiveWorkout):Promise<WorkoutRecord[]> {
    const records=await Promise.all(item.exercises.map(async exercise=>{
      const history=await loadExerciseHistory(exercise.exercise_id,50)
      const current=history.find(entry=>entry.workout_session_id===item.id)
      const currentMoment=current?new Date(current.completed_at??current.workout_date+'T23:59:59').getTime():0
      const previous=history.filter(entry=>entry.workout_session_id!==item.id&&new Date(entry.completed_at??entry.workout_date+'T00:00:00').getTime()<currentMoment)
      const currentMetrics=current?sessionStrengthMetrics(current.sets):null
      const previousMetrics=previous.map(entry=>sessionStrengthMetrics(entry.sets)).filter(Boolean) as {maxWeight:number|null;e1rm:number|null;volume:number|null;maxReps:number;totalReps:number}[]
      if(!currentMetrics||!previousMetrics.length)return null
      const labels:string[]=[]
      const previousWeights=previousMetrics.map(x=>x.maxWeight).filter((x):x is number=>x!=null)
      const previousE1rm=previousMetrics.map(x=>x.e1rm).filter((x):x is number=>x!=null)
      const previousVolume=previousMetrics.map(x=>x.volume).filter((x):x is number=>x!=null)
      if(currentMetrics.maxWeight!=null&&previousWeights.length&&currentMetrics.maxWeight>Math.max(...previousWeights))labels.push('Максимальный вес')
      if(currentMetrics.e1rm!=null&&previousE1rm.length&&currentMetrics.e1rm>Math.max(...previousE1rm))labels.push('Расчётный 1ПМ')
      if(currentMetrics.volume!=null&&previousVolume.length&&currentMetrics.volume>Math.max(...previousVolume))labels.push('Объём')
      if(currentMetrics.maxReps>Math.max(...previousMetrics.map(x=>x.maxReps)))labels.push('Повторы в подходе')
      if(currentMetrics.totalReps>Math.max(...previousMetrics.map(x=>x.totalReps)))labels.push('Повторы за тренировку')
      return labels.length?{exerciseId:exercise.exercise_id,name:exercise.name,labels}:null
    }))
    return records.filter(Boolean) as WorkoutRecord[]
  }

  async function finishCardio(id:string) {
    const draft=cardioDrafts[id] ?? {duration:'',hr:'',rpe:'',distance:''}
    setBusy(true);setNotice('')
    try {
      if (!preview) await completeCardioEntry(id,{
        actual_duration_minutes:draft.duration===''?null:Number(draft.duration),
        actual_hr_avg:draft.hr===''?null:Number(draft.hr),
        actual_rpe:draft.rpe===''?null:Number(draft.rpe.replace(',','.')),
        actual_distance_km:draft.distance===''?null:Number(draft.distance.replace(',','.')),
        client_notes:null,
      })
      setWorkout(current=>current?{...current,cardio:current.cardio.map(item=>item.id===id?{...item,completed_at:new Date().toISOString()}:item)}:current)
    } catch (error) {
      showAppToast(error instanceof Error ? error.message : 'Не удалось сохранить кардио','error')
    } finally {setBusy(false)}
  }

  async function resumeExercise(exercise:LiveWorkoutExercise) {
    if (!workout) return
    setBusy(true);setNotice('')
    try {
      if (preview) {
        setWorkout(current=>current ? {
          ...current,
          status:'in_progress',
          exercises:current.exercises.map(item=>item.id===exercise.id?{...item,completed_at:null}:item),
        } : current)
      } else {
        await reopenWorkoutExercise(exercise.id)
        setWorkout(await loadWorkout(workout.id))
      }
      setRecentCompletedWorkout(null)
      showAppToast('Упражнение возобновлено. Сохранённые сеты не изменены.')
    } catch (error) {
      showAppToast(error instanceof Error ? error.message : 'Не удалось возобновить упражнение','error')
    } finally {setBusy(false)}
  }

  async function finishWorkout(confirmed=false) {
    if (!workout) return

    const plannedSetCount=workout.exercises.reduce((sum,exercise)=>sum+exercise.prescribed_sets,0)
    const completedPlannedSetCount=workout.exercises.reduce((sum,exercise)=>{
      let completed=0
      for(let setNumber=1;setNumber<=exercise.prescribed_sets;setNumber++){
        const draft=setDrafts[`${exercise.id}:${setNumber}`] ?? defaultDraft(exercise,setNumber)
        if(draft.completed) completed++
      }
      return sum+completed
    },0)

    const incompleteCardioCount=workout.cardio.filter(item=>!item.completed_at).length
    const unfinished:string[]=[]
    if(completedPlannedSetCount<plannedSetCount)unfinished.push(`${plannedSetCount-completedPlannedSetCount} плановых сетов`)
    if(incompleteCardioCount>0)unfinished.push(`${incompleteCardioCount} ${incompleteCardioCount===1?'блок кардио':'блока кардио'}`)
    const confirmation=unfinished.length
      ? `Не завершено: ${unfinished.join(' и ')}. Всё равно завершить тренировку?`
      : 'Все запланированные элементы сохранены. Точно завершить тренировку?'

    if(!confirmed) {
      setFinishConfirmation(confirmation)
      return
    }

    setFinishConfirmation(null)
    setBusy(true);setNotice('')
    try {
      if (!preview) await completeWorkout(workout.id,finishComment)
      const completedWorkout={...workout,status:'completed' as const,comment:finishComment.trim()||null}
      setWorkout(completedWorkout)
      setInProgressWorkout(null)
      setRecentCompletedWorkout(completedWorkout)
      if(!preview){
        try{setWorkoutHistory(await loadWorkoutHistory(90))}catch{}
      }
      setTimerEnd(null)
      setFinishComment('')
      showAppToast(finishComment.trim()?'Тренировка завершена. Комментарий отправлен тренеру.':'Тренировка завершена и сохранена.')
    } catch (error) {
      showAppToast(error instanceof Error ? error.message : 'Не удалось завершить тренировку','error')
    } finally {setBusy(false)}
  }

  const today=new Date()
  const todayKey=appDateKey(today)
  const todayIso=appIsoWeekday(todayKey)
  const todayScheduled=Boolean(workoutSchedule?.enabled&&workoutSchedule.weekdays.includes(todayIso))
  const todaySession=todayScheduled?sessionForWeekday(todayIso):null
  const todayCompletedSessionIds=useMemo(()=>{
    const ids=new Set(
      workoutHistory
        .filter(item=>appDateKey(new Date(item.started_at))===todayKey && item.training_day_id)
        .map(item=>item.training_day_id as string)
    )
    if(recentCompletedWorkout?.training_day_id)ids.add(recentCompletedWorkout.training_day_id)
    return ids
  },[workoutHistory,todayKey,recentCompletedWorkout?.training_day_id])
  const todayScheduledCompleted=Boolean(todaySession&&todayCompletedSessionIds.has(todaySession.id))
  const todayScheduledCompletedWorkoutId=todaySession
    ?workoutHistory.find(item=>appDateKey(new Date(item.started_at))===todayKey&&item.training_day_id===todaySession.id)?.id
      ??(recentCompletedWorkout?.training_day_id===todaySession.id?recentCompletedWorkout.id:null)
    :null

  const historyByDate=useMemo(()=>{
    const map=new Map<string,any[]>()
    for(const item of workoutHistory){
      const key=appDateKey(new Date(item.started_at))
      map.set(key,[...(map.get(key)??[]),item])
    }
    return map
  },[workoutHistory])

  const calendarCells=useMemo(()=>{
    const first=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1)
    const startOffset=isoWeekday(first)-1
    const start=new Date(first)
    start.setDate(first.getDate()-startOffset)
    return Array.from({length:42},(_,index)=>{
      const date=new Date(start)
      date.setDate(start.getDate()+index)
      const key=dateKey(date)
      return {date,key,inMonth:date.getMonth()===calendarMonth.getMonth(),history:historyByDate.get(key)??[]}
    })
  },[calendarMonth,historyByDate])

  if (loading) return <div className="library-empty">Загружаю программу…</div>

  if (!workout) {
    return <UiStack>
      <section className="workout-hero">
        <div>
          <span className="eyebrow light">Тренировки</span>
          <h2>{plan?.name ?? (planLoaded?'Программа пока не назначена':'Программа временно недоступна')}</h2>
          <p>{plan?.description ?? (planLoaded?'Когда тренер опубликует программу, она появится здесь.':'Не удалось проверить активную программу. Текущую тренировку, если она уже начата, можно продолжить.')}</p>
        </div>
        {plan?.weekly_frequency && <div className="hero-score"><strong>{plan.weekly_frequency}</strong><span>сессии в неделю</span></div>}
      </section>

      {notice&&<UiNotice tone="warning" className="workout-page-notice">{notice}</UiNotice>}

      {inProgressWorkout&&<section className="recent-completed-workout is-clickable" role="button" tabIndex={0}
        onClick={()=>{if(!busy)openWorkoutRoute(inProgressWorkout)}}
        onKeyDown={e=>{if(!busy&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openWorkoutRoute(inProgressWorkout)}}}>
        <div>
          <span className="eyebrow">Тренировка продолжается</span>
          <strong>{inProgressWorkout.session_name}</strong>
          <small>Результаты сохраняются по мере выполнения. Нажми на карточку, чтобы продолжить.</small>
        </div>
        <button className="primary-button compact" disabled={busy} onClick={e=>{e.stopPropagation();openWorkoutRoute(inProgressWorkout)}}><Play size={15}/>Продолжить</button>
      </section>}

      {todayScheduled&&<section className={'today-workout-card '+(todayScheduledCompleted?'is-done':'')}>
        <div className="today-workout-icon">{todayScheduledCompleted?<CheckCircle2 size={21}/>:<CalendarDays size={21}/>}</div>
        <div className="today-workout-copy">
          <span className="eyebrow">{todayScheduledCompleted?'Тренировка завершена':'Сегодня по расписанию'}</span>
          <strong>{todaySession?.name??'Тренировка'}</strong>
          <small>{todayScheduledCompleted?'Результаты сохранены — при необходимости можно открыть запись тренировки.':todaySession?.planned_duration_minutes?`≈ ${todaySession.planned_duration_minutes} мин · напоминание в ${scheduleTime}`:`Напоминание в ${scheduleTime}`}</small>
        </div>
        {todaySession&&!todayScheduledCompleted&&<button className="primary-button compact" disabled={busy} onClick={()=>inProgressWorkout?openWorkoutRoute(inProgressWorkout):void begin(todaySession.id)}><Play size={15}/>{inProgressWorkout?'Продолжить тренировку':'Начать тренировку'}</button>}
        {todayScheduledCompleted&&todayScheduledCompletedWorkoutId&&<button className="ghost-button compact today-workout-result" disabled={busy} onClick={()=>openPastWorkout(todayScheduledCompletedWorkoutId)}><CheckCircle2 size={15}/>Открыть результат</button>}
      </section>}

      {plan?.sessions?.length&&<UiCard className="workout-schedule-panel">
        <UiSectionHeader
          kicker="Расписание"
          title={workoutSchedule?.enabled&&workoutSchedule.weekdays.length?'Твои тренировочные дни':'Настроить тренировочные дни'}
          description={workoutSchedule?.enabled&&workoutSchedule.weekdays.length?'Приложение напомнит в выбранные дни.':'Выбери удобные дни — это расписание, а не жёсткое обязательство.'}
          action={<button className="ghost-button compact" onClick={()=>setScheduleOpen(v=>!v)}><CalendarDays size={15}/>{scheduleOpen?'Скрыть':'Настроить'}</button>}
        />

        {!scheduleOpen&&workoutSchedule?.enabled&&workoutSchedule.weekdays.length>0&&<div className="workout-schedule-summary">
          {[...workoutSchedule.weekdays].sort((a,b)=>a-b).map(day=>{const meta=WEEKDAYS.find(item=>item.iso===day);const session=sessionForWeekday(day);return <div key={day}><strong>{meta?.short}</strong><span>{session?.name??'Тренировка'}</span></div>})}
          <div className="workout-schedule-time"><BellRing size={15}/><span>{scheduleTime}</span></div>
        </div>}

        {scheduleOpen&&<div className="workout-schedule-editor">
          <div className="workout-weekday-picker">{WEEKDAYS.map(day=><button key={day.iso} className={scheduleWeekdays.includes(day.iso)?'is-active':''} onClick={()=>toggleScheduleDay(day.iso)}>{day.short}</button>)}</div>
          {scheduleWeekdays.length>0&&<div className="workout-schedule-days">{scheduleWeekdays.map(day=>{
            const meta=WEEKDAYS.find(item=>item.iso===day)
            return <label key={day}><span>{meta?.full}</span><select value={scheduleSessions[String(day)]??sessionForWeekday(day)?.id??''} onChange={e=>setScheduleSessions(map=>({...map,[String(day)]:e.target.value}))}>{plan.sessions.map(session=><option key={session.id} value={session.id}>{session.name}</option>)}</select></label>
          })}</div>}
          <label className="workout-reminder-time"><span>Напомнить в</span><input type="time" value={scheduleTime} onChange={e=>setScheduleTime(e.target.value)}/></label>
          <div className="workout-schedule-actions"><button className="ghost-button compact" onClick={()=>setScheduleOpen(false)}>Отмена</button><button className="primary-button compact" disabled={busy} onClick={()=>void saveSchedule()}>{busy?'Сохраняю…':'Сохранить расписание'}</button></div>
        </div>}
      </UiCard>}

      {recentCompletedWorkout && <section className="recent-completed-workout">
        <div>
          <span className="eyebrow">Последняя завершённая</span>
          <strong>{recentCompletedWorkout.session_name}</strong>
          <small>{recentCompletedWorkout.exercises.reduce((sum,exercise)=>sum+exercise.sets.filter(set=>set.completed_at).length,0)} сетов сохранено</small>
        </div>
        <button className="ghost-button small" disabled={busy} onClick={()=>void continueCompletedWorkout()}><RefreshCcw size={15}/>Возобновить</button>
      </section>}

      {plan?.sessions?.length ? <div className="workout-session-grid">
        {plan.sessions.map(session=>{
          const sessionDoneToday=todayCompletedSessionIds.has(session.id)
          const completedWorkoutToday=workoutHistory.find(item=>appDateKey(new Date(item.started_at))===todayKey&&item.training_day_id===session.id)
          const completedWorkoutTodayId=completedWorkoutToday?.id??(recentCompletedWorkout?.training_day_id===session.id?recentCompletedWorkout.id:null)
          return <article className={`workout-session-card ${sessionDoneToday?'is-completed-today':''}`} key={session.id}>
          <div className={`workout-session-icon ${session.session_type}`}>{session.session_type==='cardio'?<Activity size={20}/>:<Dumbbell size={20}/>}</div>
          <div>
            <span className="eyebrow">{session.session_type==='strength'?'Силовая':session.session_type==='cardio'?'Кардио':'Смешанная'}</span>
            <h3>{session.name}</h3>
            <p>{sessionDoneToday?'Эта тренировка сегодня уже выполнена':session.planned_duration_minutes ? `≈ ${session.planned_duration_minutes} мин` : 'Без жёсткого лимита по времени'}</p>
          </div>
          <div className="workout-session-actions">
            {sessionDoneToday&&<span className="workout-done-today"><CheckCircle2 size={16}/>Выполнено сегодня</span>}
            {!sessionDoneToday&&<button className="primary-button compact" disabled={busy} onClick={()=>inProgressWorkout?openWorkoutRoute(inProgressWorkout):void begin(session.id)}><Play size={15}/>{inProgressWorkout?'Продолжить тренировку':'Начать тренировку'}</button>}
            {sessionDoneToday&&completedWorkoutTodayId&&<button className="ghost-button compact" disabled={busy} onClick={()=>openPastWorkout(completedWorkoutTodayId)}><CheckCircle2 size={15}/>Открыть результат</button>}
          </div>
        </article>})}
      </div> : <div className="library-empty">{planLoaded?'Активной программы пока нет.':'Не удалось загрузить активную программу.'}</div>}
      {(workoutHistory.length>0||Boolean(workoutSchedule?.enabled&&workoutSchedule.weekdays.length))&&<section className="workout-history-panel">
        <div className="workout-history-heading"><div><span className="eyebrow">История</span><h3>Календарь тренировок</h3></div><div className="workout-calendar-nav"><button aria-label="Предыдущий месяц" onClick={()=>setCalendarMonth(month=>new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft size={16}/></button><strong>{calendarMonth.toLocaleDateString('ru-RU',{month:'long',year:'numeric'})}</strong><button aria-label="Следующий месяц" onClick={()=>setCalendarMonth(month=>new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight size={16}/></button></div></div>
        <div className="workout-calendar-weekdays">{WEEKDAYS.map(day=><span key={day.iso}>{day.short}</span>)}</div>
        <div className="workout-calendar-grid">{calendarCells.map(cell=>{
          const scheduled=Boolean(cell.key>=dateKey(today)&&workoutSchedule?.enabled&&workoutSchedule.weekdays.includes(isoWeekday(cell.date)))
          const scheduledSession=scheduled?sessionForWeekday(isoWeekday(cell.date)):null
          const completed=cell.history.length>0
          const isToday=cell.key===dateKey(today)
          return <button key={cell.key} className={[!cell.inMonth?'is-outside':'',scheduled?'is-scheduled':'',completed?'is-completed':'',isToday?'is-today':''].filter(Boolean).join(' ')} disabled={!completed} onClick={()=>completed&&openPastWorkout(cell.history[0].id)}>
            <span>{cell.date.getDate()}</span>
            <div>{scheduled&&<i title={scheduledSession?.name??'По расписанию'}>{scheduledSession?.session_type==='cardio'?'К':scheduledSession?.session_type==='mixed'?'М':'С'}</i>}{completed&&<b>{cell.history.length>1?cell.history.length:'✓'}</b>}</div>
          </button>
        })}</div>
        <div className="workout-calendar-legend"><span><i className="planned"/>По расписанию</span><span><i className="done"/>Выполнено</span></div>

        {workoutHistory.length>0&&<><div className="workout-history-heading is-list"><div><h3>Последние тренировки</h3></div>{workoutHistory.length>3&&<button className="text-button" onClick={()=>setHistoryExpanded(v=>!v)}>{historyExpanded?'Свернуть':'Вся история'}</button>}</div>
        <div className="workout-history-list">{workoutHistory.slice(0,historyExpanded?20:3).map(item=>{const start=new Date(item.started_at),end=item.completed_at?new Date(item.completed_at):null;const mins=end?Math.max(1,Math.round((end.getTime()-start.getTime())/60000)):null;return <button key={item.id} onClick={()=>openPastWorkout(item.id)}><div className={'workout-history-icon '+item.session_type}>{item.session_type==='cardio'?<Activity size={17}/>:<Dumbbell size={17}/>}</div><div><strong>{item.name}</strong><span>{start.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})}{mins?' · '+mins+' мин':''}</span></div><ChevronRight size={17}/></button>})}</div></>}
      </section>}
    </UiStack>
  }

  const activeExercise=activeExerciseId ? workout.exercises.find(exercise=>exercise.id===activeExerciseId) ?? null : null
  const activeTotalSets=activeExercise ? activeExercise.prescribed_sets+(extraSets[activeExercise.id] ?? 0) : 0
  const activeDrafts=activeExercise
    ? Array.from({length:activeTotalSets},(_,i)=>setDrafts[`${activeExercise.id}:${i+1}`] ?? defaultDraft(activeExercise,i+1))
    : []
  const activeCompletedCount=activeDrafts.filter(d=>d.completed).length
  const activeWarmupDraft=activeExercise?.warmup_enabled
    ? setDrafts[`${activeExercise.id}:0`] ?? {...defaultDraft(activeExercise,0),isWarmup:true}
    : null
  const activeWarmupCompleted=Boolean(activeWarmupDraft?.completed)
  const previousWorkWeight=activeExercise?.previous_sets.find(set=>set.weight_kg!=null)?.weight_kg ?? null
  const currentFirstWorkWeight=activeExercise ? parseDecimal((setDrafts[`${activeExercise.id}:1`] ?? defaultDraft(activeExercise,1)).weight) : null
  const warmupReferenceWeight=currentFirstWorkWeight ?? previousWorkWeight
  const warmupMinWeight=activeExercise&&warmupReferenceWeight!=null
    ? Math.round(warmupReferenceWeight*.50*2)/2
    : null
  const warmupMaxWeight=activeExercise&&warmupReferenceWeight!=null ? Math.round(warmupReferenceWeight*.60*2)/2 : null
  const warmupSuggestedWeight=warmupMinWeight!=null&&warmupMaxWeight!=null ? Math.round(((warmupMinWeight+warmupMaxWeight)/2)*2)/2 : null
  const activeLastCompletedAt=activeDrafts
    .filter(d=>d.completed&&d.completedAt)
    .map(d=>d.completedAt as string)
    .sort((a,b)=>new Date(b).getTime()-new Date(a).getTime())[0] ?? null
  const completedExerciseCount=workout.exercises.filter(exercise=>Boolean(exercise.completed_at)).length

  return <UiStack className="live-workout-page">
    {!activeExercise ? <section className="live-workout-hero">
      <button className="live-workout-back" onClick={closeWorkout} aria-label="Назад к тренировкам"><ArrowLeft size={20}/></button>
      <div>
        <span className="eyebrow light">{workout.program_name}</span>
        <h2>{workout.session_name}</h2>
        <p>{workout.status==='completed'
          ? 'Готово. Результаты сохранены.'
          : <><span className="workout-live-status"><span className="workout-live-dot"/>Идёт · {workoutElapsedLabel}</span> · {completedExerciseCount}/{workout.exercises.length} упражнений · {completedSetCount} сетов</>}</p>
      </div>
      {workout.status==='in_progress'
        ? <button className="white-button" disabled={busy} onClick={()=>{setFinishConfirmation(null);void finishWorkout()}}><Check size={16}/>Завершить тренировку</button>
        : <span className="exercise-done-badge"><Check size={14}/>История зафиксирована</span>}
    </section> : <section className="exercise-detail-hero">
      <button className="exercise-detail-back" onClick={closeExercise} aria-label="Назад к упражнениям"><ArrowLeft size={20}/></button>
      <div className="exercise-detail-heading">
        <span className="eyebrow">{workout.session_name}</span>
        <div className="exercise-detail-title-row">
          <h2>{activeExercise.superset_group!=null ? `${String.fromCharCode(64+activeExercise.superset_group)}${activeExercise.superset_position} · ` : ''}{activeExercise.name}</h2>
          <button type="button" className="exercise-title-info" aria-label="Техника и информация об упражнении" title="Техника и информация" onClick={()=>setSheet({type:'technique',exercise:activeExercise})}><Info size={19}/></button>
        </div>
        <ExerciseMuscleChips exercise={activeExercise}/>
        <p>{workout.status==='completed'
          ? <>Тренировка завершена · {activeCompletedCount}/{activeTotalSets} сетов сохранено</>
          : <><span className="workout-live-status"><span className="workout-live-dot"/>{workoutElapsedLabel}</span> · {activeCompletedCount}/{activeTotalSets} сетов сохранено</>}</p>
      </div>
      {activeExercise.completed_at && <span className="exercise-done-badge"><Check size={14}/>Готово</span>}
    </section>}

    {notice && <div className="drawer-notice">{notice}</div>}

    {workout.status==='completed'&&!activeExercise&&<section className="recent-completed-workout workout-resume-card">
      <div>
        <span className="eyebrow">Тренировка завершена</span>
        <strong>Нужно продолжить или исправить результаты?</strong>
        <small>Возобновление вернёт тренировку в рабочий режим. Уже сохранённые сеты останутся на месте.</small>
      </div>
      <button className="primary-button compact" disabled={busy} onClick={()=>void resumeCompletedWorkout(workout)}><RefreshCcw size={15}/>Возобновить тренировку</button>
    </section>}

    {workout.status==='completed'&&!activeExercise&&workout.comment&&<section className="panel workout-session-comment">
      <div className="panel-head"><div><span className="eyebrow">Сообщение тренеру</span><h3>Ваш комментарий к тренировке</h3></div><MessageCircle size={19}/></div>
      <p>{workout.comment}</p>
    </section>}

    {workout.status==='completed'&&recordsLoading&&<div className="workout-records-loading">Проверяю личные рекорды…</div>}
    {workout.status==='completed'&&workoutRecords.length>0&&<section className="panel workout-records-panel">
      <div className="panel-head"><div><span className="eyebrow">Новый результат</span><h3>Личные рекорды тренировки</h3></div><TrendingUp size={20}/></div>
      <div className="workout-records-list">{workoutRecords.map(record=><div key={record.exerciseId}><strong>{record.name}</strong><span>{record.labels.join(' · ')}</span></div>)}</div>
    </section>}

    {!activeExercise ? <>
      <div className="workout-exercise-overview">
        {workout.exercises.filter(exercise=>!exercise.completed_at).map(exercise=>{
          const index=workout.exercises.findIndex(item=>item.id===exercise.id)
          const totalSets=exercise.prescribed_sets+(extraSets[exercise.id] ?? 0)
          const exerciseDrafts=Array.from({length:totalSets},(_,i)=>setDrafts[`${exercise.id}:${i+1}`] ?? defaultDraft(exercise,i+1))
          const completed=exerciseDrafts.filter(d=>d.completed).length
          const warmupDraft=exercise.warmup_enabled
            ? setDrafts[`${exercise.id}:0`] ?? {...defaultDraft(exercise,0),isWarmup:true}
            : null
          const warmupCompleted=Boolean(warmupDraft?.completed)
          const lastCompletedAt=[...(warmupCompleted&&warmupDraft?.completedAt?[warmupDraft.completedAt]:[]),...exerciseDrafts
            .filter(d=>d.completed&&d.completedAt)
            .map(d=>d.completedAt as string)]
            .sort((a,b)=>new Date(b).getTime()-new Date(a).getTime())[0] ?? null
          const isInProgress=completed>0||warmupCompleted
          return <button className={`workout-exercise-summary ${isInProgress?'is-in-progress':''}`} key={exercise.id} onClick={()=>openExercise(exercise.id)}>
            <div className="workout-exercise-summary-number">{index+1}</div>
            {exercise.image_url
              ? <img className="workout-exercise-summary-image" src={exercise.image_url} alt="" loading="lazy"/>
              : <div className="workout-exercise-summary-image placeholder"><Dumbbell size={20}/></div>}
            <div className="workout-exercise-summary-copy">
              <strong>{exercise.superset_group!=null ? `${String.fromCharCode(64+exercise.superset_group)}${exercise.superset_position} · ` : ''}{exercise.name}</strong>
              <span>{exercise.prescribed_sets} × {exercise.reps_min ?? '—'}–{exercise.reps_max ?? '—'}</span>
              <ExerciseMuscleChips exercise={exercise} compact/>
              {lastCompletedAt && <small><span className="set-elapsed-time"><TimerReset size={12}/><strong>{elapsedLabel(lastCompletedAt,now)}</strong></span><span className="set-elapsed-caption">после последнего сета</span></small>}
            </div>
            <div className="workout-exercise-summary-progress">
              <strong>{completed===0&&warmupCompleted?'Разм. ✓':`${completed}/${totalSets}`}</strong>
              <span>{completed===0&&warmupCompleted?'активно':'сетов'}</span>
            </div>
            <ChevronRight className="workout-exercise-summary-chevron" size={18}/>
          </button>
        })}
        {workout.exercises.some(exercise=>Boolean(exercise.completed_at))&&<details className="completed-exercises-group">
          <summary><span>Завершённые упражнения</span><strong>{workout.exercises.filter(exercise=>Boolean(exercise.completed_at)).length}</strong></summary>
          <div className="completed-exercises-list">
            {workout.exercises.filter(exercise=>Boolean(exercise.completed_at)).map(exercise=><button className="workout-exercise-summary is-completed" key={exercise.id} onClick={()=>openExercise(exercise.id)}>
              <div className="workout-exercise-summary-number"><Check size={16}/></div>
              {exercise.image_url
                ? <img className="workout-exercise-summary-image" src={exercise.image_url} alt="" loading="lazy"/>
                : <div className="workout-exercise-summary-image placeholder"><Dumbbell size={20}/></div>}
              <div className="workout-exercise-summary-copy">
                <strong>{exercise.superset_group!=null ? `${String.fromCharCode(64+exercise.superset_group)}${exercise.superset_position} · ` : ''}{exercise.name}</strong>
                <span>{exercise.prescribed_sets} × {exercise.reps_min ?? '—'}–{exercise.reps_max ?? '—'}</span>
                <ExerciseMuscleChips exercise={exercise} compact/>
              </div>
              <div className="workout-exercise-summary-progress"><strong>✓</strong><span>готово</span></div>
              <ChevronRight className="workout-exercise-summary-chevron" size={18}/>
            </button>)}
          </div>
        </details>}
      </div>

      {workout.cardio.length>0 && <div className="live-exercise-list">
        {workout.cardio.map(cardio=>{
          const draft=cardioDrafts[cardio.id] ?? {duration:'',hr:'',rpe:'',distance:''}
          return <article className="live-exercise-card live-cardio-card" key={cardio.id}>
            <div className="live-exercise-head">
              <div className="exercise-number cardio"><Activity size={17}/></div>
              <div className="live-exercise-title"><span className="eyebrow">Кардио</span><h3>{cardio.name || cardio.modality_name}</h3></div>
            </div>
            <div className="cardio-prescription-line">
              {cardio.prescribed_duration_minutes && <span><Clock3 size={14}/>{cardio.prescribed_duration_minutes} мин</span>}
              {cardio.prescribed_hr_min && <span>Пульс {cardio.prescribed_hr_min}–{cardio.prescribed_hr_max ?? cardio.prescribed_hr_min}</span>}
              {cardio.prescribed_incline_percent!=null && <span>Наклон {cardio.prescribed_incline_percent}%</span>}
            </div>
            {cardio.trainer_notes && <CoachHint storageKey={'cardio:'+cardio.id} text={cardio.trainer_notes}/>}
            <div className="cardio-result-grid">
              <label><span>Минуты</span><input disabled={Boolean(cardio.completed_at)||workout.status!=='in_progress'} inputMode="numeric" value={draft.duration} onChange={e=>setCardioDrafts(current=>({...current,[cardio.id]:{...draft,duration:e.target.value.replace(/\D/g,'')}}))}/></label>
              <label><span>Средний пульс</span><input disabled={Boolean(cardio.completed_at)||workout.status!=='in_progress'} inputMode="numeric" value={draft.hr} onChange={e=>setCardioDrafts(current=>({...current,[cardio.id]:{...draft,hr:e.target.value.replace(/\D/g,'')}}))}/></label>
              <label><span>RPE</span><input disabled={Boolean(cardio.completed_at)||workout.status!=='in_progress'} inputMode="decimal" value={draft.rpe} onChange={e=>setCardioDrafts(current=>({...current,[cardio.id]:{...draft,rpe:normalizeDecimalInput(e.target.value)}}))}/></label>
              <label><span>Км</span><input disabled={Boolean(cardio.completed_at)||workout.status!=='in_progress'} inputMode="decimal" value={draft.distance} onChange={e=>setCardioDrafts(current=>({...current,[cardio.id]:{...draft,distance:normalizeDecimalInput(e.target.value)}}))}/></label>
            </div>
            {workout.status==='in_progress' && <button className={`primary-button compact cardio-complete ${cardio.completed_at?'is-completed':''}`} disabled={busy||Boolean(cardio.completed_at)} onClick={()=>void finishCardio(cardio.id)}>{cardio.completed_at?<><Check size={15}/>Готово</>:<><Check size={15}/>Завершить кардио</>}</button>}
          </article>
        })}
      </div>}
    </> : <article className="exercise-focus-card">
      <div className="exercise-focus-intro">
        {activeExercise.image_url
          ? <img className="exercise-focus-image" src={activeExercise.image_url} alt="" loading="lazy"/>
          : <div className="exercise-focus-image placeholder"><Dumbbell size={26}/></div>}
        <div>
          <div className="exercise-focus-strategy">
            <strong>{activeExercise.prescribed_sets} × {activeExercise.reps_min ?? '—'}–{activeExercise.reps_max ?? '—'}</strong>
          </div>
          {activeLastCompletedAt && !activeExercise.completed_at && <div className="exercise-last-set-timer"><TimerReset size={13}/>После последнего сета: <strong>{elapsedLabel(activeLastCompletedAt,now)}</strong></div>}
        </div>
      </div>


      {activeExercise.trainer_notes && <CoachHint storageKey={'workout:'+activeExercise.exercise_id} text={activeExercise.trainer_notes}/>}
      {activeExercise.load_recommendation?.suggested_weight_kg!=null && <div className="workout-load-recommendation">
        <span>Рекомендация на сегодня</span>
        <strong>{activeExercise.load_recommendation.previous_weight_kg!=null
          ? Number(activeExercise.load_recommendation.suggested_weight_kg)>Number(activeExercise.load_recommendation.previous_weight_kg)
            ? `Можно попробовать ${Number(activeExercise.load_recommendation.suggested_weight_kg).toLocaleString('ru-RU',{maximumFractionDigits:2})} кг. Прошлый рабочий вес — ${Number(activeExercise.load_recommendation.previous_weight_kg).toLocaleString('ru-RU',{maximumFractionDigits:2})} кг.`
            : `Ориентир — ${Number(activeExercise.load_recommendation.previous_weight_kg).toLocaleString('ru-RU',{maximumFractionDigits:2})} кг. Повышать вес пока не нужно.`
          : `Ориентир на первый рабочий сет — ${Number(activeExercise.load_recommendation.suggested_weight_kg).toLocaleString('ru-RU',{maximumFractionDigits:2})} кг.`}</strong>
      </div>}
      {loadSuggestion?.exerciseId===activeExercise.id && <div className="load-suggestion-card">
        <div><strong>Можно повысить вес</strong><span>{loadSuggestion.reps} повторений{loadSuggestion.hasRir&&loadSuggestion.rir!=null?` · RIR ${loadSuggestion.rir}`:''}. На следующий сет предлагаю {String(loadSuggestion.suggestedWeight).replace('.',',')} кг.</span></div>
        <div className="load-suggestion-actions">
          <button className="primary-button compact" onClick={()=>{patchSet(activeExercise.id,loadSuggestion.nextSet,{weight:String(loadSuggestion.suggestedWeight)});setLoadSuggestion(null)}}>Поставить {String(loadSuggestion.suggestedWeight).replace('.',',')} кг</button>
          <button className="ghost-button compact" onClick={()=>setLoadSuggestion(null)}>Оставить {String(loadSuggestion.currentWeight).replace('.',',')} кг</button>
        </div>
      </div>}
      {activeExercise.previous_sets.length>0 && <details className="previous-result-collapsed">
        <summary>Прошлый раз</summary>
        <span>{previousLabel(activeExercise)}</span>
      </details>}

      <div className="live-sets exercise-focus-sets">
        <div className={`live-set-row header ${activeExercise.rir_enabled?'':'no-rir'}`}><span>Сет</span><span>Вес</span><span>Повторы</span>{activeExercise.rir_enabled&&<span>RIR</span>}<span/></div>
        {activeExercise.warmup_enabled && activeWarmupDraft && <div className={`live-set-row warmup-set-row ${activeExercise.rir_enabled?'':'no-rir'} ${activeWarmupDraft.completed?'is-completed':''}`}>
          <div className="set-number-cell warmup-label"><strong>Разм.</strong>{!activeExercise.rir_enabled&&<button type="button" className="warmup-inline-info" aria-label="Как делать разминку" onClick={()=>setSheet({type:'warmup',exercise:activeExercise})}><Info size={15}/></button>}</div>
          <div>
            <input
              disabled={workout.status!=='in_progress'||Boolean(activeExercise.completed_at)||activeWarmupDraft.completed}
              inputMode="decimal"
              value={activeWarmupDraft.weight}
              onChange={e=>patchSet(activeExercise.id,0,{weight:normalizeDecimalInput(e.target.value),isWarmup:true})}
              onBlur={()=>void persistSetDraft(activeExercise,0,setDrafts[`${activeExercise.id}:0`] ?? activeWarmupDraft)}
              placeholder={warmupSuggestedWeight==null?'—':String(warmupSuggestedWeight).replace('.',',')}
            />
            {warmupMinWeight!=null&&warmupMaxWeight!=null&&<small>≈ {warmupMinWeight}–{warmupMaxWeight} кг</small>}
          </div>
          <input
            disabled={workout.status!=='in_progress'||Boolean(activeExercise.completed_at)||activeWarmupDraft.completed}
            inputMode="numeric"
            value={activeWarmupDraft.reps}
            onChange={e=>patchSet(activeExercise.id,0,{reps:e.target.value.replace(/\D/g,''),isWarmup:true})}
            onBlur={()=>void persistSetDraft(activeExercise,0,setDrafts[`${activeExercise.id}:0`] ?? activeWarmupDraft)}
            placeholder={String(Math.round((activeExercise.warmup_reps_min+activeExercise.warmup_reps_max)/2))}
          />
          {activeExercise.rir_enabled&&<button type="button" className="warmup-rir-info" aria-label="Почему RIR не нужен в разминке" onClick={()=>setSheet({type:'warmup',exercise:activeExercise})}><Info size={16}/></button>}
          <button className={`set-complete-button ${activeWarmupDraft.completed?'is-done':''}`} disabled={busy||workout.status!=='in_progress'||Boolean(activeExercise.completed_at)||activeWarmupDraft.completed} onClick={()=>void finishSet(activeExercise,0)}><Check size={17}/></button>
        </div>}
        {Array.from({length:activeTotalSets},(_,i)=>i+1).map(setNumber=>{
          const key=`${activeExercise.id}:${setNumber}`
          const row=setDrafts[key] ?? defaultDraft(activeExercise,setNumber)
          const previous=activeExercise.previous_sets.find(set=>set.set_number===setNumber)
          const previousWeight=previous?.weight_kg==null?'—':Number(previous.weight_kg).toLocaleString('ru-RU',{maximumFractionDigits:2})
          const previousReps=previous?.reps==null?'—':String(previous.reps)
          const weight=parseDecimal(row.weight)
          const reps=row.reps===''?null:Number(row.reps)
          const e1rm=weight&&reps ? estimateOneRepMax(weight,reps) : null
          const locked=workout.status!=='in_progress'||Boolean(activeExercise.completed_at)||row.completed
          return <div className={`live-set-row ${activeExercise.rir_enabled?'':'no-rir'} ${row.completed?'is-completed':''}`} key={setNumber}>
            <div className="set-number-cell"><strong>{setNumber}</strong>{row.isWarmup&&<small>разм.</small>}</div>
            <div>
              <input
                disabled={locked}
                inputMode="decimal"
                value={row.weight}
                onChange={e=>patchSet(activeExercise.id,setNumber,{weight:normalizeDecimalInput(e.target.value)})}
                onBlur={()=>void persistSetDraft(activeExercise,setNumber,setDrafts[key] ?? row)}
                placeholder={previousWeight}
              />
              {e1rm!=null&&<small>1ПМ ≈ {e1rm.toFixed(1)}</small>}
            </div>
            <input
              disabled={locked}
              inputMode="numeric"
              value={row.reps}
              onChange={e=>patchSet(activeExercise.id,setNumber,{reps:e.target.value.replace(/\D/g,'')})}
              onBlur={()=>void persistSetDraft(activeExercise,setNumber,setDrafts[key] ?? row)}
              placeholder={previousReps}
            />
            {activeExercise.rir_enabled&&<select
              className="rir-select"
              disabled={locked}
              value={row.rir??''}
              onChange={e=>{
                const next={...row,rir:e.target.value===''?null:Number(e.target.value)}
                patchSet(activeExercise.id,setNumber,{rir:next.rir})
                void persistSetDraft(activeExercise,setNumber,next)
              }}
              aria-label={`RIR, сет ${setNumber}`}
            >
              <option value="">—</option><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option>
            </select>}
            <button className={`set-complete-button ${row.completed?'is-done':''}`} disabled={busy||locked} onClick={()=>void finishSet(activeExercise,setNumber)}><Check size={17}/></button>
          </div>
        })}
      </div>

      {workout.status==='in_progress' && !activeExercise.completed_at && <div className="exercise-focus-actions">
        <div className="exercise-focus-secondary-actions">
          <button className="text-button" onClick={()=>setExtraSets(current=>({...current,[activeExercise.id]:(current[activeExercise.id]??0)+1}))}><Plus size={15}/>Добавить сет</button>
          {(extraSets[activeExercise.id]??0)>0 && <button className="text-button danger-text-button" disabled={busy} onClick={()=>void removeLastExtraSet(activeExercise)}><Minus size={15}/>Удалить последний</button>}
          <button className="text-button" onClick={()=>void openExerciseHistory(activeExercise)}><TrendingUp size={15}/>Прогресс</button>
          {activeExercise.allow_substitution&&activeExercise.substitution_options.length>0&&<button className="text-button" onClick={()=>setSheet({type:'replace',exercise:activeExercise})}><Repeat2 size={15}/>Заменить</button>}
          <button className="text-button" onClick={()=>void openComment(activeExercise)}><MessageCircle size={15}/>Комментарии</button>
        </div>
        <div className="exercise-complete-control">
          <button className="primary-button exercise-complete-button" disabled={busy||activeCompletedCount===0} onClick={()=>void finishExercise(activeExercise)}><Check size={17}/>Завершить упражнение</button>
          {activeCompletedCount===0&&<small>Сначала заверши хотя бы один рабочий подход.</small>}
        </div>
      </div>}

      {activeExercise.completed_at && <div className="exercise-completed-panel">
        <Check size={18}/>
        <span>Упражнение завершено. Все сохранённые сеты останутся в истории.</span>
        <div className="exercise-completed-actions">
          <button className="ghost-button" onClick={()=>void openExerciseHistory(activeExercise)}><TrendingUp size={15}/>Прогресс</button>
          <button className="ghost-button" onClick={()=>void openComment(activeExercise)}><MessageCircle size={15}/>Комментарии</button>
          {workout.status==='in_progress'&&<button className="ghost-button" disabled={busy} onClick={()=>void resumeExercise(activeExercise)}><RefreshCcw size={15}/>Возобновить</button>}
          <button className="ghost-button" onClick={closeExercise}>К списку</button>
        </div>
      </div>}
    </article>}

    {timerEnd && workout.status==='in_progress' && <div className="rest-timer-spacer" aria-hidden="true"/>}
    {timerEnd && workout.status==='in_progress' && <div className={`rest-timer ${remaining===0?'is-finished':''}`}>
      <div className="rest-timer-icon"><TimerReset size={19}/></div>
      <div><small>{remaining===0?'Отдых закончен':'Отдых после сета'}</small><strong>{String(Math.floor(remaining/60)).padStart(2,'0')}:{String(remaining%60).padStart(2,'0')}</strong><span>{timerName}</span></div>
      <div className="rest-timer-actions">
        <button onClick={()=>{setTimerEnd((timerEnd??Date.now())-15000);timerFinishedRef.current=false}}>−15</button>
        <button onClick={()=>{setTimerEnd((timerEnd??Date.now())+15000);timerFinishedRef.current=false}}>+15</button>
        <button onClick={()=>setTimerEnd(null)}><X size={14}/></button>
      </div>
    </div>}

    {removeSetConfirmation && <div className="drawer-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setRemoveSetConfirmation(null)}}>
      <aside className="exercise-drawer workout-sheet finish-workout-sheet">
        <div className="drawer-head">
          <div><span className="eyebrow">Подход</span><h3>Удалить дополнительный сет?</h3></div>
          <button className="icon-button" onClick={()=>setRemoveSetConfirmation(null)}><X size={18}/></button>
        </div>
        <div className="drawer-body">
          <div className="finish-workout-icon"><Trash2 size={24}/></div>
          <p className="sheet-description">В дополнительном сете №{removeSetConfirmation.setNumber} уже есть введённые или сохранённые данные.</p>
          <p className="sheet-description">После удаления эти данные будут удалены из тренировки.</p>
          <div className="finish-workout-actions">
            <button className="ghost-button" onClick={()=>setRemoveSetConfirmation(null)}>Оставить сет</button>
            <button className="primary-button" disabled={busy} onClick={()=>void deleteExtraSet(removeSetConfirmation.exercise,removeSetConfirmation.setNumber)}><Trash2 size={16}/>Удалить</button>
          </div>
        </div>
      </aside>
    </div>}

    {finishConfirmation && <div className="drawer-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setFinishConfirmation(null)}}>
      <aside className="exercise-drawer workout-sheet finish-workout-sheet">
        <div className="drawer-head">
          <div><span className="eyebrow">Тренировка</span><h3>Завершить тренировку?</h3></div>
          <button className="icon-button" onClick={()=>setFinishConfirmation(null)}><X size={18}/></button>
        </div>
        <div className="drawer-body">
          <div className="finish-workout-icon"><Check size={24}/></div>
          <p className="sheet-description">{finishConfirmation}</p>
          <p className="sheet-description">Все уже выполненные подходы и результаты сохранятся.</p>
          <label className="finish-workout-comment">Комментарий тренеру <small>необязательно · тренер получит уведомление</small><textarea className="sheet-textarea" rows={3} value={finishComment} maxLength={1500} onChange={e=>setFinishComment(e.target.value)} placeholder="Например: в целом легко, но к концу устал сильнее обычного"/></label>
          <div className="finish-workout-actions">
            <button className="ghost-button" onClick={()=>setFinishConfirmation(null)}>Продолжить тренировку</button>
            <button className="primary-button" disabled={busy} onClick={()=>void finishWorkout(true)}><Check size={16}/>Завершить</button>
          </div>
        </div>
      </aside>
    </div>}

    {sheet && <div className="drawer-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setSheet(null)}}>
      <aside className="exercise-drawer workout-sheet">
        <div className="drawer-head">
          <div><span className="eyebrow">{sheet.type==='technique'?'Об упражнении':sheet.type==='comment'?'Комментарий тренеру':sheet.type==='history'?'История упражнения':sheet.type==='warmup'?'Разминка':'Замена упражнения'}</span><h3>{sheet.exercise.name}</h3></div>
          <button className="icon-button" onClick={()=>setSheet(null)}><X size={18}/></button>
        </div>
        <div className="drawer-body">
          {sheet.type==='technique' && <>
            {sheet.exercise.image_url ? <img className="technique-image" src={sheet.exercise.image_url} alt={sheet.exercise.name}/> : <div className="technique-icon"><Dumbbell size={24}/></div>}
            {(sheet.exercise.animation_url||sheet.exercise.video_url)&&<video className="technique-video" src={sheet.exercise.animation_url??sheet.exercise.video_url??''} poster={sheet.exercise.image_url??undefined} controls loop muted playsInline preload="metadata"/>}
            <div className="exercise-info-summary">
              <ExerciseMuscleChips exercise={sheet.exercise}/>
              <div className="exercise-info-meta">
                <span>{roleLabel(sheet.exercise.exercise_role)}</span>
                {sheet.exercise.rir_enabled&&sheet.exercise.rir_min!=null&&<span>RIR {sheet.exercise.rir_min}–{sheet.exercise.rir_max??sheet.exercise.rir_min}</span>}
                <span>Отдых {restLabel(sheet.exercise.rest_seconds)}</span>
                {sheet.exercise.warmup_enabled&&<span>Есть разминка</span>}
              </div>
            </div>
            {sheet.exercise.description&&<div className="technique-copy technique-description"><h4>Что это за упражнение</h4><p>{sheet.exercise.description}</p></div>}
            {sheet.exercise.setup_notes&&<div className="technique-copy"><h4>Исходное положение</h4><p>{sheet.exercise.setup_notes}</p></div>}
            <div className="technique-copy"><h4>Как выполнять</h4><p>{sheet.exercise.instructions || 'Тренер пока не добавил отдельное описание техники.'}</p></div>
            {sheet.exercise.common_mistakes&&<div className="technique-copy technique-mistakes"><h4>Частые ошибки</h4><p>{sheet.exercise.common_mistakes}</p></div>}
            {sheet.exercise.trainer_notes && <div className="coach-note"><strong>Подсказка тренера</strong><span>{sheet.exercise.trainer_notes}</span></div>}
            {sheet.exercise.technique_url && <a className="primary-button compact" href={sheet.exercise.technique_url} target="_blank" rel="noreferrer">Открыть видео с демонстрацией</a>}
          </>}
          {sheet.type==='warmup' && (()=> {
            const workWeight=sheet.exercise.previous_sets.find(s=>s.set_number===1)?.weight_kg ?? null
            const round=(n:number)=>Math.round(n*2)/2
            const first=workWeight==null?null:round(workWeight*.5)
            const second=workWeight==null?null:round(workWeight*.7)
            const useTwo=workWeight!=null && workWeight>=20 && sheet.exercise.exercise_role==='main'
            return <>
              <div className="warmup-guide-hero"><Dumbbell size={22}/><div><strong>Один разминочный подход по умолчанию</strong><span>Возьми примерно 50–60% рабочего веса и сделай 8–10 спокойных повторений. RIR здесь не нужен; разминка не входит в рабочий объём и прогресс.</span></div></div>
              {workWeight!=null&&<div className="warmup-today-card"><span>Ориентир рабочего веса</span><strong>{workWeight} кг</strong><small>по последней тренировке</small></div>}
              <p className="warmup-guide-note">Для обычных рабочих подходов этого достаточно. Если рабочий вес очень большой или предстоит тяжёлая работа на 1–6 повторений, сделай 2–3 подводящих подхода с постепенным увеличением веса и уменьшением повторений, не доводя их до утомления.</p>
              <div className="warmup-guide-steps">
                <div><b>1</b><p><strong>{first!=null?`${first} кг × 8–10`:'40–50% × 8–10'}</strong><span>Спокойно, с чистой техникой. Затем отдых около 1 минуты.</span></p></div>
                {useTwo&&<div><b>2</b><p><strong>{second!=null?`${second} кг × 3–5`:'65–75% × 3–5'}</strong><span>Подводящий подход ближе к рабочему весу. Отдых 1–2 минуты.</span></p></div>}
                <div><b>→</b><p><strong>Рабочие подходы</strong><span>Начинай их свежим. Если разминка заметно утомила — она была слишком тяжёлой.</span></p></div>
              </div>
              <p className="sheet-description">Для тяжёлого основного упражнения приложение может рекомендовать два подводящих шага. Если мышечная группа уже хорошо разогрета предыдущими упражнениями, лишний подход можно пропустить.</p>
            </>
          })()}
          {sheet.type==='comment' && <>
            <p className="sheet-description">Здесь сохраняется переписка по этому упражнению. Можно написать про технику, дискомфорт или слишком лёгкую/тяжёлую нагрузку.</p>
            {commentLoading
              ? <div className="library-empty">Загружаю переписку…</div>
              : commentThread?.messages.length
                ? <div className="workout-feedback-thread">{commentThread.messages.map(message=>{
                    const mine=message.author_id===commentThread.client_id
                    return <div className={`workout-feedback-message ${mine?'is-mine':'is-coach'}`} key={message.id}>
                      <div><strong>{mine?'Вы':'Тренер'}</strong><small>{new Date(message.created_at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</small></div>
                      <p>{message.body}</p>
                    </div>
                  })}</div>
                : <div className="workout-feedback-empty">Переписки по этому упражнению пока нет.</div>}
            <div className="workout-feedback-compose">
              <textarea className="sheet-textarea" rows={4} value={comment} onChange={e=>{setComment(e.target.value);storeWorkoutFeedbackDraft(sheet.exercise.id,e.target.value);if(commentNotice)setCommentNotice('')}} placeholder="Например: на втором сете начало тянуть правое плечо"/>
              <button type="button" className="primary-button" disabled={busy||!comment.trim()} onClick={()=>void sendComment(sheet.exercise)}><MessageCircle size={16}/>{busy?'Отправляю…':commentThread?'Ответить':'Отправить тренеру'}</button>
              {commentNotice&&<div className="inline-action-notice">{commentNotice}</div>}
            </div>
          </>}
          {sheet.type==='history' && <>
            <p className="sheet-description">Рабочие результаты по датам. Разминочные сеты в прогресс не включаются.</p>
            {historyLoading ? <div className="library-empty">Загружаю историю…</div> : exerciseHistory.length===0 ? <div className="library-empty">Пока нет завершённых тренировок с этим упражнением.</div> : <div className="exercise-history-list">
              {exerciseHistory.map(entry=>{
                const workSets=entry.sets.filter(set=>!set.is_warmup)
                const best=workSets.reduce<{weight:number;reps:number}|null>((acc,set)=>{
                  if(set.weight_kg==null||set.reps==null)return acc
                  if(!acc||set.weight_kg>acc.weight||(set.weight_kg===acc.weight&&set.reps>acc.reps))return {weight:set.weight_kg,reps:set.reps}
                  return acc
                },null)
                return <article key={entry.workout_session_id}>
                  <div className="exercise-history-head"><strong>{new Date(entry.workout_date+'T00:00:00').toLocaleDateString('ru-RU')}</strong>{best&&<span>лучший: {best.weight} × {best.reps}</span>}</div>
                  <div className="exercise-history-sets">{workSets.map(set=><span key={set.set_number}>{set.weight_kg??'—'} × {set.reps??'—'}{set.rir!=null?' · RIR '+set.rir:''}</span>)}</div>
                </article>
              })}
            </div>}
          </>}
          {sheet.type==='replace' && <>
            <p className="sheet-description">Доступны только варианты, которые тренер заранее разрешил для этого движения.</p>
            <div className="replacement-list">
              {sheet.exercise.substitution_options.map(option=><button key={option.id} onClick={()=>void replaceExercise(sheet.exercise,option.id)}><RefreshCcw size={17}/><span>{option.name}</span><ChevronRight size={16}/></button>)}
            </div>
          </>}
        </div>
      </aside>
    </div>}
  </UiStack>
}
