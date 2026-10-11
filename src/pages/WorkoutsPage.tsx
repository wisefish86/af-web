import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Activity, ArrowLeft, BellRing, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Dumbbell, Info, MessageCircle,
  Minus, Pencil, Play, Plus, RefreshCcw, Repeat2, TimerReset, Trash2, TrendingUp, X
} from 'lucide-react'
import {
  abandonEmptyWorkout, addMyCustomWorkoutExercise, addMyWorkoutCardio, addWorkoutComment, completeCardioEntry, completeWorkout, completeWorkoutExercise, deleteWorkoutSet, loadActiveTrainingPlan,
  loadCardioModalities, loadExerciseHistory, loadInProgressWorkout, loadLatestCompletedWorkout, loadMyPersonalExercises, loadMyWorkoutSchedule, loadWorkout, loadWorkoutExerciseContext, loadWorkoutHistory, removeMyCustomWorkoutExercise, removeMyWorkoutCardio, reopenWorkout, reopenWorkoutCardio, reopenWorkoutExercise, reopenWorkoutSet, replaceWorkoutExercise, saveMyWorkoutSchedule, saveWorkoutSet, saveWorkoutUiState, startWorkout
} from '../features/workouts/service'
import type { CardioModalityOption, ExerciseEquipmentOption, PersonalExerciseOption, WorkoutHistorySummary } from '../features/workouts/service'
import { canAbandonWorkout, nextSupersetRoundStarter, summarizeWorkoutCompletion, workoutStartedOnLocalDate } from '../features/workouts/state'
import { loadMyWorkoutFeedback, replyToFeedback, subscribeToFeedbackThread } from '../features/feedback/service'
import type { FeedbackThread } from '../features/feedback/types'
import type {
  ActiveTrainingPlan, ExerciseHistoryEntry, LiveCardioEntry, LiveWorkout, LiveWorkoutExercise, WorkoutSchedule, WorkoutSetRecord
} from '../features/workouts/types'
import { estimateOneRepMax, normalizeDecimalInput, parseDecimal } from '../lib/numberInput'
import { CoachHint } from '../components/CoachHint'
import { appDateKey, appIsoWeekday, getAppTimeZone } from '../lib/appDate'
import { showAppToast } from '../lib/toast'
import { UiCard, UiLoadError, UiNotice, UiSectionHeader, UiStack } from '../ui/primitives'

type Props = { preview: boolean }

function findSupersetPartner(exercises:LiveWorkoutExercise[],exercise:LiveWorkoutExercise){
  if(exercise.superset_group==null||exercise.superset_position==null)return null
  return exercises
    .filter(item=>
      item.id!==exercise.id
      && item.superset_group===exercise.superset_group
      && item.superset_position!=null
      && item.superset_position!==exercise.superset_position
    )
    .sort((a,b)=>{
      const completionDelta=Number(Boolean(a.completed_at))-Number(Boolean(b.completed_at))
      return completionDelta!==0?completionDelta:b.sort_order-a.sort_order
    })[0]??null
}

type SetDraft = {
  weight:string
  reps:string
  rir:number | null
  isWarmup:boolean
  completed:boolean
  completedAt:string | null
}
type CardioDraft={duration:string;hr:string;rpe:string;distance:string}
type AddCardioDraft={
  modalityCode:string
  name:string
  duration:string
  hr:string
  rpe:string
  distance:string
  speed:string
  incline:string
}
type AddExerciseDraft={
  exerciseId:string
  name:string
  trackingType:'weight_reps'|'reps_only'
  equipmentCode:string
  notes:string
  sets:string
  repsMin:string
  repsMax:string
  rirEnabled:boolean
  rirMin:string
  rirMax:string
  restSeconds:string
}
function emptyAddExerciseDraft():AddExerciseDraft{
  return {exerciseId:'',name:'',trackingType:'weight_reps',equipmentCode:'',notes:'',sets:'3',repsMin:'8',repsMax:'12',rirEnabled:true,rirMin:'1',rirMax:'2',restSeconds:'120'}
}
const previewPersonalExercises:PersonalExerciseOption[]=[
  {id:'preview-personal-1',name:'Сгибание рук с резинкой',tracking_type:'weight_reps',equipment_code:'band',notes:'Мой вариант для поездок',default_rest_seconds:60},
]
const previewExerciseEquipment:ExerciseEquipmentOption[]=[
  {code:'bodyweight',name:'Собственный вес'},
  {code:'dumbbell',name:'Гантели'},
  {code:'barbell',name:'Штанга'},
  {code:'cable',name:'Кроссовер / блок'},
  {code:'machine',name:'Тренажёр'},
  {code:'band',name:'Резинка'},
]
const previewCardioModalities:CardioModalityOption[]=[
  {code:'treadmill',name:'Беговая дорожка'},
  {code:'walking',name:'Ходьба'},
  {code:'running',name:'Бег'},
  {code:'bike',name:'Велотренажёр'},
  {code:'elliptical',name:'Эллипс'},
  {code:'rower',name:'Гребной тренажёр'},
  {code:'stair',name:'Степпер / лестница'},
  {code:'other',name:'Другое'},
]
function emptyAddCardioDraft(modalityCode=''):AddCardioDraft{
  return {modalityCode,name:'',duration:'',hr:'',rpe:'',distance:'',speed:'',incline:''}
}
function sameCardioResult(actual:LiveCardioEntry,input:{
  duration:number;hr:number|null;rpe:number|null;distance:number|null
}){
  return actual.actual_duration_minutes===input.duration
    && (actual.actual_hr_avg??null)===(input.hr??null)
    && (actual.actual_rpe==null?null:Number(actual.actual_rpe))===(input.rpe??null)
    && (actual.actual_distance_km==null?null:Number(actual.actual_distance_km))===(input.distance??null)
}
type WorkoutUiRecovery={activeExerciseId:string|null;timerEnd:number|null;timerName:string}
type LocalWorkoutRecovery={
  version:1
  updatedAt:number
  extraSets:Record<string,number>
  cardioDrafts:Record<string,CardioDraft>
  ui:WorkoutUiRecovery|null
}

type LoadSuggestion = {exerciseId:string;nextSet:number;currentWeight:number;suggestedWeight:number;reps:number;rir:number|null;hasRir:boolean}
type WorkoutRecord={exerciseId:string;name:string;labels:string[]}

function sameNumberList(a:number[],b:number[]){
  return JSON.stringify([...a].sort((x,y)=>x-y))===JSON.stringify([...b].sort((x,y)=>x-y))
}
function sameStringMap(a:Record<string,string>,b:Record<string,string>){
  const normalize=(value:Record<string,string>)=>Object.entries(value).sort(([ak],[bk])=>ak.localeCompare(bk))
  return JSON.stringify(normalize(a))===JSON.stringify(normalize(b))
}

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
      id:'we-press',exercise_id:'ex-press',name:'Жим гантелей на наклонной скамье',tracking_type:'weight_reps',entry_origin:'program',client_notes:null,
      instructions:'Сведи лопатки, уверенно упрись стопами. Опускай гантели под контролем и не проваливай плечо.',
      technique_url:null,image_url:null,primary_muscle:'chest',primary_muscles:['Грудь'],secondary_muscles:['Передняя дельта','Трицепс'],sort_order:10,superset_group:1,superset_position:1,prescribed_sets:3,
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
      id:'we-row',exercise_id:'ex-row',name:'Горизонтальная тяга в блочном тренажёре',tracking_type:'weight_reps',entry_origin:'program',client_notes:null,
      instructions:'Сохраняй нейтральную поясницу. Тяни локти назад, а не плечи вверх.',
      technique_url:null,image_url:null,primary_muscle:'back',primary_muscles:['Середина спины'],secondary_muscles:['Широчайшие','Бицепс'],sort_order:20,superset_group:1,superset_position:2,prescribed_sets:3,
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
      id:'we-leg',exercise_id:'ex-leg',name:'Жим ногами',tracking_type:'weight_reps',entry_origin:'program',client_notes:null,
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
      prescribed_hr_max:135,prescribed_rpe_min:5,prescribed_rpe_max:6,prescribed_speed_kmh:null,prescribed_incline_percent:6,
      prescribed_distance_km:null,trainer_notes:'Спокойный темп после силовой.',
      actual_duration_minutes:null,actual_hr_avg:null,actual_rpe:null,actual_distance_km:null,
      client_notes:null,completed_at:null,entry_origin:'program',
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
      const reps = set.reps ?? '—'
      if(exercise.tracking_type==='reps_only')return `${reps} повт.`
      const weight = set.weight_kg == null ? '—' : Number(set.weight_kg).toLocaleString('ru-RU',{maximumFractionDigits:2})
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
  if(exercise.tracking_type!=='weight_reps')return null
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

function workoutRecoveryKey(workoutId:string){return 'andrey-fit:workout-recovery:'+workoutId}
function readWorkoutRecovery(workoutId:string):LocalWorkoutRecovery|null{
  try{
    const raw=localStorage.getItem(workoutRecoveryKey(workoutId))
    if(!raw)return null
    const value=JSON.parse(raw) as Partial<LocalWorkoutRecovery>
    if(value.version!==1)return null
    return {
      version:1,
      updatedAt:typeof value.updatedAt==='number'?value.updatedAt:0,
      extraSets:value.extraSets&&typeof value.extraSets==='object'?value.extraSets:{},
      cardioDrafts:value.cardioDrafts&&typeof value.cardioDrafts==='object'?value.cardioDrafts:{},
      ui:value.ui&&typeof value.ui==='object'?value.ui:null,
    }
  }catch{return null}
}
function patchWorkoutRecovery(workoutId:string,patch:Partial<Pick<LocalWorkoutRecovery,'extraSets'|'cardioDrafts'|'ui'>>){
  try{
    const current=readWorkoutRecovery(workoutId)??{version:1 as const,updatedAt:0,extraSets:{},cardioDrafts:{},ui:null}
    const next:LocalWorkoutRecovery={...current,...patch,version:1,updatedAt:Date.now()}
    localStorage.setItem(workoutRecoveryKey(workoutId),JSON.stringify(next))
  }catch{}
}
function clearWorkoutRecovery(workoutId:string){
  try{localStorage.removeItem(workoutRecoveryKey(workoutId))}catch{}
}
function clearWorkoutRecoveryUiIfMatches(workoutId:string,expected:WorkoutUiRecovery){
  const current=readWorkoutRecovery(workoutId)
  if(!current?.ui)return
  if(JSON.stringify(current.ui)!==JSON.stringify(expected))return
  patchWorkoutRecovery(workoutId,{ui:null})
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
  const previewRecovery=preview&&new URLSearchParams(window.location.search).get('qaRecovery')==='1'
  const recoveryPersistenceEnabled=!preview||previewRecovery
  const [plan,setPlan] = useState<ActiveTrainingPlan | null>(preview ? previewPlan : null)
  const [planLoaded,setPlanLoaded]=useState(preview)
  const [workout,setWorkout] = useState<LiveWorkout | null>(null)
  const [inProgressWorkout,setInProgressWorkout]=useState<LiveWorkout|null>(preview?previewWorkout:null)
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
  const [loadIssue,setLoadIssue]=useState('')
  const [reloadKey,setReloadKey]=useState(0)
  const [setDrafts,setSetDrafts] = useState<Record<string,SetDraft>>({})
  const [activeExerciseId,setActiveExerciseId] = useState<string | null>(null)
  const [extraSets,setExtraSets] = useState<Record<string,number>>({})
  const [sheet,setSheet] = useState<SheetState>(null)
  const [replacementChoice,setReplacementChoice]=useState<{exerciseId:string;newExerciseId:string;name:string}|null>(null)
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
  const [cardioDrafts,setCardioDrafts] = useState<Record<string,CardioDraft>>({})
  const [cardioAddOpen,setCardioAddOpen]=useState(false)
  const [cardioModalities,setCardioModalities]=useState<CardioModalityOption[]>(preview?previewCardioModalities:[])
  const [cardioAddLoading,setCardioAddLoading]=useState(false)
  const [cardioAddDraft,setCardioAddDraft]=useState<AddCardioDraft>(()=>emptyAddCardioDraft(previewCardioModalities[0].code))
  const [cardioAddIssue,setCardioAddIssue]=useState('')
  const cardioAddRequestRef=useRef<string|null>(null)
  const [customExerciseOpen,setCustomExerciseOpen]=useState(false)
  const [personalExercises,setPersonalExercises]=useState<PersonalExerciseOption[]>(preview?previewPersonalExercises:[])
  const [exerciseEquipment,setExerciseEquipment]=useState<ExerciseEquipmentOption[]>(preview?previewExerciseEquipment:[])
  const [customExerciseLoading,setCustomExerciseLoading]=useState(false)
  const [customExerciseDraft,setCustomExerciseDraft]=useState<AddExerciseDraft>(()=>emptyAddExerciseDraft())
  const [customExerciseIssue,setCustomExerciseIssue]=useState('')
  const customExerciseRequestRef=useRef<string|null>(null)
  const [removeExerciseConfirmation,setRemoveExerciseConfirmation]=useState<LiveWorkoutExercise|null>(null)
  const [finishConfirmation,setFinishConfirmation] = useState<string | null>(null)
  const [cancelWorkoutConfirmation,setCancelWorkoutConfirmation]=useState(false)
  const [finishComment,setFinishComment]=useState('')
  const [removeSetConfirmation,setRemoveSetConfirmation]=useState<{exercise:LiveWorkoutExercise;setNumber:number}|null>(null)
  const [removeCardioConfirmation,setRemoveCardioConfirmation]=useState<LiveCardioEntry|null>(null)
  const [loadSuggestion,setLoadSuggestion]=useState<LoadSuggestion|null>(null)
  const [workoutRecords,setWorkoutRecords]=useState<WorkoutRecord[]>([])
  const [recordsLoading,setRecordsLoading]=useState(false)
  const commentRequestRef=useRef<{key:string;body:string;id:string}|null>(null)
  const commentExerciseId=sheet?.type==='comment'?sheet.exercise.id:null
  const setWriteQueuesRef=useRef<Record<string,Promise<void>>>({})
  const uiStateWriteQueueRef=useRef<Promise<void>>(Promise.resolve())
  const recoveredWorkoutRouteRef=useRef<string|null>(null)
  const overlayHistoryRef=useRef(false)
  const overlayPopRef=useRef(false)
  const workoutContextLoadsRef=useRef<Record<string,'loading'|'done'>>({})
  const finalizedWorkoutRef=useRef<string|null>(null)
  const workoutContextKey=workout?.exercises.map(item=>item.id+':'+item.exercise_id).join('|')??''

  function localSetDraftKey(exerciseId:string,setNumber:number){
    return workout&&recoveryPersistenceEnabled?`andrey-fit:set-draft:${workout.id}:${exerciseId}:${setNumber}`:null
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

  function patchCardioDraft(id:string,patch:Partial<CardioDraft>){
    setCardioDrafts(current=>{
      const base=current[id]??{duration:'',hr:'',rpe:'',distance:''}
      const next={...base,...patch}
      const all={...current,[id]:next}
      if(workout&&recoveryPersistenceEnabled)patchWorkoutRecovery(workout.id,{cardioDrafts:all})
      return all
    })
  }

  function setExtraSetCount(exerciseId:string,count:number){
    setExtraSets(current=>{
      const next={...current,[exerciseId]:Math.max(0,count)}
      if(workout&&recoveryPersistenceEnabled)patchWorkoutRecovery(workout.id,{extraSets:next})
      return next
    })
  }

  function clearCardioRecovery(id:string){
    if(!workout||!recoveryPersistenceEnabled)return
    const recovery=readWorkoutRecovery(workout.id)
    if(!recovery?.cardioDrafts[id])return
    const next={...recovery.cardioDrafts}
    delete next[id]
    patchWorkoutRecovery(workout.id,{cardioDrafts:next})
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

  async function flushPendingSetWrites(exerciseId?:string){
    const pending=Object.entries(setWriteQueuesRef.current)
      .filter(([key])=>!exerciseId||key.startsWith(exerciseId+':'))
      .map(([,promise])=>promise)
    if(!pending.length)return
    const results=await Promise.allSettled(pending)
    const failed=results.find((result):result is PromiseRejectedResult=>result.status==='rejected')
    if(failed)throw failed.reason
  }


  const workoutOverlayOpen=Boolean(sheet||finishConfirmation||cancelWorkoutConfirmation||removeSetConfirmation||cardioAddOpen||removeCardioConfirmation||customExerciseOpen||removeExerciseConfirmation)

  useEffect(()=>{
    if(!workoutOverlayOpen||overlayHistoryRef.current)return
    window.history.pushState({...window.history.state,andreyFitWorkoutOverlay:true},'',window.location.href)
    overlayHistoryRef.current=true
  },[workoutOverlayOpen])

  useEffect(()=>{
    const dismiss=()=>{
      if(!overlayHistoryRef.current)return
      overlayPopRef.current=true
      overlayHistoryRef.current=false
      setSheet(null)
      setFinishConfirmation(null)
      setRemoveSetConfirmation(null)
      setCardioAddOpen(false)
      setRemoveCardioConfirmation(null)
      setCustomExerciseOpen(false)
      setRemoveExerciseConfirmation(null)
      window.setTimeout(()=>{overlayPopRef.current=false},0)
    }
    const onKey=(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||!overlayHistoryRef.current)return
      event.preventDefault()
      setSheet(null)
      setFinishConfirmation(null)
      setRemoveSetConfirmation(null)
      setCardioAddOpen(false)
      setRemoveCardioConfirmation(null)
      setCustomExerciseOpen(false)
      setRemoveExerciseConfirmation(null)
    }
    window.addEventListener('popstate',dismiss)
    window.addEventListener('keydown',onKey)
    return()=>{
      window.removeEventListener('popstate',dismiss)
      window.removeEventListener('keydown',onKey)
    }
  },[])

  useEffect(()=>{
    if(workoutOverlayOpen||!overlayHistoryRef.current||overlayPopRef.current)return
    overlayHistoryRef.current=false
    if((window.history.state as {andreyFitWorkoutOverlay?:boolean}|null)?.andreyFitWorkoutOverlay){
      window.history.back()
    }
  },[workoutOverlayOpen])

  useEffect(()=>{
    if(preview)return
    let cancelled=false
    setLoading(true)
    setLoadIssue('')
    const addFailure=(label:string)=>{
      if(cancelled)return
      setLoadIssue(current=>{
        const prefix='Часть тренировок не загрузилась: '
        const existing=current.startsWith(prefix)?current.slice(prefix.length).replace(/\.$/,'').split(', ').filter(Boolean):[]
        return prefix+[...new Set([...existing,label])].join(', ')+'.'
      })
    }

    Promise.allSettled([loadActiveTrainingPlan(),loadInProgressWorkout()])
      .then(([planResult,workoutResult])=>{
        if(cancelled)return
        const activeWorkout=workoutResult.status==='fulfilled'?workoutResult.value:null

        if(planResult.status==='fulfilled'){setPlan(planResult.value);setPlanLoaded(true)}
        else {setPlanLoaded(false);addFailure('активная программа')}

        if(workoutResult.status==='fulfilled')setInProgressWorkout(activeWorkout)
        else addFailure('текущая тренировка')

        if(routeWorkoutId&&activeWorkout?.id===routeWorkoutId){
          setWorkout(activeWorkout)
        }else if(!routeWorkoutId&&activeWorkout){
          setWorkout(activeWorkout)
          navigate('/workouts?workout='+encodeURIComponent(activeWorkout.id),{replace:true,state:{fromWorkouts:true,autoResume:true}})
        }else{
          setWorkout(null)
          void loadLatestCompletedWorkout()
            .then(item=>{if(!cancelled)setRecentCompletedWorkout(item)})
            .catch(()=>{})
        }
      })
      .finally(()=>{if(!cancelled)setLoading(false)})

    void loadWorkoutHistory(90)
      .then(history=>{if(!cancelled)setWorkoutHistory(history)})
      .catch(()=>addFailure('история'))

    void loadMyWorkoutSchedule()
      .then(schedule=>{
        if(cancelled)return
        setWorkoutSchedule(schedule)
        if(schedule){
          setScheduleWeekdays(schedule.weekdays)
          setScheduleTime(schedule.local_time.slice(0,5))
          setScheduleSessions(schedule.session_by_weekday)
        }
      })
      .catch(()=>addFailure('расписание'))

    return ()=>{cancelled=true}
  },[preview,reloadKey])

  useEffect(()=>{
    if(!preview)return
    if(!routeWorkoutId){
      setWorkout(null)
      setActiveExerciseId(null)
      return
    }
    if(routeWorkoutId===previewWorkout.id){
      setWorkout(current=>current?.id===previewWorkout.id?current:previewWorkout)
    }
  },[preview,routeWorkoutId])

  useEffect(()=>{
    if(preview||!inProgressWorkout)return
    let cancelled=false
    const sessionId=inProgressWorkout.id
    const rolloverAnchor=inProgressWorkout.reopened_at??inProgressWorkout.started_at
    const anchorLocalDay=appDateKey(new Date(rolloverAnchor))
    const syncAfterDayChange=()=>{
      if(anchorLocalDay>=appDateKey())return
      void loadWorkout(sessionId).then(fresh=>{
        if(cancelled||fresh.status!=='completed')return
        setInProgressWorkout(null)
        setRecentCompletedWorkout(fresh)
        setWorkout(current=>current?.id===fresh.id?fresh:current)
        clearWorkoutRecovery(fresh.id)
        showAppToast('Новый день — вчерашняя тренировка автоматически завершена.','info')
      }).catch(()=>{})
    }
    syncAfterDayChange()
    const timer=window.setInterval(syncAfterDayChange,60000)
    const onVisible=()=>{if(document.visibilityState==='visible')syncAfterDayChange()}
    document.addEventListener('visibilitychange',onVisible)
    window.addEventListener('online',syncAfterDayChange)
    return()=>{
      cancelled=true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange',onVisible)
      window.removeEventListener('online',syncAfterDayChange)
    }
  },[preview,inProgressWorkout?.id,inProgressWorkout?.started_at,inProgressWorkout?.reopened_at])

  useEffect(()=>{
    if(preview||!workout||workout.status!=='in_progress')return
    let cancelled=false
    const targetWorkoutId=workout.id
    const exercises=[...workout.exercises]
    void (async()=>{
      for(const exercise of exercises){
        if(cancelled)return
        const key=targetWorkoutId+':'+exercise.id+':'+exercise.exercise_id
        if(workoutContextLoadsRef.current[key])continue
        workoutContextLoadsRef.current[key]='loading'
        try{
          const context=await loadWorkoutExerciseContext({
            workoutExerciseId:exercise.id,
            exerciseId:exercise.exercise_id,
            before:workout.started_at,
            allowSubstitution:exercise.allow_substitution,
            substitutionGroupId:exercise.substitution_group_id,
          })
          if(cancelled){delete workoutContextLoadsRef.current[key];return}
          workoutContextLoadsRef.current[key]='done'
          const patch=(current:LiveWorkout|null)=>current?.id===targetWorkoutId
            ? {...current,exercises:current.exercises.map(item=>item.id===exercise.id?{...item,...context}:item)}
            : current
          setWorkout(patch)
          setInProgressWorkout(patch)
        }catch{
          delete workoutContextLoadsRef.current[key]
        }
      }
    })()
    return()=>{cancelled=true}
  },[preview,workout?.id,workout?.status,workoutContextKey])

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
    if(workout.status==='in_progress')finalizedWorkoutRef.current=null
    const recovery=workout.status==='in_progress'&&recoveryPersistenceEnabled?readWorkoutRecovery(workout.id):null
    const drafts:Record<string,SetDraft> = {}
    for (const exercise of workout.exercises) {
      const highestSavedSet=Math.max(exercise.prescribed_sets,...exercise.sets.map(set=>set.set_number))
      const localExtra=Math.max(0,Number(recovery?.extraSets?.[exercise.id]??0))
      const count=Math.max(highestSavedSet,exercise.prescribed_sets+localExtra)
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
    const savedExtra=Object.fromEntries(workout.exercises.map(exercise=>{
      const highestSavedSet=Math.max(exercise.prescribed_sets,...exercise.sets.map(set=>set.set_number))
      const serverCount=Math.max(0,highestSavedSet-exercise.prescribed_sets)
      const localCount=Math.max(0,Number(recovery?.extraSets?.[exercise.id]??0))
      return [exercise.id,Math.max(serverCount,localCount)]
    }))
    setExtraSets(savedExtra)
    if (workout.status==='in_progress') {
      const recoveredUi=recovery?.ui
      setTimerEnd(recoveredUi?.timerEnd ?? (workout.rest_timer_end_at ? new Date(workout.rest_timer_end_at).getTime() : null))
      setTimerName(recoveredUi?.timerName ?? workout.rest_timer_name ?? '')
    }else if(recoveryPersistenceEnabled){
      clearWorkoutRecovery(workout.id)
    }
    setCardioDrafts(Object.fromEntries(workout.cardio.map(item=>{
      const serverDraft:CardioDraft={
        duration:item.actual_duration_minutes==null?'':String(item.actual_duration_minutes),
        hr:item.actual_hr_avg==null?'':String(item.actual_hr_avg),
        rpe:item.actual_rpe==null?'':String(item.actual_rpe),
        distance:item.actual_distance_km==null?'':String(item.actual_distance_km),
      }
      const localDraft=!item.completed_at?recovery?.cardioDrafts?.[item.id]:null
      return [item.id,localDraft?{...serverDraft,...localDraft}:serverDraft]
    })))
  },[workout?.id])

  useEffect(()=>{
    if(!recoveryPersistenceEnabled||!workout||workout.status!=='in_progress'||routeExerciseId||recoveredWorkoutRouteRef.current===workout.id)return
    recoveredWorkoutRouteRef.current=workout.id
    const recovery=readWorkoutRecovery(workout.id)
    const recoveredExerciseId=recovery?.ui?.activeExerciseId??workout.active_workout_exercise_id
    if(!recoveredExerciseId||!workout.exercises.some(exercise=>exercise.id===recoveredExerciseId))return
    setActiveExerciseId(recoveredExerciseId)
    navigate('/workouts?workout='+encodeURIComponent(workout.id)+'&exercise='+encodeURIComponent(recoveredExerciseId),{replace:true,state:{fromWorkout:true,recovered:true}})
  },[recoveryPersistenceEnabled,workout?.id,workout?.status,routeExerciseId,navigate])

  useEffect(()=>{
    if (!recoveryPersistenceEnabled || !workout || workout.status!=='in_progress') return
    const handle=window.setTimeout(()=>{
      const uiState:WorkoutUiRecovery={activeExerciseId,timerEnd,timerName}
      patchWorkoutRecovery(workout.id,{ui:uiState})
      if(preview)return
      const previous=uiStateWriteQueueRef.current
      const next=previous.catch(()=>{}).then(()=>saveWorkoutUiState(
        workout.id,
        activeExerciseId,
        timerEnd ? new Date(timerEnd).toISOString() : null,
        timerName
      ))
      uiStateWriteQueueRef.current=next
      void next.then(()=>clearWorkoutRecoveryUiIfMatches(workout.id,uiState)).catch(()=>{})
    },750)
    return ()=>window.clearTimeout(handle)
  },[preview,recoveryPersistenceEnabled,workout?.id,workout?.status,activeExerciseId,timerEnd,timerName])

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

  const workoutElapsedAnchor=workout?.reopened_at??workout?.started_at
  const workoutElapsedSeconds=workout?.status==='in_progress'&&workoutElapsedAnchor?Math.max(0,Math.floor((now-new Date(workoutElapsedAnchor).getTime())/1000)):0
  const workoutElapsedLabel=`${String(Math.floor(workoutElapsedSeconds/3600)).padStart(2,'0')}:${String(Math.floor((workoutElapsedSeconds%3600)/60)).padStart(2,'0')}:${String(workoutElapsedSeconds%60).padStart(2,'0')}`

  const completedSetCount = useMemo(()=>{
    if (!workout) return 0
    return Object.entries(setDrafts).filter(([,draft])=>draft.completed&&!draft.isWarmup).length
  },[workout,setDrafts])
  const completedCardioCount=workout?.cardio.filter(item=>Boolean(item.completed_at)).length??0
  const canCancelCurrentWorkout=Boolean(workout&&canAbandonWorkout({
    status:workout.status,
    completedSetCount,
    completedCardioCount,
  }))


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
    const timezone=getAppTimeZone()
    setBusy(true);setNotice('')
    try{
      if(scheduleWeekdays.length&&plan?.sessions.length){
        const missing=scheduleWeekdays.filter(day=>!(scheduleSessions[String(day)]??sessionForWeekday(day)?.id))
        if(missing.length)throw new Error('Для каждого выбранного дня укажи тренировку.')
      }
      if(preview){
        const next:WorkoutSchedule={id:'preview-schedule',weekdays:scheduleWeekdays,local_time:scheduleTime+':00',timezone,enabled:scheduleWeekdays.length>0,session_by_weekday:scheduleSessions}
        setWorkoutSchedule(next)
      }else{
        const next=await saveMyWorkoutSchedule({id:workoutSchedule?.id,weekdays:scheduleWeekdays,localTime:scheduleTime,sessionByWeekday:scheduleSessions,timezone})
        setWorkoutSchedule(next)
      }
      setScheduleOpen(false)
      showAppToast(scheduleWeekdays.length?'Расписание тренировок сохранено. Напоминание придёт в выбранные дни.':'Расписание отключено.')
    }catch(error){
      if(!preview){
        try{
          const actual=await loadMyWorkoutSchedule()
          const saved=actual
            && sameNumberList(actual.weekdays,scheduleWeekdays)
            && actual.local_time.slice(0,5)===scheduleTime.slice(0,5)
            && actual.timezone===timezone
            && actual.enabled===(scheduleWeekdays.length>0)
            && sameStringMap(actual.session_by_weekday,scheduleSessions)
          if(saved){
            setWorkoutSchedule(actual)
            setScheduleOpen(false)
            showAppToast(scheduleWeekdays.length?'Расписание уже было сохранено на сервере.':'Расписание уже было отключено на сервере.','info')
            return
          }
        }catch{}
      }
      showAppToast(error instanceof Error?error.message:'Не удалось сохранить расписание','error')
    }
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
      if(!preview){
        try{
          const active=await loadInProgressWorkout()
          if(active){
            setInProgressWorkout(active)
            openWorkoutRoute(active)
            showAppToast('Тренировка уже была создана на сервере — продолжаем её.','info')
            return
          }
        }catch{}
      }
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
    }catch(error){
      if(!preview){
        try{
          const active=await loadInProgressWorkout()
          if(active){
            setInProgressWorkout(active)
            openWorkoutRoute(active)
            if(active.id===target.id)setRecentCompletedWorkout(null)
            showAppToast(active.id===target.id?'Тренировка уже возобновлена — продолжаем.':'Уже есть незавершённая тренировка — продолжаем её.','info')
            return
          }
        }catch{}
      }
      showAppToast(errorMessage(error,'Не удалось возобновить тренировку'),'error')
    }
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

  function finishSet(exercise:LiveWorkoutExercise,setNumber:number) {
    const key=`${exercise.id}:${setNumber}`
    const draft=setDrafts[key] ?? defaultDraft(exercise,setNumber)
    const reps=draft.reps.trim()==='' ? null : Number(draft.reps)
    const weight=parseDecimal(draft.weight)
    if (reps==null || !Number.isInteger(reps) || reps<1) {
      showAppToast('Укажи количество повторов целым числом больше нуля.','warning')
      return
    }

    const isWarmup=setNumber===0 || draft.isWarmup
    const completedAt=new Date().toISOString()

    // Mark immediately, but keep the local draft until the server confirms the write.
    patchSet(exercise.id,setNumber,{completed:true,completedAt,isWarmup})

    const expectedRir=isWarmup ? null : (exercise.rir_enabled ? draft.rir : null)
    const supersetPartner=!isWarmup && workout
      ? findSupersetPartner(workout.exercises,exercise)
      : null
    const partnerSet=supersetPartner ? (setDrafts[`${supersetPartner.id}:${setNumber}`] ?? defaultDraft(supersetPartner,setNumber)) : null
    const exerciseHasNext=setNumber < exercise.prescribed_sets+(extraSets[exercise.id] ?? 0)
    const partnerHasThisSet=Boolean(supersetPartner && setNumber <= supersetPartner.prescribed_sets+(extraSets[supersetPartner.id] ?? 0))

    const afterConfirmedSave=()=>{
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

      if(supersetPartner && exercise.superset_position===1 && partnerHasThisSet && !partnerSet?.completed){
        setTimerEnd(null)
        setTimerName('')
        showAppToast(`Сет сохранён. Дальше без отдыха — ${supersetPartner.name}.`,'info')
        return
      }

      if(supersetPartner && exercise.superset_position===2){
        const firstExercise=supersetPartner.superset_position===1 ? supersetPartner : exercise
        const secondExercise=exercise.superset_position===2 ? exercise : supersetPartner
        const firstTotal=firstExercise.prescribed_sets+(extraSets[firstExercise.id] ?? 0)
        const secondTotal=secondExercise.prescribed_sets+(extraSets[secondExercise.id] ?? 0)
        const nextRound=setNumber+1
        const nextStarter=nextSupersetRoundStarter({nextRound,firstTotal,secondTotal})
        if(nextStarter){
          const starter=nextStarter===1?firstExercise:secondExercise
          setTimerName(nextStarter===1?'Суперсет':starter.name)
          setTimerEnd(Date.now()+exercise.rest_seconds*1000)
          timerFinishedRef.current=false
          showAppToast(
            nextStarter===1
              ? `Суперсет завершён. После отдыха начни следующий круг с «${starter.name}».`
              : `Общие круги закончились. После отдыха выполни оставшиеся подходы «${starter.name}» отдельно.`,
            'info'
          )
        }else{
          setTimerEnd(null)
          setTimerName('')
          showAppToast('Последний круг суперсета завершён.','info')
        }
        return
      }

      if(supersetPartner && exercise.superset_position===1 && !partnerHasThisSet){
        if(exerciseHasNext){
          setTimerName(exercise.name)
          setTimerEnd(Date.now()+exercise.rest_seconds*1000)
          timerFinishedRef.current=false
        }else{
          setTimerEnd(null)
          setTimerName('')
        }
        return
      }

      setTimerName(isWarmup ? exercise.name+' · после разминки' : exercise.name)
      setTimerEnd(Date.now()+(isWarmup ? exercise.warmup_rest_seconds : exercise.rest_seconds)*1000)
      timerFinishedRef.current=false
    }

    if(preview){
      setWorkout(current=>current?{
        ...current,
        exercises:current.exercises.map(item=>{
          if(item.id!==exercise.id)return item
          const nextSet:WorkoutSetRecord={
            id:'preview-set-'+exercise.id+'-'+setNumber,
            set_number:setNumber,
            weight_kg:weight,
            reps,
            rir:expectedRir,
            is_warmup:isWarmup,
            completed_at:completedAt,
          }
          const without=item.sets.filter(set=>set.set_number!==setNumber)
          return {...item,sets:[...without,nextSet].sort((a,b)=>a.set_number-b.set_number)}
        }),
      }:current)
      clearLocalSetDraft(exercise.id,setNumber)
      afterConfirmedSave()
      return
    }

    void queueSetWrite(exercise.id,setNumber,async()=>{
      await saveWorkoutSet(exercise.id,{
        set_number:setNumber,
        weight_kg:weight,
        reps,
        rir:expectedRir,
        is_warmup:isWarmup,
        completed_at:completedAt,
      })
    }).then(()=>{
      clearLocalSetDraft(exercise.id,setNumber)
      afterConfirmedSave()
    }).catch(async error=>{
      if(finalizedWorkoutRef.current===workout?.id){
        clearLocalSetDraft(exercise.id,setNumber)
        return
      }

      try{
        const serverWorkout=await loadWorkout(workout!.id)
        const serverExercise=serverWorkout.exercises.find(item=>item.id===exercise.id)
        const serverSet=serverExercise?.sets.find(set=>set.set_number===setNumber)
        const sameNumber=(a:number|null,b:number|null)=>a==null&&b==null||a!=null&&b!=null&&Math.abs(Number(a)-Number(b))<.001
        const serverHasSet=Boolean(
          serverSet?.completed_at
          && sameNumber(serverSet.weight_kg,weight)
          && serverSet.reps===reps
          && sameNumber(serverSet.rir,expectedRir)
          && serverSet.is_warmup===isWarmup
        )

        setWorkout(serverWorkout)
        setInProgressWorkout(serverWorkout.status==='in_progress'?serverWorkout:null)

        if(serverHasSet&&serverSet){
          patchSet(exercise.id,setNumber,{completed:true,completedAt:serverSet.completed_at,isWarmup})
          clearLocalSetDraft(exercise.id,setNumber)
          afterConfirmedSave()
          showAppToast('Сет уже был сохранён на сервере.','info')
          return
        }

        patchSet(exercise.id,setNumber,{completed:false,completedAt:null,isWarmup})

        if(serverWorkout.status!=='in_progress'){
          setRecentCompletedWorkout(serverWorkout)
          showAppToast('Тренировка уже завершена на сервере. Возобнови её, чтобы продолжить — введённые данные оставлены в черновике.','warning')
          return
        }
      }catch{
        patchSet(exercise.id,setNumber,{completed:false,completedAt:null,isWarmup})
      }

      showAppToast((error instanceof Error?error.message:'Не удалось сохранить сет')+' Данные оставлены в черновике — можно исправить их и нажать галочку ещё раз.','error')
    })
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
      setExtraSetCount(exercise.id,extraCount-1)
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
    let completedAt=new Date().toISOString()
    setBusy(true);setNotice('')
    try {
      if (!preview) {
        await flushPendingSetWrites(exercise.id)
        completedAt=await completeWorkoutExercise(exercise.id)
      }
      setWorkout(current=>current ? {
        ...current,
        exercises:current.exercises.map(item=>item.id===exercise.id?{...item,completed_at:completedAt}:item),
      } : current)
      setLoadSuggestion(null)
      setActiveExerciseId(null)
      setTimerEnd(null)
    } catch (error) {
      if(!preview&&workout){
        try{
          const serverWorkout=await loadWorkout(workout.id)
          const serverExercise=serverWorkout.exercises.find(item=>item.id===exercise.id)
          if(serverExercise?.completed_at){
            setWorkout(serverWorkout)
            setInProgressWorkout(serverWorkout.status==='in_progress'?serverWorkout:null)
            setLoadSuggestion(null)
            setActiveExerciseId(null)
            setTimerEnd(null)
            showAppToast('Упражнение уже было сохранено как завершённое.','info')
            return
          }
        }catch{}
      }
      showAppToast(error instanceof Error ? error.message : 'Не удалось завершить упражнение','error')
    } finally {setBusy(false)}
  }

  function clearExerciseDraftsAfterReplacement(exercise:LiveWorkoutExercise){
    const maxSet=Math.max(exercise.prescribed_sets+(extraSets[exercise.id]??0),...exercise.sets.map(set=>set.set_number))
    if(exercise.warmup_enabled)clearLocalSetDraft(exercise.id,0)
    for(let setNumber=1;setNumber<=maxSet;setNumber++)clearLocalSetDraft(exercise.id,setNumber)
    setSetDrafts(current=>{
      const next={...current}
      for(const key of Object.keys(next))if(key.startsWith(exercise.id+':'))delete next[key]
      return next
    })
    setExtraSetCount(exercise.id,0)
    setLoadSuggestion(null)
  }

  async function replaceExercise(exercise:LiveWorkoutExercise,newExerciseId:string,persistPreference=false) {
    const completedPrescribedSets=new Set<number>()
    exercise.sets.forEach(set=>{
      if(!set.is_warmup&&set.completed_at&&set.set_number>=1&&set.set_number<=exercise.prescribed_sets)completedPrescribedSets.add(set.set_number)
    })
    Object.entries(setDrafts).forEach(([key,draft])=>{
      if(!key.startsWith(exercise.id+':')||!draft.completed||draft.isWarmup)return
      const setNumber=Number(key.slice(exercise.id.length+1))
      if(Number.isInteger(setNumber)&&setNumber>=1&&setNumber<=exercise.prescribed_sets)completedPrescribedSets.add(setNumber)
    })
    const hasSavedResult=Boolean(exercise.completed_at)
      || exercise.sets.some(set=>Boolean(set.completed_at))
      || Object.entries(setDrafts).some(([key,draft])=>key.startsWith(exercise.id+':')&&draft.completed)
    const switchAfterSavedResult=hasSavedResult&&!exercise.completed_at
    const remainingSets=Math.max(0,exercise.prescribed_sets-completedPrescribedSets.size)

    if(switchAfterSavedResult&&remainingSets<=0){
      setSheet(null)
      showAppToast('Все запланированные подходы уже выполнены. Заверши упражнение и переходи к следующему.','info')
      return
    }

    setBusy(true);setNotice('')
    try {
      let targetExerciseId=exercise.id
      if (preview) {
        const option=exercise.substitution_options.find(item=>item.id===newExerciseId)
        if(option&&switchAfterSavedResult){
          const continuationId='preview-switch-'+Date.now()
          const completedAt=new Date().toISOString()
          targetExerciseId=continuationId
          setWorkout(current=>{
            if(!current)return current
            const shifted=current.exercises.map(item=>{
              if(item.id===exercise.id)return {...item,completed_at:completedAt}
              if(item.sort_order>exercise.sort_order)return {...item,sort_order:item.sort_order+10}
              return item
            })
            const continuation:LiveWorkoutExercise={
              ...exercise,
              id:continuationId,
              exercise_id:option.id,
              name:option.name,
              sort_order:exercise.sort_order+10,
              prescribed_sets:remainingSets,
              completed_at:null,
              continued_from_workout_exercise_id:exercise.id,
              sets:[],
              previous_sets:[],
              load_recommendation:null,
              warmup_enabled:exercise.warmup_enabled&&completedPrescribedSets.size===0,
              substitution_options:exercise.substitution_options.filter(item=>item.id!==option.id),
            }
            return {
              ...current,
              active_workout_exercise_id:continuationId,
              exercises:[...shifted,continuation].sort((a,b)=>a.sort_order-b.sort_order),
            }
          })
        }else if(option){
          setWorkout(current=>current ? {...current,exercises:current.exercises.map(item=>item.id===exercise.id?{...item,exercise_id:option.id,name:option.name}:item)} : current)
        }
      } else {
        targetExerciseId=await replaceWorkoutExercise(exercise.id,newExerciseId,persistPreference)
        const serverWorkout=await loadWorkout(workout!.id)
        setWorkout(serverWorkout)
        setInProgressWorkout(serverWorkout.status==='in_progress'?serverWorkout:null)
      }
      clearExerciseDraftsAfterReplacement(exercise)
      setReplacementChoice(null)
      setSheet(null)
      if(targetExerciseId!==exercise.id&&workout){
        navigate('/workouts?workout='+encodeURIComponent(workout.id)+'&exercise='+encodeURIComponent(targetExerciseId),{replace:true,state:{fromWorkout:true}})
        showAppToast(`Сохранённые подходы оставлены в истории. Продолжи новое упражнение — осталось ${remainingSets} ${remainingSets===1?'подход':'подхода'}.${persistPreference?' В следующих тренировках эта замена применится автоматически.':''}`,'info')
      }else{
        showAppToast(persistPreference?'Упражнение заменено и будет использоваться в следующих тренировках.':'Упражнение заменено. Несохранённые значения старого упражнения не переносились.','info')
      }
    } catch (error) {
      if(!preview&&workout){
        try{
          const serverWorkout=await loadWorkout(workout.id)
          const serverExercise=serverWorkout.exercises.find(item=>item.id===exercise.id)
          const continuation=serverWorkout.exercises.find(item=>
            item.continued_from_workout_exercise_id===exercise.id
            && item.exercise_id===newExerciseId
          )
          if(serverExercise?.exercise_id===newExerciseId||continuation){
            setWorkout(serverWorkout)
            setInProgressWorkout(serverWorkout.status==='in_progress'?serverWorkout:null)
            clearExerciseDraftsAfterReplacement(exercise)
            setReplacementChoice(null)
            setSheet(null)
            if(continuation){
              navigate('/workouts?workout='+encodeURIComponent(workout.id)+'&exercise='+encodeURIComponent(continuation.id),{replace:true,state:{fromWorkout:true}})
              showAppToast(persistPreference?'Смена уже сохранена, и эта замена будет использоваться в следующих тренировках.':'Смена упражнения уже была сохранена на сервере. Выполненные подходы остались в истории.','info')
            }else{
              showAppToast(persistPreference?'Замена уже сохранена и будет использоваться в следующих тренировках.':'Замена уже была сохранена на сервере.','info')
            }
            return
          }
        }catch{}
      }
      const message=error instanceof Error ? error.message : 'Не удалось сменить упражнение'
      showAppToast(
        message.includes('Finish or delete the set being edited')
          ? 'Сначала сохрани заново или удали подход, который сейчас открыт для редактирования.'
          : message,
        'error'
      )
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
        setCommentNotice('Сообщение отправлено тренеру.')
        setComment('')
        return
      }

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

      const send=()=>commentThread
        ? replyToFeedback(commentThread.id,body,request.id)
        : addWorkoutComment(exercise.id,body,request.id)
      try{await send()}
      catch(firstError){
        try{await send()}
        catch{throw firstError}
      }

      const now=new Date().toISOString()
      setCommentThread(current=>current?{
        ...current,
        status:'new',
        updated_at:now,
        messages:current.messages.some(message=>message.id==='local:'+request.id)
          ? current.messages
          : [...current.messages,{id:'local:'+request.id,author_id:current.client_id,body,created_at:now}],
      }:current)
      commentRequestRef.current=null
      clearWorkoutFeedbackDraft(exercise.id)
      setComment('')
      setCommentNotice('Сообщение отправлено тренеру.')

      try{
        setCommentThread(await loadMyWorkoutFeedback(exercise.id))
      }catch{
        setCommentNotice('Сообщение отправлено тренеру. Переписка обновится при следующем открытии.')
      }
    } catch (error) {
      setCommentNotice(error instanceof Error ? error.message : 'Не удалось отправить комментарий')
    } finally {setBusy(false)}
  }

  async function detectWorkoutRecords(item:LiveWorkout):Promise<WorkoutRecord[]> {
    const records:WorkoutRecord[]=[]
    // This is non-critical post-workout enrichment. Keep reads sequential so a
    // completed workout with many exercises cannot burst the API under load.
    for(const exercise of item.exercises){
      const history=await loadExerciseHistory(exercise.exercise_id,50)
      const current=history.find(entry=>entry.workout_session_id===item.id)
      const currentMoment=current?new Date(current.completed_at??current.workout_date+'T23:59:59').getTime():0
      const previous=history.filter(entry=>entry.workout_session_id!==item.id&&new Date(entry.completed_at??entry.workout_date+'T00:00:00').getTime()<currentMoment)
      const currentMetrics=current?sessionStrengthMetrics(current.sets):null
      const previousMetrics=previous.map(entry=>sessionStrengthMetrics(entry.sets)).filter(Boolean) as {maxWeight:number|null;e1rm:number|null;volume:number|null;maxReps:number;totalReps:number}[]
      if(!currentMetrics||!previousMetrics.length)continue
      const labels:string[]=[]
      const previousWeights=previousMetrics.map(x=>x.maxWeight).filter((x):x is number=>x!=null)
      const previousE1rm=previousMetrics.map(x=>x.e1rm).filter((x):x is number=>x!=null)
      const previousVolume=previousMetrics.map(x=>x.volume).filter((x):x is number=>x!=null)
      if(currentMetrics.maxWeight!=null&&previousWeights.length&&currentMetrics.maxWeight>Math.max(...previousWeights))labels.push('Максимальный вес')
      if(currentMetrics.e1rm!=null&&previousE1rm.length&&currentMetrics.e1rm>Math.max(...previousE1rm))labels.push('Расчётный 1ПМ')
      if(currentMetrics.volume!=null&&previousVolume.length&&currentMetrics.volume>Math.max(...previousVolume))labels.push('Объём')
      if(currentMetrics.maxReps>Math.max(...previousMetrics.map(x=>x.maxReps)))labels.push('Повторы в подходе')
      if(currentMetrics.totalReps>Math.max(...previousMetrics.map(x=>x.totalReps)))labels.push('Повторы за тренировку')
      if(labels.length)records.push({exerciseId:exercise.exercise_id,name:exercise.name,labels})
    }
    return records
  }

  async function openAddCustomExercise(){
    if(!workout||workout.status!=='in_progress')return
    customExerciseRequestRef.current=customExerciseRequestRef.current??crypto.randomUUID()
    setCustomExerciseIssue('')
    setCustomExerciseOpen(true)
    if(preview){
      setPersonalExercises(previewPersonalExercises)
      setExerciseEquipment(previewExerciseEquipment)
      return
    }
    setCustomExerciseLoading(true)
    try{
      const data=await loadMyPersonalExercises()
      setPersonalExercises(data.exercises)
      setExerciseEquipment(data.equipment)
    }catch(error){
      setCustomExerciseIssue(error instanceof Error?error.message:'Не удалось загрузить личные упражнения')
    }finally{setCustomExerciseLoading(false)}
  }

  function closeAddCustomExercise(){
    if(busy)return
    setCustomExerciseOpen(false)
    setCustomExerciseIssue('')
  }

  function selectPersonalExercise(exerciseId:string){
    const exercise=personalExercises.find(item=>item.id===exerciseId)
    if(!exercise){
      setCustomExerciseDraft(current=>({...emptyAddExerciseDraft(),sets:current.sets,repsMin:current.repsMin,repsMax:current.repsMax,rirEnabled:current.rirEnabled,rirMin:current.rirMin,rirMax:current.rirMax,restSeconds:current.restSeconds}))
      return
    }
    setCustomExerciseDraft(current=>({
      ...current,
      exerciseId:exercise.id,
      name:'',
      trackingType:exercise.tracking_type,
      equipmentCode:exercise.equipment_code??'',
      notes:exercise.notes??'',
      restSeconds:String(exercise.default_rest_seconds||120),
    }))
  }

  async function submitAddCustomExercise(){
    if(!workout||workout.status!=='in_progress')return
    const existing=customExerciseDraft.exerciseId?personalExercises.find(item=>item.id===customExerciseDraft.exerciseId):null
    const name=customExerciseDraft.name.trim()
    const sets=Number(customExerciseDraft.sets)
    const repsMin=Number(customExerciseDraft.repsMin)
    const repsMax=Number(customExerciseDraft.repsMax)
    const rirMin=customExerciseDraft.rirEnabled?Number(customExerciseDraft.rirMin):null
    const rirMax=customExerciseDraft.rirEnabled?Number(customExerciseDraft.rirMax):null
    const restSeconds=Number(customExerciseDraft.restSeconds)
    const notes=customExerciseDraft.notes.trim()
    if(!existing&&!name){setCustomExerciseIssue('Укажи название упражнения.');return}
    if(name.length>120){setCustomExerciseIssue('Название слишком длинное.');return}
    if(!Number.isInteger(sets)||sets<1||sets>20){setCustomExerciseIssue('Количество подходов должно быть от 1 до 20.');return}
    if(!Number.isInteger(repsMin)||!Number.isInteger(repsMax)||repsMin<1||repsMax>1000||repsMin>repsMax){setCustomExerciseIssue('Проверь диапазон повторов.');return}
    if(customExerciseDraft.rirEnabled&&(!Number.isInteger(rirMin)||!Number.isInteger(rirMax)||(rirMin as number)<0||(rirMax as number)>3||(rirMin as number)>(rirMax as number))){setCustomExerciseIssue('RIR должен быть от 0 до 3.');return}
    if(!Number.isInteger(restSeconds)||restSeconds<15||restSeconds>1800){setCustomExerciseIssue('Отдых должен быть от 15 до 1800 секунд.');return}
    if(notes.length>1000){setCustomExerciseIssue('Заметка слишком длинная.');return}
    setBusy(true);setCustomExerciseIssue('')
    const requestId=customExerciseRequestRef.current??crypto.randomUUID()
    customExerciseRequestRef.current=requestId
    try{
      let newId:string
      if(preview){
        newId='preview-custom-exercise-'+Date.now()
        const exerciseId=existing?.id??'preview-personal-'+Date.now()
        const item:LiveWorkoutExercise={
          id:newId,exercise_id:exerciseId,name:existing?.name??name,
          tracking_type:existing?.tracking_type??customExerciseDraft.trackingType,entry_origin:'client_ad_hoc',client_notes:notes||existing?.notes||null,
          description:notes||existing?.notes||null,instructions:null,setup_notes:null,common_mistakes:null,technique_url:null,
          image_url:null,animation_url:null,video_url:null,primary_muscle:null,primary_muscles:[],secondary_muscles:[],
          sort_order:workout.exercises.length?Math.max(...workout.exercises.map(x=>x.sort_order))+10:10,
          prescribed_sets:sets,reps_min:repsMin,reps_max:repsMax,rir_min:rirMin,rir_max:rirMax,
          rir_enabled:customExerciseDraft.rirEnabled,rest_seconds:restSeconds,warmup_enabled:false,
          warmup_load_percent_min:50,warmup_load_percent_max:60,warmup_reps_min:8,warmup_reps_max:10,warmup_rest_seconds:60,warmup_notes:null,
          allow_substitution:false,substitution_group_id:null,substitution_policy:'strict',exercise_role:'optional',trainer_notes:null,
          completed_at:null,continued_from_workout_exercise_id:null,sets:[],previous_sets:[],load_recommendation:null,substitution_options:[],
        }
        setWorkout(current=>current?{...current,exercises:[...current.exercises,item]}:current)
        if(!existing)setPersonalExercises(current=>[...current,{id:exerciseId,name,tracking_type:customExerciseDraft.trackingType,equipment_code:customExerciseDraft.equipmentCode||null,notes:notes||null,default_rest_seconds:restSeconds}])
      }else{
        newId=await addMyCustomWorkoutExercise({
          workoutSessionId:workout.id,requestId,exerciseId:existing?.id??null,name:existing?null:name,
          trackingType:existing?null:customExerciseDraft.trackingType,equipmentCode:existing?null:(customExerciseDraft.equipmentCode||null),
          notes:notes||null,prescribedSets:sets,repsMin,repsMax,rirEnabled:customExerciseDraft.rirEnabled,rirMin,rirMax,restSeconds,
        })
        const refreshed=await loadWorkout(workout.id)
        if(!refreshed.exercises.some(item=>item.id===newId))throw new Error('Упражнение добавлено, но обновлённый блок пока не загрузился. Повтори сохранение.')
        setWorkout(refreshed)
        setInProgressWorkout(refreshed.status==='in_progress'?refreshed:null)
      }
      setCustomExerciseDraft(emptyAddExerciseDraft())
      customExerciseRequestRef.current=null
      setCustomExerciseOpen(false)
      showAppToast('Упражнение добавлено только в эту тренировку.','success')
      window.setTimeout(()=>openExercise(newId),0)
    }catch(error){
      setCustomExerciseIssue(error instanceof Error?error.message:'Не удалось добавить упражнение')
    }finally{setBusy(false)}
  }

  async function removeAdHocExercise(exercise:LiveWorkoutExercise){
    if(!workout||workout.status!=='in_progress'||exercise.entry_origin!=='client_ad_hoc')return
    setBusy(true)
    try{
      if(preview){
        setWorkout(current=>current?{...current,exercises:current.exercises.filter(item=>item.id!==exercise.id)}:current)
      }else{
        try{
          await removeMyCustomWorkoutExercise(exercise.id)
        }catch(error){
          const refreshed=await loadWorkout(workout.id)
          if(refreshed.exercises.some(item=>item.id===exercise.id))throw error
        }
        const refreshed=await loadWorkout(workout.id)
        setWorkout(refreshed)
        setInProgressWorkout(refreshed.status==='in_progress'?refreshed:null)
      }
      clearExerciseDraftsAfterReplacement(exercise)
      setRemoveExerciseConfirmation(null)
      setActiveExerciseId(null)
      navigate('/workouts?workout='+encodeURIComponent(workout.id),{replace:true})
      showAppToast('Упражнение убрано из этой тренировки. Оно осталось в личном списке.','info')
    }catch(error){
      showAppToast(error instanceof Error?error.message:'Не удалось убрать упражнение','error')
    }finally{setBusy(false)}
  }

  async function openAddCardio(){
    if(!workout||workout.status!=='in_progress')return
    cardioAddRequestRef.current=cardioAddRequestRef.current??crypto.randomUUID()
    setCardioAddIssue('')
    setCardioAddOpen(true)
    if(preview){
      setCardioModalities(previewCardioModalities)
      setCardioAddDraft(current=>({...current,modalityCode:current.modalityCode||previewCardioModalities[0].code}))
      return
    }
    setCardioAddLoading(true)
    try{
      const options=await loadCardioModalities()
      if(options.length===0)throw new Error('Справочник кардио пуст.')
      setCardioModalities(options)
      setCardioAddDraft(current=>({...current,modalityCode:options.some(item=>item.code===current.modalityCode)?current.modalityCode:options[0].code}))
    }catch(error){
      setCardioAddIssue(error instanceof Error?error.message:'Не удалось загрузить виды кардио')
    }finally{setCardioAddLoading(false)}
  }

  function closeAddCardio(){
    if(busy)return
    setCardioAddOpen(false)
    setCardioAddIssue('')
  }

  async function submitAddCardio(){
    if(!workout||workout.status!=='in_progress')return
    const duration=cardioAddDraft.duration===''?null:Number(cardioAddDraft.duration)
    const hr=cardioAddDraft.hr===''?null:Number(cardioAddDraft.hr)
    const rpe=cardioAddDraft.rpe===''?null:Number(cardioAddDraft.rpe.replace(',','.'))
    const distance=cardioAddDraft.distance===''?null:Number(cardioAddDraft.distance.replace(',','.'))
    const speed=cardioAddDraft.speed===''?null:Number(cardioAddDraft.speed.replace(',','.'))
    const incline=cardioAddDraft.incline===''?null:Number(cardioAddDraft.incline.replace(',','.'))
    if(!cardioAddDraft.modalityCode){setCardioAddIssue('Выбери вид кардио.');return}
    if(duration==null||!Number.isInteger(duration)||duration<1||duration>600){setCardioAddIssue('Укажи длительность от 1 до 600 минут.');return}
    if(hr!=null&&(!Number.isInteger(hr)||hr<30||hr>250)){setCardioAddIssue('Целевой пульс должен быть от 30 до 250 уд/мин.');return}
    if(rpe!=null&&(!Number.isFinite(rpe)||rpe<1||rpe>10)){setCardioAddIssue('RPE должен быть от 1 до 10.');return}
    if(distance!=null&&(!Number.isFinite(distance)||distance<0)){setCardioAddIssue('Дистанция не может быть отрицательной.');return}
    if(speed!=null&&(!Number.isFinite(speed)||speed<0)){setCardioAddIssue('Скорость не может быть отрицательной.');return}
    if(incline!=null&&(!Number.isFinite(incline)||incline<0)){setCardioAddIssue('Наклон не может быть отрицательным.');return}
    const name=cardioAddDraft.name.trim()
    if(name.length>120){setCardioAddIssue('Название слишком длинное.');return}
    setBusy(true);setCardioAddIssue('')
    const requestId=cardioAddRequestRef.current??crypto.randomUUID()
    cardioAddRequestRef.current=requestId
    try{
      if(preview){
        const newId='preview-ad-hoc-cardio-'+Date.now()
        const modality=cardioModalities.find(item=>item.code===cardioAddDraft.modalityCode)
        const entry:LiveCardioEntry={
          id:newId,modality_code:cardioAddDraft.modalityCode,modality_name:modality?.name??cardioAddDraft.modalityCode,
          name:name||null,sort_order:workout.cardio.length?Math.max(...workout.cardio.map(item=>item.sort_order))+10:100,
          prescribed_duration_minutes:duration,prescribed_hr_min:hr,prescribed_hr_max:hr,
          prescribed_rpe_min:rpe,prescribed_rpe_max:rpe,prescribed_speed_kmh:speed,prescribed_incline_percent:incline,
          prescribed_distance_km:distance,trainer_notes:null,actual_duration_minutes:null,actual_hr_avg:null,
          actual_rpe:null,actual_distance_km:null,client_notes:null,completed_at:null,entry_origin:'client_ad_hoc',
        }
        setWorkout(current=>current?{...current,cardio:[...current.cardio,entry]}:current)
        setCardioDrafts(current=>({...current,[newId]:{duration:'',hr:'',rpe:'',distance:''}}))
      }else{
        const newId=await addMyWorkoutCardio({
          workoutSessionId:workout.id,requestId,modalityCode:cardioAddDraft.modalityCode,durationMinutes:duration,
          name:name||null,targetHr:hr,targetRpe:rpe,distanceKm:distance,speedKmh:speed,inclinePercent:incline,
        })
        const refreshed=await loadWorkout(workout.id)
        if(!refreshed.cardio.some(item=>item.id===newId))throw new Error('Кардио добавлено, но обновлённый блок пока не загрузился. Повтори сохранение.')
        setWorkout(refreshed)
        setInProgressWorkout(refreshed.status==='in_progress'?refreshed:null)
      }
      setCardioAddDraft(emptyAddCardioDraft(cardioAddDraft.modalityCode))
      cardioAddRequestRef.current=null
      setCardioAddOpen(false)
      showAppToast('Кардио добавлено только в эту тренировку.','success')
    }catch(error){
      setCardioAddIssue(error instanceof Error?error.message:'Не удалось добавить кардио')
    }finally{setBusy(false)}
  }

  async function removeAdHocCardio(cardio:LiveCardioEntry){
    if(!workout||workout.status!=='in_progress'||cardio.entry_origin!=='client_ad_hoc')return
    setBusy(true);setCardioAddIssue('')
    try{
      if(preview){
        setWorkout(current=>current?{...current,cardio:current.cardio.filter(item=>item.id!==cardio.id)}:current)
      }else{
        try{
          await removeMyWorkoutCardio(cardio.id)
        }catch(error){
          const refreshed=await loadWorkout(workout.id)
          if(refreshed.cardio.some(item=>item.id===cardio.id))throw error
        }
        const refreshed=await loadWorkout(workout.id)
        setWorkout(refreshed)
        setInProgressWorkout(refreshed.status==='in_progress'?refreshed:null)
      }
      setCardioDrafts(current=>{
        const next={...current}
        delete next[cardio.id]
        return next
      })
      clearCardioRecovery(cardio.id)
      setRemoveCardioConfirmation(null)
      showAppToast('Добавленное кардио удалено.','info')
    }catch(error){
      showAppToast(error instanceof Error?error.message:'Не удалось удалить кардио','error')
    }finally{setBusy(false)}
  }

  async function finishCardio(id:string) {
    const draft=cardioDrafts[id] ?? {duration:'',hr:'',rpe:'',distance:''}
    const duration=draft.duration===''?null:Number(draft.duration)
    const hr=draft.hr===''?null:Number(draft.hr)
    const rpe=draft.rpe===''?null:Number(draft.rpe.replace(',','.'))
    const distance=draft.distance===''?null:Number(draft.distance.replace(',','.'))
    if(duration==null||!Number.isInteger(duration)||duration<1||duration>600){
      showAppToast('Укажи длительность кардио от 1 до 600 минут.','warning')
      return
    }
    if(hr!=null&&(!Number.isInteger(hr)||hr<30||hr>250)){
      showAppToast('Средний пульс должен быть от 30 до 250 уд/мин.','warning')
      return
    }
    if(rpe!=null&&(!Number.isFinite(rpe)||rpe<1||rpe>10)){
      showAppToast('RPE должен быть от 1 до 10.','warning')
      return
    }
    if(distance!=null&&(!Number.isFinite(distance)||distance<0)){
      showAppToast('Дистанция не может быть отрицательной.','warning')
      return
    }

    setBusy(true);setNotice('')
    try {
      let completedAt=new Date().toISOString()
      if (!preview) completedAt=await completeCardioEntry(id,{
        actual_duration_minutes:duration,
        actual_hr_avg:hr,
        actual_rpe:rpe,
        actual_distance_km:distance,
        client_notes:null,
      })
      setWorkout(current=>current?{...current,cardio:current.cardio.map(item=>item.id===id?{...item,completed_at:completedAt}:item)}:current)
      clearCardioRecovery(id)
    } catch (error) {
      if(!preview&&workout){
        try{
          const serverWorkout=await loadWorkout(workout.id)
          const serverCardio=serverWorkout.cardio.find(item=>item.id===id)
          if(serverCardio?.completed_at){
            setWorkout(serverWorkout)
            setInProgressWorkout(serverWorkout.status==='in_progress'?serverWorkout:null)
            if(sameCardioResult(serverCardio,{duration,hr,rpe,distance})){
              clearCardioRecovery(id)
              showAppToast('Кардио уже было сохранено на сервере.','info')
              return
            }
            showAppToast('Кардио уже сохранено с другими значениями на другом устройстве. Твои введённые значения оставлены на экране; нажми «Изменить результат», если хочешь заменить серверные данные.','warning')
            return
          }
        }catch{}
      }
      showAppToast(error instanceof Error ? error.message : 'Не удалось сохранить кардио','error')
    } finally {setBusy(false)}
  }

  async function resumeSet(exercise:LiveWorkoutExercise,setNumber:number) {
    if(!workout||workout.status!=='in_progress'||exercise.completed_at)return
    const key=`${exercise.id}:${setNumber}`
    const current=setDrafts[key]??{...defaultDraft(exercise,setNumber),isWarmup:setNumber===0}
    setBusy(true);setNotice('')
    try{
      if(!preview)await reopenWorkoutSet(exercise.id,setNumber)
      patchSet(exercise.id,setNumber,{completed:false,completedAt:null,isWarmup:setNumber===0||current.isWarmup})
      setLoadSuggestion(null)
      showAppToast('Подход открыт для исправления. После правки нажми галочку снова.','info')
    }catch(error){
      if(!preview&&workout){
        try{
          const serverWorkout=await loadWorkout(workout.id)
          const serverExercise=serverWorkout.exercises.find(item=>item.id===exercise.id)
          const serverSet=serverExercise?.sets.find(set=>set.set_number===setNumber)
          if(serverSet&&serverSet.completed_at==null){
            setWorkout(serverWorkout)
            patchSet(exercise.id,setNumber,{
              weight:serverSet.weight_kg==null?'':String(serverSet.weight_kg),
              reps:serverSet.reps==null?'':String(serverSet.reps),
              rir:serverSet.rir,
              completed:false,completedAt:null,isWarmup:serverSet.is_warmup,
            })
            showAppToast('Подход уже открыт для исправления на сервере.','info')
            return
          }
        }catch{}
      }
      showAppToast(error instanceof Error?error.message:'Не удалось открыть подход для исправления','error')
    }finally{setBusy(false)}
  }

  async function resumeCardio(id:string) {
    if(!workout||workout.status!=='in_progress')return
    setBusy(true);setNotice('')
    try{
      if(!preview)await reopenWorkoutCardio(id)
      setWorkout(current=>current?{...current,cardio:current.cardio.map(item=>item.id===id?{...item,completed_at:null}:item)}:current)
      showAppToast('Кардио открыто для исправления.','info')
    }catch(error){
      if(!preview&&workout){
        try{
          const serverWorkout=await loadWorkout(workout.id)
          const serverCardio=serverWorkout.cardio.find(item=>item.id===id)
          if(serverCardio&&serverCardio.completed_at==null){
            setWorkout(serverWorkout)
            showAppToast('Кардио уже открыто для исправления на сервере.','info')
            return
          }
        }catch{}
      }
      showAppToast(error instanceof Error?error.message:'Не удалось открыть кардио для исправления','error')
    }finally{setBusy(false)}
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
      if(!preview&&workout){
        try{
          const serverWorkout=await loadWorkout(workout.id)
          const serverExercise=serverWorkout.exercises.find(item=>item.id===exercise.id)
          if(serverExercise&&serverExercise.completed_at==null){
            setWorkout(serverWorkout)
            setInProgressWorkout(serverWorkout.status==='in_progress'?serverWorkout:null)
            setRecentCompletedWorkout(null)
            showAppToast('Упражнение уже было возобновлено на сервере.','info')
            return
          }
        }catch{}
      }
      showAppToast(error instanceof Error ? error.message : 'Не удалось возобновить упражнение','error')
    } finally {setBusy(false)}
  }

  function applyCompletedWorkout(item:LiveWorkout,message:string){
    setWorkout(item)
    setInProgressWorkout(null)
    setRecentCompletedWorkout(item)
    if(!preview)void loadWorkoutHistory(90).then(setWorkoutHistory).catch(()=>{})
    setTimerEnd(null)
    setFinishComment('')
    if(recoveryPersistenceEnabled)clearWorkoutRecovery(item.id)
    showAppToast(message)
  }

  async function cancelEmptyWorkout(){
    if(!workout||busy)return
    setBusy(true);setNotice('')
    try{
      if(!preview)await abandonEmptyWorkout(workout.id)
      if(recoveryPersistenceEnabled)clearWorkoutRecovery(workout.id)
      setCancelWorkoutConfirmation(false)
      setWorkout(null)
      setInProgressWorkout(null)
      setActiveExerciseId(null)
      navigate('/workouts',{replace:true})
      showAppToast('Тренировка отменена. Никакие результаты не сохранены.','info')
    }catch(error){
      setNotice(errorMessage(error,'Не удалось отменить тренировку.'))
      setCancelWorkoutConfirmation(false)
    }finally{setBusy(false)}
  }

  async function finishWorkout(confirmed=false) {
    if (!workout) return

    const completion=summarizeWorkoutCompletion(
      workout.exercises.map(exercise=>({
        id:exercise.id,
        prescribedSets:exercise.prescribed_sets,
        continuedFromWorkoutExerciseId:exercise.continued_from_workout_exercise_id??null,
      })),
      Object.fromEntries(workout.exercises.map(exercise=>[
        exercise.id,
        Array.from({length:exercise.prescribed_sets},(_,index)=>index+1)
          .filter(setNumber=>(setDrafts[`${exercise.id}:${setNumber}`]??defaultDraft(exercise,setNumber)).completed),
      ])),
      workout.cardio.map(item=>Boolean(item.completed_at)),
    )
    const unfinished:string[]=[]
    if(completion.incompletePlannedSetCount>0)unfinished.push(`${completion.incompletePlannedSetCount} плановых сетов`)
    if(completion.incompleteCardioCount>0)unfinished.push(`${completion.incompleteCardioCount} ${completion.incompleteCardioCount===1?'блок кардио':'блока кардио'}`)
    const confirmation=unfinished.length
      ? `Не завершено: ${unfinished.join(' и ')}. Всё равно завершить тренировку?`
      : 'Все запланированные элементы сохранены. Точно завершить тренировку?'

    if(!confirmed) {
      setFinishConfirmation(confirmation)
      return
    }

    const completionSets=workout.exercises.flatMap(exercise=>{
      const rows:{
        workout_exercise_id:string
        set_number:number
        weight_kg:number|null
        reps:number|null
        rir:number|null
        is_warmup:boolean
        completed_at:string
      }[]=[]
      const add=(setNumber:number,draft:SetDraft)=>{
        if(!draft.completed||!draft.completedAt)return
        const reps=draft.reps.trim()===''?null:Number(draft.reps)
        rows.push({
          workout_exercise_id:exercise.id,
          set_number:setNumber,
          weight_kg:parseDecimal(draft.weight),
          reps:Number.isFinite(reps)?reps:null,
          rir:setNumber===0?null:(exercise.rir_enabled?draft.rir:null),
          is_warmup:setNumber===0||draft.isWarmup,
          completed_at:draft.completedAt,
        })
      }
      if(exercise.warmup_enabled)add(0,setDrafts[`${exercise.id}:0`]??{...defaultDraft(exercise,0),isWarmup:true})
      const total=exercise.prescribed_sets+(extraSets[exercise.id]??0)
      for(let setNumber=1;setNumber<=total;setNumber++){
        add(setNumber,setDrafts[`${exercise.id}:${setNumber}`]??defaultDraft(exercise,setNumber))
      }
      return rows
    })

    setFinishConfirmation(null)
    setBusy(true);setNotice('')
    try {
      if (!preview) {
        finalizedWorkoutRef.current=workout.id
        await completeWorkout(workout.id,finishComment,completionSets)
        completionSets.forEach(set=>clearLocalSetDraft(set.workout_exercise_id,set.set_number))
        clearWorkoutRecovery(workout.id)
      }
      const completedWorkout={...workout,status:'completed' as const,comment:finishComment.trim()||null}
      applyCompletedWorkout(
        completedWorkout,
        finishComment.trim()?'Тренировка завершена. Комментарий отправлен тренеру.':'Тренировка завершена и сохранена.'
      )
    } catch (error) {
      if(!preview){
        try{
          const serverWorkout=await loadWorkout(workout.id)
          if(serverWorkout.status==='completed'){
            finalizedWorkoutRef.current=workout.id
            applyCompletedWorkout(serverWorkout,'Тренировка уже сохранена на сервере.')
            return
          }
        }catch{}
      }
      finalizedWorkoutRef.current=null
      showAppToast(error instanceof Error ? error.message : 'Не удалось завершить тренировку','error')
    } finally {setBusy(false)}
  }

  const today=new Date()
  const todayKey=appDateKey(today)
  const todayIso=appIsoWeekday(todayKey)
  const todayScheduled=Boolean(workoutSchedule?.enabled&&workoutSchedule.weekdays.includes(todayIso))
  const todaySession=todayScheduled?sessionForWeekday(todayIso):null
  const appTimeZone=getAppTimeZone()
  const recentCompletedWorkoutIsToday=Boolean(recentCompletedWorkout&&workoutStartedOnLocalDate(recentCompletedWorkout.started_at,todayKey,appTimeZone))
  const todayCompletedSessionIds=useMemo(()=>{
    const ids=new Set(
      workoutHistory
        .filter(item=>appDateKey(new Date(item.started_at))===todayKey && item.training_day_id)
        .map(item=>item.training_day_id as string)
    )
    if(recentCompletedWorkoutIsToday&&recentCompletedWorkout?.training_day_id)ids.add(recentCompletedWorkout.training_day_id)
    return ids
  },[workoutHistory,todayKey,recentCompletedWorkoutIsToday,recentCompletedWorkout?.training_day_id])
  const todayScheduledCompleted=Boolean(todaySession&&todayCompletedSessionIds.has(todaySession.id))
  const todayScheduledCompletedWorkoutId=todaySession
    ?workoutHistory.find(item=>appDateKey(new Date(item.started_at))===todayKey&&item.training_day_id===todaySession.id)?.id
      ??(recentCompletedWorkoutIsToday&&recentCompletedWorkout?.training_day_id===todaySession.id?recentCompletedWorkout.id:null)
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
      {!inProgressWorkout&&<section className="workout-hero">
        <div>
          <span className="eyebrow light">Тренировки</span>
          <h2>{plan?.name ?? (planLoaded?'Программа пока не назначена':'Программа временно недоступна')}</h2>
          <p>{plan?.description ?? (planLoaded?'Когда тренер опубликует программу, она появится здесь.':'Не удалось проверить активную программу.')}</p>
        </div>
        {plan?.weekly_frequency && <div className="hero-score"><strong>{plan.weekly_frequency}</strong><span>сессии в неделю</span></div>}
      </section>}

      {loadIssue&&<UiLoadError className="workout-page-notice" message={loadIssue} hint="Уже загруженные данные и сохранённые тренировки останутся на месте." onRetry={()=>setReloadKey(value=>value+1)} retryLabel="Повторить загрузку"/>}
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

      {todayScheduled&&!inProgressWorkout&&<section className={'today-workout-card '+(todayScheduledCompleted?'is-done':'')}>
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
        {recentCompletedWorkoutIsToday
          ? <button className="ghost-button small" disabled={busy} onClick={()=>void continueCompletedWorkout()}><RefreshCcw size={15}/>Возобновить</button>
          : <button className="ghost-button small" disabled={busy} onClick={()=>openPastWorkout(recentCompletedWorkout.id)}><CheckCircle2 size={15}/>Открыть результат</button>}
      </section>}

      {plan?.sessions?.length ? <div className="workout-session-grid">
        {plan.sessions.filter(session=>!inProgressWorkout||session.id!==inProgressWorkout.training_day_id).map(session=>{
          const sessionDoneToday=todayCompletedSessionIds.has(session.id)
          const completedWorkoutToday=workoutHistory.find(item=>appDateKey(new Date(item.started_at))===todayKey&&item.training_day_id===session.id)
          const completedWorkoutTodayId=completedWorkoutToday?.id??(recentCompletedWorkoutIsToday&&recentCompletedWorkout?.training_day_id===session.id?recentCompletedWorkout.id:null)
          return <article className={`workout-session-card ${sessionDoneToday?'is-completed-today':''}`} key={session.id}>
          <div className={`workout-session-icon ${session.session_type}`}>{session.session_type==='cardio'?<Activity size={20}/>:<Dumbbell size={20}/>}</div>
          <div>
            <span className="eyebrow">{session.session_type==='strength'?'Силовая':session.session_type==='cardio'?'Кардио':'Смешанная'}</span>
            <h3>{session.name}</h3>
            <p>{sessionDoneToday?'Эта тренировка сегодня уже выполнена':session.planned_duration_minutes ? `≈ ${session.planned_duration_minutes} мин` : 'Без жёсткого лимита по времени'}</p>
          </div>
          <div className="workout-session-actions">
            {sessionDoneToday&&<span className="workout-done-today"><CheckCircle2 size={16}/>Выполнено сегодня</span>}
            {!sessionDoneToday&&!inProgressWorkout&&<button className="primary-button compact" disabled={busy} onClick={()=>void begin(session.id)}><Play size={15}/>Начать тренировку</button>}
            {!sessionDoneToday&&inProgressWorkout?.training_day_id===session.id&&<span className="workout-active-session"><Play size={15}/>Сейчас выполняется</span>}
            {!sessionDoneToday&&inProgressWorkout&&inProgressWorkout.training_day_id!==session.id&&<span className="workout-active-session is-muted">Доступно после текущей</span>}
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
        <div className="workout-history-list">{workoutHistory.slice(0,historyExpanded?20:3).map(item=>{const start=new Date(item.started_at),durationStart=item.reopened_at?new Date(item.reopened_at):start,end=item.completed_at?new Date(item.completed_at):null;const mins=end?Math.max(1,Math.round((end.getTime()-durationStart.getTime())/60000)):null;const duration=mins?(item.reopened_at?` · ${mins} мин после возобновления`:` · ${mins} мин`):'';return <button key={item.id} onClick={()=>openPastWorkout(item.id)}><div className={'workout-history-icon '+item.session_type}>{item.session_type==='cardio'?<Activity size={17}/>:<Dumbbell size={17}/>}</div><div><strong>{item.name}</strong><span>{start.toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'})}{duration}</span></div><ChevronRight size={17}/></button>})}</div></>}
      </section>}
    </UiStack>
  }

  const activeExercise=activeExerciseId ? workout.exercises.find(exercise=>exercise.id===activeExerciseId) ?? null : null
  const activeTotalSets=activeExercise ? activeExercise.prescribed_sets+(extraSets[activeExercise.id] ?? 0) : 0
  const activeDrafts=activeExercise
    ? Array.from({length:activeTotalSets},(_,i)=>setDrafts[`${activeExercise.id}:${i+1}`] ?? defaultDraft(activeExercise,i+1))
    : []
  const activeCompletedCount=activeDrafts.filter(d=>d.completed).length
  const activePrescribedCompletedCount=activeDrafts.slice(0,activeExercise?.prescribed_sets??0).filter(d=>d.completed).length
  const activeWarmupDraft=activeExercise?.warmup_enabled
    ? setDrafts[`${activeExercise.id}:0`] ?? {...defaultDraft(activeExercise,0),isWarmup:true}
    : null
  const activeWarmupCompleted=Boolean(activeWarmupDraft?.completed)
  const activeHasSavedResult=Boolean(activeExercise?.completed_at)||activeCompletedCount>0||activeWarmupCompleted||Boolean(activeExercise?.sets.some(set=>set.completed_at))
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
  const continuationSourceIdsForProgress=new Set(
    workout.exercises
      .map(exercise=>exercise.continued_from_workout_exercise_id)
      .filter((id):id is string=>Boolean(id))
  )
  const logicalExercises=workout.exercises.filter(exercise=>!continuationSourceIdsForProgress.has(exercise.id))
  const completedExerciseCount=logicalExercises.filter(exercise=>Boolean(exercise.completed_at)).length
  const activeSupersetPartner=activeExercise
    ? findSupersetPartner(workout.exercises,activeExercise)
    : null
  const activeSuperset=activeExercise?.superset_group!=null
  const activeContinuationSource=activeExercise?.continued_from_workout_exercise_id
    ? workout.exercises.find(item=>item.id===activeExercise.continued_from_workout_exercise_id)??null
    : null
  const continuationSavedSetCount=activeContinuationSource?.sets.filter(set=>!set.is_warmup&&Boolean(set.completed_at)).length??0
  const continuationSetWord=continuationSavedSetCount%10===1&&continuationSavedSetCount%100!==11
    ? 'подход'
    : continuationSavedSetCount%10>=2&&continuationSavedSetCount%10<=4&&(continuationSavedSetCount%100<10||continuationSavedSetCount%100>=20)
      ? 'подхода'
      : 'подходов'
  const continuationRemainingSetWord=activeExercise
    ? activeExercise.prescribed_sets===1?'подход':activeExercise.prescribed_sets>=2&&activeExercise.prescribed_sets<=4?'подхода':'подходов'
    : 'подходов'

  return <UiStack className="live-workout-page">
    {!activeExercise ? <section className="live-workout-hero">
      <button className="live-workout-back" onClick={closeWorkout} aria-label="Назад к тренировкам"><ArrowLeft size={20}/></button>
      <div>
        <span className="eyebrow light">{workout.program_name}</span>
        <h2>{workout.session_name}</h2>
        <p>{workout.status==='completed'
          ? 'Готово. Результаты сохранены.'
          : <><span className="workout-live-status"><span className="workout-live-dot"/>Идёт · {workoutElapsedLabel}</span> · {completedExerciseCount}/{logicalExercises.length} упражнений · {completedSetCount} сетов</>}</p>
      </div>
      {workout.status==='in_progress'
        ? <div className="live-workout-hero-actions">
            {canCancelCurrentWorkout&&<button className="white-button subtle" disabled={busy} onClick={()=>setCancelWorkoutConfirmation(true)}><X size={16}/>Отменить</button>}
            <button className="white-button" disabled={busy} onClick={()=>{setFinishConfirmation(null);void finishWorkout()}}><Check size={16}/>Завершить тренировку</button>
          </div>
        : <span className="exercise-done-badge"><Check size={14}/>История зафиксирована</span>}
    </section> : <section className="exercise-detail-hero">
      <button className="exercise-detail-back" onClick={closeExercise} aria-label="Назад к упражнениям"><ArrowLeft size={20}/></button>
      <div className="exercise-detail-heading">
        <span className="eyebrow">{workout.session_name}</span>
        <div className="exercise-detail-title-row">
          <h2>{activeExercise.name}</h2>
          <button type="button" className="exercise-title-info" aria-label="Техника и информация об упражнении" title="Техника и информация" onClick={()=>setSheet({type:'technique',exercise:activeExercise})}><Info size={19}/></button>
        </div>
        <ExerciseMuscleChips exercise={activeExercise}/>
        <p className="exercise-progress-status">{workout.status==='completed'
          ? <>Тренировка завершена · {activeCompletedCount}/{activeTotalSets} сетов сохранено</>
          : <><span className="workout-live-status"><span className="workout-live-dot"/>Идёт</span><span>{activeCompletedCount}/{activeTotalSets} сетов сохранено</span></>}</p>
      </div>
      {activeExercise.completed_at && <span className="exercise-done-badge"><Check size={14}/>Готово</span>}
    </section>}

    {activeExercise&&activeContinuationSource&&<div className="drawer-notice workout-switch-notice">
      <Repeat2 size={17}/>
      <div>
        <strong>Продолжение после «{activeContinuationSource.name}»</strong>
        <span>{continuationSavedSetCount} {continuationSetWord} сохранено в истории. Здесь осталось выполнить {activeExercise.prescribed_sets} {continuationRemainingSetWord}.</span>
      </div>
    </div>}

    {activeExercise&&activeSupersetPartner&&activeSuperset&&<div className="superset-manual-hint">
      <Repeat2 size={17}/>
      <div>
        <strong>Суперсет · упражнение {activeExercise.superset_position} из 2</strong>
        <span>{activeExercise.superset_position===1
          ? `После этого упражнения сразу переходи к «${activeSupersetPartner.name}». Отдых — после пары.`
          : activeExercise.prescribed_sets===activeSupersetPartner.prescribed_sets
            ? `Это второе упражнение пары. После него отдохни и начни следующий круг с «${activeSupersetPartner.name}».`
            : `После него отдохни. Общие круги выполняй парой, а оставшиеся подходы упражнения с большим количеством сетов — отдельно.`}</span>
      </div>
    </div>}

    {notice && <div className="drawer-notice">{notice}</div>}

    {workout.status==='completed'&&!activeExercise&&workoutStartedOnLocalDate(workout.started_at,todayKey,appTimeZone)&&<section className="recent-completed-workout workout-resume-card">
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
          return <button className={`workout-exercise-summary ${isInProgress?'is-in-progress':''} ${exercise.superset_group!=null?'is-superset':''} ${exercise.superset_position===1?'is-superset-first':exercise.superset_position===2?'is-superset-second':''}`} key={exercise.id} onClick={()=>openExercise(exercise.id)}>
            <div className="workout-exercise-summary-number">{index+1}</div>
            {exercise.image_url
              ? <img className="workout-exercise-summary-image" src={exercise.image_url} alt="" loading="lazy"/>
              : <div className="workout-exercise-summary-image placeholder"><Dumbbell size={20}/></div>}
            <div className="workout-exercise-summary-copy">
              <strong>{exercise.name}</strong>
              {exercise.superset_group!=null&&exercise.superset_position===1&&<span className="workout-superset-tag"><Repeat2 size={12}/>Суперсет</span>}
              {exercise.superset_group!=null&&exercise.superset_position===2&&<span className="workout-superset-member-note">вторая часть связки</span>}
              {exercise.entry_origin==='client_ad_hoc'&&<small className="client-added-badge">Добавлено вами</small>}
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
            {workout.exercises.filter(exercise=>Boolean(exercise.completed_at)).map(exercise=><button className={`workout-exercise-summary is-completed ${exercise.superset_group!=null?'is-superset':''} ${exercise.superset_position===1?'is-superset-first':exercise.superset_position===2?'is-superset-second':''}`} key={exercise.id} onClick={()=>openExercise(exercise.id)}>
              <div className="workout-exercise-summary-number"><Check size={16}/></div>
              {exercise.image_url
                ? <img className="workout-exercise-summary-image" src={exercise.image_url} alt="" loading="lazy"/>
                : <div className="workout-exercise-summary-image placeholder"><Dumbbell size={20}/></div>}
              <div className="workout-exercise-summary-copy">
                <strong>{exercise.name}</strong>
                {exercise.superset_group!=null&&exercise.superset_position===1&&<span className="workout-superset-tag"><Repeat2 size={12}/>Суперсет</span>}
                {exercise.superset_group!=null&&exercise.superset_position===2&&<span className="workout-superset-member-note">вторая часть связки</span>}
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
          return <article className={`live-exercise-card live-cardio-card ${cardio.entry_origin==='client_ad_hoc'?'is-ad-hoc':''}`} key={cardio.id}>
            <div className="live-exercise-head">
              <div className="exercise-number cardio"><Activity size={17}/></div>
              <div className="live-exercise-title"><span className="eyebrow">{cardio.entry_origin==='client_ad_hoc'?'Добавлено вами':'Кардио'}</span><h3>{cardio.name || cardio.modality_name}</h3></div>
            </div>
            <div className="cardio-prescription-line">
              {cardio.prescribed_duration_minutes && <span><Clock3 size={14}/>{cardio.prescribed_duration_minutes} мин</span>}
              {cardio.prescribed_hr_min && <span>Пульс {cardio.prescribed_hr_min}{cardio.prescribed_hr_max!=null&&cardio.prescribed_hr_max!==cardio.prescribed_hr_min?'–'+cardio.prescribed_hr_max:''}</span>}
              {cardio.prescribed_rpe_min!=null && <span>RPE {cardio.prescribed_rpe_min}{cardio.prescribed_rpe_max!=null&&cardio.prescribed_rpe_max!==cardio.prescribed_rpe_min?'–'+cardio.prescribed_rpe_max:''}</span>}
              {cardio.prescribed_distance_km!=null && <span>{cardio.prescribed_distance_km} км</span>}
              {cardio.prescribed_speed_kmh!=null && <span>{cardio.prescribed_speed_kmh} км/ч</span>}
              {cardio.prescribed_incline_percent!=null && <span>Наклон {cardio.prescribed_incline_percent}%</span>}
            </div>
            {cardio.trainer_notes && <CoachHint storageKey={'cardio:'+cardio.id} text={cardio.trainer_notes}/>}
            <div className="cardio-result-grid">
              <label><span>Минуты</span><input disabled={Boolean(cardio.completed_at)||workout.status!=='in_progress'} inputMode="numeric" value={draft.duration} onChange={e=>patchCardioDraft(cardio.id,{duration:e.target.value.replace(/\D/g,'')})}/></label>
              <label><span>Средний пульс</span><input disabled={Boolean(cardio.completed_at)||workout.status!=='in_progress'} inputMode="numeric" value={draft.hr} onChange={e=>patchCardioDraft(cardio.id,{hr:e.target.value.replace(/\D/g,'')})}/></label>
              <label><span>RPE</span><input disabled={Boolean(cardio.completed_at)||workout.status!=='in_progress'} inputMode="decimal" value={draft.rpe} onChange={e=>patchCardioDraft(cardio.id,{rpe:normalizeDecimalInput(e.target.value)})}/></label>
              <label><span>Км</span><input disabled={Boolean(cardio.completed_at)||workout.status!=='in_progress'} inputMode="decimal" value={draft.distance} onChange={e=>patchCardioDraft(cardio.id,{distance:normalizeDecimalInput(e.target.value)})}/></label>
            </div>
            {workout.status==='in_progress' && <button className={`primary-button compact cardio-complete ${cardio.completed_at?'is-completed':''}`} disabled={busy} onClick={()=>void (cardio.completed_at?resumeCardio(cardio.id):finishCardio(cardio.id))}>{cardio.completed_at?<><Pencil size={15}/>Изменить результат</>:<><Check size={15}/>Завершить кардио</>}</button>}
            {workout.status==='in_progress'&&cardio.entry_origin==='client_ad_hoc'&&!cardio.completed_at&&<button type="button" className="text-button danger-text-button cardio-remove" disabled={busy} onClick={()=>setRemoveCardioConfirmation(cardio)}><Trash2 size={15}/>Удалить добавленное кардио</button>}
          </article>
        })}
      </div>}
      {workout.status==='in_progress'&&<div className="workout-add-blocks">
        <button type="button" className="ghost-button workout-add-exercise" disabled={busy} onClick={()=>void openAddCustomExercise()}><Plus size={16}/>Добавить своё упражнение</button>
        <button type="button" className="ghost-button workout-add-cardio" disabled={busy} onClick={()=>void openAddCardio()}><Plus size={16}/>Добавить кардио</button>
      </div>}
    </> : <article className="exercise-focus-card">
      <div className="exercise-focus-intro">
        {activeExercise.image_url
          ? <img className="exercise-focus-image" src={activeExercise.image_url} alt="" loading="lazy"/>
          : <div className="exercise-focus-image placeholder"><Dumbbell size={26}/></div>}
        <div>
          <div className="exercise-focus-strategy">
            <strong>{activeExercise.prescribed_sets} × {activeExercise.reps_min ?? '—'}–{activeExercise.reps_max ?? '—'}</strong>
            {activeExercise.entry_origin==='client_ad_hoc'&&<span>Добавлено вами · только эта тренировка</span>}
          </div>
          {activeLastCompletedAt && !activeExercise.completed_at && <div className="exercise-last-set-timer"><TimerReset size={13}/>После последнего сета: <strong>{elapsedLabel(activeLastCompletedAt,now)}</strong></div>}
        </div>
      </div>


      {activeExercise.trainer_notes && <CoachHint storageKey={'workout:'+activeExercise.exercise_id} text={activeExercise.trainer_notes}/>}
      {activeExercise.entry_origin==='client_ad_hoc'&&activeExercise.client_notes&&<div className="drawer-notice neutral"><Info size={16}/><span>{activeExercise.client_notes}</span></div>}
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
        <div className={`live-set-row header ${activeExercise.rir_enabled?'':'no-rir'} ${activeExercise.tracking_type==='reps_only'?'reps-only':''}`}><span>Сет</span>{activeExercise.tracking_type!=='reps_only'&&<span>Вес</span>}<span>Повторы</span>{activeExercise.rir_enabled&&<span>RIR</span>}<span/></div>
        {activeExercise.warmup_enabled && activeExercise.tracking_type!=='reps_only' && activeWarmupDraft && <div className={`live-set-row warmup-set-row ${activeExercise.rir_enabled?'':'no-rir'} ${activeWarmupDraft.completed?'is-completed':''}`}>
          <div className="set-number-cell warmup-label"><strong>Разм.</strong>{!activeExercise.rir_enabled&&<button type="button" className="warmup-inline-info" aria-label="Как делать разминку" onClick={()=>setSheet({type:'warmup',exercise:activeExercise})}><Info size={15}/></button>}</div>
          <div>
            <input
              disabled={workout.status!=='in_progress'||Boolean(activeExercise.completed_at)||activeWarmupDraft.completed}
              inputMode="decimal"
              value={activeWarmupDraft.weight}
              onChange={e=>patchSet(activeExercise.id,0,{weight:normalizeDecimalInput(e.target.value),isWarmup:true})}
              placeholder={warmupSuggestedWeight==null?'—':String(warmupSuggestedWeight).replace('.',',')}
            />
            {warmupMinWeight!=null&&warmupMaxWeight!=null&&<small>≈ {warmupMinWeight}–{warmupMaxWeight} кг</small>}
          </div>
          <input
            disabled={workout.status!=='in_progress'||Boolean(activeExercise.completed_at)||activeWarmupDraft.completed}
            inputMode="numeric"
            value={activeWarmupDraft.reps}
            onChange={e=>patchSet(activeExercise.id,0,{reps:e.target.value.replace(/\D/g,''),isWarmup:true})}
            placeholder={String(Math.round((activeExercise.warmup_reps_min+activeExercise.warmup_reps_max)/2))}
          />
          {activeExercise.rir_enabled&&<button type="button" className="warmup-rir-info" aria-label="Почему RIR не нужен в разминке" onClick={()=>setSheet({type:'warmup',exercise:activeExercise})}><Info size={16}/></button>}
          <button
            className={`set-complete-button ${activeWarmupDraft.completed?'is-done is-editable':''}`}
            aria-label={activeWarmupDraft.completed?'Изменить разминку':'Сохранить разминку'}
            title={activeWarmupDraft.completed?'Изменить сохранённый подход':undefined}
            disabled={busy||workout.status!=='in_progress'||Boolean(activeExercise.completed_at)}
            onClick={()=>void (activeWarmupDraft.completed?resumeSet(activeExercise,0):finishSet(activeExercise,0))}
          >{activeWarmupDraft.completed?<Pencil size={15}/>:<Check size={17}/>}</button>
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
          return <div className={`live-set-row ${activeExercise.rir_enabled?'':'no-rir'} ${activeExercise.tracking_type==='reps_only'?'reps-only':''} ${row.completed?'is-completed':''}`} key={setNumber}>
            <div className="set-number-cell"><strong>{setNumber}</strong>{row.isWarmup&&<small>разм.</small>}</div>
            {activeExercise.tracking_type!=='reps_only'&&<div>
              <input
                disabled={locked}
                inputMode="decimal"
                value={row.weight}
                onChange={e=>patchSet(activeExercise.id,setNumber,{weight:normalizeDecimalInput(e.target.value)})}
                placeholder={previousWeight}
              />
              {e1rm!=null&&<small>1ПМ ≈ {e1rm.toFixed(1)}</small>}
            </div>}
            <input
              disabled={locked}
              inputMode="numeric"
              value={row.reps}
              onChange={e=>patchSet(activeExercise.id,setNumber,{reps:e.target.value.replace(/\D/g,'')})}
              placeholder={previousReps}
            />
            {activeExercise.rir_enabled&&<select
              className="rir-select"
              disabled={locked}
              value={row.rir??''}
              onChange={e=>{
                const next={...row,rir:e.target.value===''?null:Number(e.target.value)}
                patchSet(activeExercise.id,setNumber,{rir:next.rir})
              }}
              aria-label={`RIR, сет ${setNumber}`}
            >
              <option value="">—</option><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option>
            </select>}
            <button
              className={`set-complete-button ${row.completed?'is-done is-editable':''}`}
              aria-label={row.completed?`Изменить сет ${setNumber}`:`Сохранить сет ${setNumber}`}
              title={row.completed?'Изменить сохранённый подход':undefined}
              disabled={busy||workout.status!=='in_progress'||Boolean(activeExercise.completed_at)}
              onClick={()=>void (row.completed?resumeSet(activeExercise,setNumber):finishSet(activeExercise,setNumber))}
            >{row.completed?<Pencil size={15}/>:<Check size={17}/>}</button>
          </div>
        })}
      </div>

      {workout.status==='in_progress' && !activeExercise.completed_at && <div className="exercise-focus-actions">
        <div className="exercise-focus-secondary-actions">
          <button className="text-button" onClick={()=>setExtraSetCount(activeExercise.id,(extraSets[activeExercise.id]??0)+1)}><Plus size={15}/>Добавить сет</button>
          {(extraSets[activeExercise.id]??0)>0 && <button className="text-button danger-text-button" disabled={busy} onClick={()=>void removeLastExtraSet(activeExercise)}><Minus size={15}/>Удалить последний</button>}
          <button className="text-button" onClick={()=>void openExerciseHistory(activeExercise)}><TrendingUp size={15}/>Прогресс</button>
          {activeExercise.allow_substitution&&activeExercise.substitution_options.length>0&&<button className="text-button" disabled={activeHasSavedResult&&activePrescribedCompletedCount>=activeExercise.prescribed_sets} title={activeHasSavedResult?'Выполненные подходы сохранятся; новое упражнение получит оставшиеся подходы.':undefined} onClick={()=>{setReplacementChoice(null);setSheet({type:'replace',exercise:activeExercise})}}><Repeat2 size={15}/>{activeHasSavedResult?'Сменить упражнение':'Заменить'}</button>}
          <button className="text-button" onClick={()=>void openComment(activeExercise)}><MessageCircle size={15}/>Комментарии</button>
          {activeExercise.entry_origin==='client_ad_hoc'&&!activeExercise.completed_at&&<button className="text-button danger-text-button" disabled={busy||activeExercise.sets.length>0} title={activeExercise.sets.length>0?'Сначала убери сохранённые подходы':undefined} onClick={()=>setRemoveExerciseConfirmation(activeExercise)}><Trash2 size={15}/>Убрать из тренировки</button>}
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

    {cancelWorkoutConfirmation&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target&&!busy)setCancelWorkoutConfirmation(false)}}>
      <aside className="exercise-drawer workout-sheet finish-workout-sheet">
        <div className="drawer-head">
          <div><span className="eyebrow">Тренировка</span><h3>Отменить тренировку?</h3></div>
          <button className="icon-button" disabled={busy} onClick={()=>setCancelWorkoutConfirmation(false)}><X size={18}/></button>
        </div>
        <div className="drawer-body">
          <div className="finish-workout-icon"><X size={24}/></div>
          <p className="sheet-description">Пока ни одного подхода или кардио-результата не сохранено, эту тренировку можно отменить без записи в результаты.</p>
          <div className="finish-workout-actions">
            <button className="ghost-button" disabled={busy} onClick={()=>setCancelWorkoutConfirmation(false)}>Продолжить тренировку</button>
            <button className="primary-button" disabled={busy} onClick={()=>void cancelEmptyWorkout()}><X size={16}/>{busy?'Отменяю…':'Отменить тренировку'}</button>
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



    {removeExerciseConfirmation && <div className="drawer-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target&&!busy)setRemoveExerciseConfirmation(null)}}>
      <aside className="exercise-drawer workout-sheet">
        <div className="drawer-head">
          <div><span className="eyebrow">Личное упражнение</span><h3>Убрать из тренировки?</h3></div>
          <button className="icon-button" disabled={busy} onClick={()=>setRemoveExerciseConfirmation(null)}><X size={18}/></button>
        </div>
        <div className="drawer-body">
          <p className="sheet-description">«{removeExerciseConfirmation.name}» исчезнет только из текущей тренировки. Само упражнение останется в вашем личном списке для повторного использования.</p>
          <p className="sheet-description">Сохранённые подходы удалить этим действием нельзя — это защита истории.</p>
          <div className="finish-workout-actions">
            <button className="ghost-button" disabled={busy} onClick={()=>setRemoveExerciseConfirmation(null)}>Оставить</button>
            <button className="primary-button" disabled={busy||removeExerciseConfirmation.sets.length>0} onClick={()=>void removeAdHocExercise(removeExerciseConfirmation)}><Trash2 size={16}/>{busy?'Убираю…':'Убрать'}</button>
          </div>
        </div>
      </aside>
    </div>}

    {customExerciseOpen && <div className="drawer-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)closeAddCustomExercise()}}>
      <aside className="exercise-drawer workout-sheet add-custom-exercise-sheet">
        <div className="drawer-head">
          <div><span className="eyebrow">Личный блок</span><h3>Добавить своё упражнение</h3></div>
          <button className="icon-button" disabled={busy} onClick={closeAddCustomExercise}><X size={18}/></button>
        </div>
        <div className="drawer-body">
          <div className="drawer-notice neutral"><Info size={16}/><span>Упражнение будет личным: оно не попадёт в общую библиотеку. В текущей тренировке тренер увидит его и результаты.</span></div>
          {customExerciseLoading
            ? <div className="library-empty">Загружаю личные упражнения…</div>
            : <>
                <label className="field-label"><span>Что добавить</span>
                  <select value={customExerciseDraft.exerciseId} disabled={busy} onChange={e=>selectPersonalExercise(e.target.value)}>
                    <option value="">Новое упражнение</option>
                    {personalExercises.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </label>
                {!customExerciseDraft.exerciseId&&<>
                  <label className="field-label"><span>Название</span><input value={customExerciseDraft.name} maxLength={120} disabled={busy} onChange={e=>setCustomExerciseDraft(current=>({...current,name:e.target.value}))} placeholder="Например: тяга резинки к поясу"/></label>
                  <div className="form-grid-2">
                    <label className="field-label"><span>Как считать</span>
                      <select value={customExerciseDraft.trackingType} disabled={busy} onChange={e=>setCustomExerciseDraft(current=>({...current,trackingType:e.target.value as 'weight_reps'|'reps_only'}))}>
                        <option value="weight_reps">Вес × повторы</option>
                        <option value="reps_only">Только повторы</option>
                      </select>
                    </label>
                    <label className="field-label"><span>Оборудование <small>необязательно</small></span>
                      <select value={customExerciseDraft.equipmentCode} disabled={busy} onChange={e=>setCustomExerciseDraft(current=>({...current,equipmentCode:e.target.value}))}>
                        <option value="">Не указывать</option>
                        {exerciseEquipment.map(item=><option value={item.code} key={item.code}>{item.name}</option>)}
                      </select>
                    </label>
                  </div>
                </>}
                {customExerciseDraft.exerciseId&&<div className="drawer-notice neutral"><Dumbbell size={16}/><span>{personalExercises.find(item=>item.id===customExerciseDraft.exerciseId)?.name} · {customExerciseDraft.trackingType==='reps_only'?'только повторы':'вес × повторы'}</span></div>}
                <label className="field-label"><span>Заметка <small>необязательно</small></span><textarea rows={3} maxLength={1000} value={customExerciseDraft.notes} disabled={busy} onChange={e=>setCustomExerciseDraft(current=>({...current,notes:e.target.value}))} placeholder="Например: использовать зелёную резинку, движение медленное"/></label>
                <div className="form-grid-2 custom-exercise-prescription">
                  <label className="field-label"><span>Подходы</span><input inputMode="numeric" value={customExerciseDraft.sets} disabled={busy} onChange={e=>setCustomExerciseDraft(current=>({...current,sets:e.target.value.replace(/\D/g,'')}))}/></label>
                  <label className="field-label"><span>Отдых, сек</span><input inputMode="numeric" value={customExerciseDraft.restSeconds} disabled={busy} onChange={e=>setCustomExerciseDraft(current=>({...current,restSeconds:e.target.value.replace(/\D/g,'')}))}/></label>
                  <label className="field-label"><span>Повторы от</span><input inputMode="numeric" value={customExerciseDraft.repsMin} disabled={busy} onChange={e=>setCustomExerciseDraft(current=>({...current,repsMin:e.target.value.replace(/\D/g,'')}))}/></label>
                  <label className="field-label"><span>Повторы до</span><input inputMode="numeric" value={customExerciseDraft.repsMax} disabled={busy} onChange={e=>setCustomExerciseDraft(current=>({...current,repsMax:e.target.value.replace(/\D/g,'')}))}/></label>
                  <label className="field-label"><span>RIR</span>
                    <select value={customExerciseDraft.rirEnabled?'on':'off'} disabled={busy} onChange={e=>setCustomExerciseDraft(current=>({...current,rirEnabled:e.target.value==='on'}))}>
                      <option value="on">Использовать</option><option value="off">Не использовать</option>
                    </select>
                  </label>
                  {customExerciseDraft.rirEnabled&&<label className="field-label"><span>Цель RIR</span>
                    <select value={customExerciseDraft.rirMin+'-'+customExerciseDraft.rirMax} disabled={busy} onChange={e=>{const [rirMin,rirMax]=e.target.value.split('-');setCustomExerciseDraft(current=>({...current,rirMin,rirMax}))}}>
                      <option value="0-1">0–1</option><option value="1-2">1–2</option><option value="2-3">2–3</option><option value="2-2">2</option><option value="3-3">3</option>
                    </select>
                  </label>}
                </div>
                <div className="drawer-notice neutral"><Info size={16}/><span>Режимы по времени и дистанции появятся позже: текущая таблица силовых подходов надёжно хранит только повторы и вес. Фото тоже не добавляем, пока для личных медиа не будет отдельной приватной модели.</span></div>
                {customExerciseIssue&&<div className="drawer-notice">{customExerciseIssue}</div>}
              </>}
        </div>
        <div className="drawer-footer">
          <button className="ghost-button" disabled={busy} onClick={closeAddCustomExercise}>Отмена</button>
          <button className="primary-button" disabled={busy||customExerciseLoading} onClick={()=>void submitAddCustomExercise()}><Plus size={16}/>{busy?'Добавляю…':'Добавить в тренировку'}</button>
        </div>
      </aside>
    </div>}

    {removeCardioConfirmation && <div className="drawer-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target&&!busy)setRemoveCardioConfirmation(null)}}>
      <aside className="exercise-drawer workout-sheet">
        <div className="drawer-head">
          <div><span className="eyebrow">Удаление</span><h3>Убрать кардио из тренировки?</h3></div>
          <button className="icon-button" disabled={busy} onClick={()=>setRemoveCardioConfirmation(null)}><X size={18}/></button>
        </div>
        <div className="drawer-body">
          <p className="sheet-description">«{removeCardioConfirmation.name||removeCardioConfirmation.modality_name}» добавлено вами только в эту тренировку. Незавершённый блок будет удалён, программа тренера не изменится.</p>
          <div className="finish-workout-actions">
            <button className="ghost-button" disabled={busy} onClick={()=>setRemoveCardioConfirmation(null)}>Оставить</button>
            <button className="primary-button" disabled={busy} onClick={()=>void removeAdHocCardio(removeCardioConfirmation)}><Trash2 size={16}/>{busy?'Удаляю…':'Удалить'}</button>
          </div>
        </div>
      </aside>
    </div>}

    {cardioAddOpen && <div className="drawer-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)closeAddCardio()}}>
      <aside className="exercise-drawer workout-sheet add-cardio-sheet">
        <div className="drawer-head">
          <div><span className="eyebrow">Одноразовый блок</span><h3>Добавить кардио</h3></div>
          <button className="icon-button" disabled={busy} onClick={closeAddCardio}><X size={18}/></button>
        </div>
        <div className="drawer-body">
          <div className="drawer-notice neutral"><Info size={16}/><span>Добавится только в текущую тренировку. Программа тренера и будущие тренировки не изменятся.</span></div>
          {cardioAddLoading
            ? <div className="library-empty">Загружаю виды кардио…</div>
            : <>
                <label className="field-label"><span>Вид кардио</span>
                  <select value={cardioAddDraft.modalityCode} disabled={busy||cardioModalities.length===0} onChange={e=>setCardioAddDraft(current=>({...current,modalityCode:e.target.value}))}>
                    {cardioModalities.map(item=><option value={item.code} key={item.code}>{item.name}</option>)}
                  </select>
                </label>
                <label className="field-label"><span>Название <small>необязательно</small></span><input value={cardioAddDraft.name} maxLength={120} disabled={busy} onChange={e=>setCardioAddDraft(current=>({...current,name:e.target.value}))} placeholder="Например: лёгкая дорожка"/></label>
                <label className="field-label"><span>Длительность, мин</span><input inputMode="numeric" value={cardioAddDraft.duration} disabled={busy} onChange={e=>setCardioAddDraft(current=>({...current,duration:e.target.value.replace(/\D/g,'')}))} placeholder="20"/></label>
                <div className="form-grid-2">
                  <label className="field-label"><span>Целевой пульс</span><input inputMode="numeric" value={cardioAddDraft.hr} disabled={busy} onChange={e=>setCardioAddDraft(current=>({...current,hr:e.target.value.replace(/\D/g,'')}))} placeholder="130"/></label>
                  <label className="field-label"><span>RPE</span><input inputMode="decimal" value={cardioAddDraft.rpe} disabled={busy} onChange={e=>setCardioAddDraft(current=>({...current,rpe:normalizeDecimalInput(e.target.value)}))} placeholder="6"/></label>
                  <label className="field-label"><span>Дистанция, км</span><input inputMode="decimal" value={cardioAddDraft.distance} disabled={busy} onChange={e=>setCardioAddDraft(current=>({...current,distance:normalizeDecimalInput(e.target.value)}))} placeholder="3"/></label>
                  <label className="field-label"><span>Скорость, км/ч</span><input inputMode="decimal" value={cardioAddDraft.speed} disabled={busy} onChange={e=>setCardioAddDraft(current=>({...current,speed:normalizeDecimalInput(e.target.value)}))} placeholder="8"/></label>
                  <label className="field-label"><span>Наклон, %</span><input inputMode="decimal" value={cardioAddDraft.incline} disabled={busy} onChange={e=>setCardioAddDraft(current=>({...current,incline:normalizeDecimalInput(e.target.value)}))} placeholder="2"/></label>
                </div>
                {cardioAddIssue&&<div className="drawer-notice">{cardioAddIssue}</div>}
              </>}
        </div>
        <div className="drawer-footer">
          <button className="ghost-button" disabled={busy} onClick={closeAddCardio}>Отмена</button>
          <button className="primary-button" disabled={busy||cardioAddLoading||cardioModalities.length===0} onClick={()=>void submitAddCardio()}><Plus size={16}/>{busy?'Добавляю…':'Добавить в тренировку'}</button>
        </div>
      </aside>
    </div>}
    {sheet && <div className="drawer-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target){setReplacementChoice(null);setSheet(null)}}}>
      <aside className="exercise-drawer workout-sheet">
        <div className="drawer-head">
          <div><span className="eyebrow">{sheet.type==='technique'?'Об упражнении':sheet.type==='comment'?'Комментарий тренеру':sheet.type==='history'?'История упражнения':sheet.type==='warmup'?'Разминка':(sheet.type==='replace'&&(sheet.exercise.sets.some(set=>Boolean(set.completed_at))||Object.entries(setDrafts).some(([key,draft])=>key.startsWith(sheet.exercise.id+':')&&draft.completed)))?'Смена упражнения':'Замена упражнения'}</span><h3>{sheet.exercise.name}</h3></div>
          <button className="icon-button" onClick={()=>{setReplacementChoice(null);setSheet(null)}}><X size={18}/></button>
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
            {replacementChoice?.exerciseId===sheet.exercise.id
              ? <>
                  <div className="drawer-notice">
                    <strong>{replacementChoice.name}</strong>
                    <span>Как использовать эту замену?</span>
                  </div>
                  <p className="sheet-description">«В следующих тренировках тоже» запомнит выбор для этого места текущей версии программы. Если тренер изменит программу или список разрешённых замен, старое предпочтение не будет обходить новые ограничения.</p>
                  <div className="finish-workout-actions">
                    <button className="primary-button" disabled={busy} onClick={()=>void replaceExercise(sheet.exercise,replacementChoice.newExerciseId,false)}>Только сейчас</button>
                    <button className="ghost-button" disabled={busy} onClick={()=>void replaceExercise(sheet.exercise,replacementChoice.newExerciseId,true)}>В следующих тренировках тоже</button>
                  </div>
                  <button className="text-button" disabled={busy} onClick={()=>setReplacementChoice(null)}>Назад к вариантам</button>
                </>
              : <>
                  {(sheet.exercise.sets.some(set=>Boolean(set.completed_at))||Object.entries(setDrafts).some(([key,draft])=>key.startsWith(sheet.exercise.id+':')&&draft.completed))
                    ? <div className="drawer-notice"><strong>Выполненные подходы не пропадут.</strong><span>Текущее упражнение останется в истории, а выбранное добавится в эту тренировку на оставшиеся рабочие подходы. Несохранённые значения следующего подхода не переносятся.</span></div>
                    : <p className="sheet-description">Доступны только варианты, которые тренер заранее разрешил для этого движения. До первого сохранённого подхода упражнение заменяется целиком.</p>}
                  <div className="replacement-list">
                    {sheet.exercise.substitution_options.map(option=><button key={option.id} onClick={()=>setReplacementChoice({exerciseId:sheet.exercise.id,newExerciseId:option.id,name:option.name})}><RefreshCcw size={17}/><span>{option.name}</span><ChevronRight size={16}/></button>)}
                  </div>
                </>}
          </>}
        </div>
      </aside>
    </div>}
  </UiStack>
}
