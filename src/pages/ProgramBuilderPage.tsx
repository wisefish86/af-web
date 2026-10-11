import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowDown, ArrowUp, Bike, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3,
  Dumbbell, Film, Gauge, GripVertical, ImageIcon, Link2, Plus, RefreshCcw, Save, Search, Trash2, Unlink2, X
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { ConfirmActionSheet } from '../components/ConfirmActionSheet'
import { UnsavedChangesGuard } from '../components/UnsavedChangesGuard'
import { activateTrainingProgram, findTrainingProgramSaveResult, findTrainingProgramSmartSaveResult, loadProgramBuilderReferences, loadTrainerPrograms, loadTrainingProgramForEdit, saveTrainingProgramActiveEdit, saveTrainingProgramDraft } from '../features/programs/service'
import { showAppToast } from '../lib/toast'
import { detachProgramExerciseFromSuperset, moveProgramBlock, pairProgramExercises, resolveTrainingProgramSaveMode } from '../features/programs/model'
import { rankExerciseReplacements, replacementReason, type ReplacementScope } from '../features/exercises/replacements'
import type {
  ProgramBuilderReferences, ProgramCardioItem, ProgramExerciseItem,
  ProgramItem, ProgramSession, TrainingProgramDraft
} from '../features/programs/types'

type Props = { preview: boolean }

const previewReferences: ProgramBuilderReferences = {
  clients: [{ id:'sergey', name:'Сергей' }],
  cardioModalities: [
    { code:'treadmill', name:'Беговая дорожка', sort_order:10 },
    { code:'walking', name:'Ходьба', sort_order:20 },
    { code:'bike', name:'Велотренажёр', sort_order:40 },
    { code:'elliptical', name:'Эллипс', sort_order:50 },
  ],
  library: {
    muscles: [
      { code:'chest', name:'Грудь', parent_code:null, sort_order:10 },
      { code:'back', name:'Спина', parent_code:null, sort_order:20 },
      { code:'triceps', name:'Трицепс', parent_code:null, sort_order:80 },
      { code:'quads', name:'Квадрицепс', parent_code:null, sort_order:90 },
      { code:'glutes', name:'Ягодицы', parent_code:null, sort_order:110 },
      { code:'delts_side', name:'Средняя дельта', parent_code:null, sort_order:50 },
    ],
    equipment: [
      { code:'dumbbell', name:'Гантели', sort_order:20 },
      { code:'cable', name:'Кроссовер / блок', sort_order:50 },
      { code:'machine', name:'Тренажёр', sort_order:60 },
    ],
    patterns: [],
    substitutionGroups: [
      { id:'sg-press', code:'CHEST_INCLINE_PRESS', name:'Наклонные жимы на грудь', purpose:'Близкие варианты наклонного жима', scope:'specific', parent_group_id:null },
      { id:'sg-row', code:'BACK_HORIZONTAL_ROW', name:'Горизонтальные тяги', purpose:'Тяги к корпусу', scope:'specific', parent_group_id:null },
    ],
    exercises: [
      {
        id:'ex-press', code:'PRESS', name:'Жим гантелей на наклонной скамье',
        description:'Многосуставной жим на верх груди', instructions:null, setup_notes:null, common_mistakes:null,
        exercise_type:'compound', tracking_type:'weight_reps', aliases:[], equipment_code:'dumbbell', movement_pattern_code:'incline_push',
        default_rest_seconds:150, technique_url:null, image_url:null, is_unilateral:false, is_active:true,
        primary_muscles:['chest'], secondary_muscles:['triceps'], stabilizer_muscles:[],
        tags:[],
        substitution_groups:[{id:'sg-press',code:'CHEST_INCLINE_PRESS',name:'Наклонные жимы на грудь',purpose:'Близкие варианты наклонного жима',scope:'specific',parent_group_id:null,priority:10,is_default:true,match_type:'direct',membership_notes:null}],
      },
      {
        id:'ex-row', code:'ROW', name:'Горизонтальная тяга в блочном тренажёре',
        description:'Тяга к корпусу', instructions:null, setup_notes:null, common_mistakes:null,
        exercise_type:'compound', tracking_type:'weight_reps', aliases:[], equipment_code:'cable', movement_pattern_code:'horizontal_pull',
        default_rest_seconds:150, technique_url:null, image_url:null, is_unilateral:false, is_active:true,
        primary_muscles:['back'], secondary_muscles:[], stabilizer_muscles:[],
        tags:[],
        substitution_groups:[{id:'sg-row',code:'BACK_HORIZONTAL_ROW',name:'Горизонтальные тяги',purpose:'Тяги к корпусу',scope:'specific',parent_group_id:null,priority:10,is_default:true,match_type:'direct',membership_notes:null}],
      },
      {
        id:'ex-leg', code:'LEG_PRESS', name:'Жим ногами',
        description:'Многосуставное движение для ног', instructions:null, setup_notes:null, common_mistakes:null,
        exercise_type:'compound', tracking_type:'weight_reps', aliases:[], equipment_code:'machine', movement_pattern_code:'squat',
        default_rest_seconds:150, technique_url:null, image_url:null, is_unilateral:false, is_active:true,
        primary_muscles:['quads','glutes'], secondary_muscles:[], stabilizer_muscles:[],
        tags:[], substitution_groups:[],
      },
      {
        id:'ex-delt', code:'DELT', name:'Отведение руки в сторону с нижнего блока',
        description:'Средняя дельта', instructions:null, setup_notes:null, common_mistakes:null,
        exercise_type:'isolation', tracking_type:'weight_reps', aliases:[], equipment_code:'cable', movement_pattern_code:'lateral_raise',
        default_rest_seconds:75, technique_url:null, image_url:null, is_unilateral:true, is_active:true,
        primary_muscles:['delts_side'], secondary_muscles:[], stabilizer_muscles:[],
        tags:[], substitution_groups:[],
      },
    ],
  },
}

function uid() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random())
}

function newSession(index: number, type: ProgramSession['session_type'] = 'strength'): ProgramSession {
  return {
    local_id: uid(),
    name: type === 'cardio' ? `Кардио ${index}` : index === 1 ? 'Full Body' : `Сессия ${index}`,
    session_type:type,
    planned_duration_minutes:type === 'cardio' ? 30 : 60,
    notes:'',
    items:[],
  }
}

const initialDraft: TrainingProgramDraft = {
  client_id:'',
  name:'Full Body',
  description:'',
  weekly_frequency:2,
  is_template:true,
  sessions:[newSession(1)],
}

const previewEditDraft:TrainingProgramDraft={
  client_id:'sergey',
  name:'Full Body · Сергей',
  description:'Текущая программа клиента. Изменения создают новую версию.',
  weekly_frequency:3,
  is_template:false,
  sessions:[{
    local_id:'preview-session-1',
    name:'Full Body A',
    session_type:'strength',
    planned_duration_minutes:70,
    notes:'',
    items:[
      {
        local_id:'preview-item-press',type:'exercise',exercise_id:'ex-press',substitution_group_id:'sg-press',
        exercise_role:'main',sets_min:3,sets_max:3,reps_min:8,reps_max:12,rir_enabled:true,rir_min:1,rir_max:2,
        rest_seconds:120,warmup_enabled:true,warmup_load_percent_min:50,warmup_load_percent_max:60,warmup_reps_min:8,warmup_reps_max:10,warmup_rest_seconds:60,
        warmup_notes:'Спокойная разминка.',allow_client_substitution:true,substitution_policy:'strict',notes:'',progression_notes:'',superset_group:null,superset_position:null,
      },
      {
        local_id:'preview-item-row',type:'exercise',exercise_id:'ex-row',substitution_group_id:'sg-row',
        exercise_role:'main',sets_min:3,sets_max:3,reps_min:8,reps_max:12,rir_enabled:true,rir_min:1,rir_max:2,
        rest_seconds:120,warmup_enabled:false,warmup_load_percent_min:50,warmup_load_percent_max:60,warmup_reps_min:8,warmup_reps_max:10,warmup_rest_seconds:60,
        warmup_notes:'',allow_client_substitution:true,substitution_policy:'strict',notes:'',progression_notes:'',superset_group:null,superset_position:null,
      },
      {
        local_id:'preview-item-leg',type:'exercise',exercise_id:'ex-leg',substitution_group_id:'',
        exercise_role:'accessory',sets_min:3,sets_max:3,reps_min:10,reps_max:15,rir_enabled:true,rir_min:1,rir_max:2,
        rest_seconds:120,warmup_enabled:false,warmup_load_percent_min:50,warmup_load_percent_max:60,warmup_reps_min:8,warmup_reps_max:10,warmup_rest_seconds:60,
        warmup_notes:'',allow_client_substitution:false,substitution_policy:'strict',notes:'',progression_notes:'',superset_group:null,superset_position:null,
      },
    ],
  }],
}

function toNullableNumber(value: string): number | null {
  if (value === '') return null
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function restFromParts(current:number,part:'minutes'|'seconds',value:string) {
  const numeric=Math.max(0,Number(value)||0)
  const minutes=part==='minutes' ? Math.min(30,Math.floor(numeric)) : Math.floor(current/60)
  const seconds=part==='seconds' ? Math.min(59,Math.floor(numeric)) : current%60
  return Math.min(1800,Math.max(15,minutes*60+seconds))
}

function compactReps(item:ProgramExerciseItem){
  if(item.reps_min==null&&item.reps_max==null)return '—'
  if(item.reps_min!=null&&item.reps_max!=null&&item.reps_min!==item.reps_max)return `${item.reps_min}–${item.reps_max}`
  return String(item.reps_min??item.reps_max)
}

function compactRest(seconds:number){
  const minutes=Math.floor(seconds/60)
  const rest=seconds%60
  return minutes>0?(rest?`${minutes}:${String(rest).padStart(2,'0')}`:`${minutes} мин`):`${rest} сек`
}

type PendingProgramSave={
  requestId:string
  draft:TrainingProgramDraft
  snapshot:string
  replaceDraftId:string|null
  revisionSourceId:string|null
  creatingRevision:boolean
}

type ProgramSaveOutcome={
  id:string
  mode:'draft_saved'|'updated_active'|'revision_created'
  version:number|null
  status:'draft'|'active'
}

function cloneProgramDraft(value:TrainingProgramDraft){
  return JSON.parse(JSON.stringify(value)) as TrainingProgramDraft
}

function Repeat2Icon(){
  return <Link2 size={15} aria-hidden="true"/>
}

export function ProgramBuilderPage({ preview }: Props) {
  const {programId}=useParams()
  const [refs, setRefs] = useState<ProgramBuilderReferences>(previewReferences)
  const [draft, setDraft] = useState<TrainingProgramDraft>(initialDraft)
  const [activeSessionId, setActiveSessionId] = useState(initialDraft.sessions[0].local_id)
  const [loading, setLoading] = useState(true)
  const [loadFailed,setLoadFailed]=useState(false)
  const [reloadKey,setReloadKey]=useState(0)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [savedProgramId,setSavedProgramId] = useState<string | null>(null)
  const [revisionSourceId,setRevisionSourceId]=useState<string|null>(null)
  const [editingVersion,setEditingVersion]=useState<number|null>(null)
  const [savedDraftSnapshot,setSavedDraftSnapshot]=useState<string|null>(null)
  const [published,setPublished] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [replaceItemId,setReplaceItemId]=useState<string|null>(null)
  const [exerciseQuery, setExerciseQuery] = useState('')
  const [muscleFilter, setMuscleFilter] = useState('')
  const [equipmentFilter,setEquipmentFilter]=useState('')
  const [replacementScope,setReplacementScope]=useState<ReplacementScope>('recommended')
  const [defaultRirEnabled,setDefaultRirEnabled] = useState(true)
  const [draggedItemId,setDraggedItemId]=useState<string|null>(null)
  const [dropTarget,setDropTarget]=useState<{itemId:string;mode:'before'|'after'|'superset'}|null>(null)
  const [expandedItems,setExpandedItems]=useState<Set<string>>(()=>new Set())
  const [pairingItemId,setPairingItemId]=useState<string|null>(null)
  const [pendingRemoval,setPendingRemoval]=useState<
    | {kind:'item';id:string;label:string;isSuperset:boolean}
    | {kind:'session';id:string;label:string}
    | null
  >(null)
  const pendingSaveRef=useRef<PendingProgramSave|null>(null)

  useEffect(() => {
    setLoading(true)
    setLoadFailed(false)
    setNotice('')
    if (preview) {
      setRefs(previewReferences)
      if(programId){
        setDraft(previewEditDraft)
        setActiveSessionId(previewEditDraft.sessions[0].local_id)
        setSavedProgramId(null)
        setRevisionSourceId(programId)
        setEditingVersion(2)
        setSavedDraftSnapshot(JSON.stringify(previewEditDraft))
        setPublished(false)
      }else{
        setDraft(initialDraft)
        setActiveSessionId(initialDraft.sessions[0].local_id)
        setSavedProgramId(null)
        setRevisionSourceId(null)
        setEditingVersion(null)
        setSavedDraftSnapshot(null)
        setPublished(false)
      }
      setLoading(false)
      return
    }

    Promise.all([
      loadProgramBuilderReferences(),
      programId?loadTrainingProgramForEdit(programId):Promise.resolve(null),
    ])
      .then(([references,source])=>{
        setRefs(references)
        if(!source){
          setDraft(initialDraft)
          setActiveSessionId(initialDraft.sessions[0].local_id)
          setSavedProgramId(null)
          setRevisionSourceId(null)
          setEditingVersion(null)
          setSavedDraftSnapshot(null)
          setPublished(false)
          return
        }
        if(source.status==='archived'){
          setLoadFailed(true)
          setNotice('Предыдущая версия доступна только как история. Для изменений открой текущую активную программу клиента.')
          return
        }
        setDraft(source.draft)
        setActiveSessionId(source.draft.sessions[0]?.local_id??'')
        setEditingVersion(source.version)
        setSavedDraftSnapshot(JSON.stringify(source.draft))
        if(source.status==='draft'){
          setSavedProgramId(source.id)
          setRevisionSourceId(null)
        }else{
          setSavedProgramId(null)
          setRevisionSourceId(source.id)
        }
        setPublished(false)
      })
      .catch(error => {setLoadFailed(true);setNotice((error instanceof Error ? error.message : 'Не удалось загрузить программу')+' Редактирование заблокировано, чтобы не сохранить неполные данные.')})
      .finally(()=>setLoading(false))
  }, [preview,programId,reloadKey])

  const activeIndex = Math.max(0, draft.sessions.findIndex(session => session.local_id === activeSessionId))
  const activeSession = draft.sessions[activeIndex] ?? draft.sessions[0]
  const exerciseById = useMemo(() => new Map(refs.library.exercises.map(item => [item.id,item])), [refs])
  const muscleName = useMemo(() => new Map(refs.library.muscles.map(item => [item.code,item.name])), [refs])
  const equipmentTags=useMemo(()=>{
    const map=new Map<string,{slug:string;name:string}>()
    refs.library.exercises.forEach(exercise=>exercise.tags
      .filter(tag=>tag.slug.startsWith('equip-'))
      .forEach(tag=>map.set(tag.slug,{slug:tag.slug,name:tag.name})))
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'))
  },[refs])

  const replacingExercise = useMemo(()=>{
    if(!replaceItemId)return null
    const item=activeSession.items.find(item=>item.local_id===replaceItemId&&item.type==='exercise')
    return item&&item.type==='exercise'?exerciseById.get(item.exercise_id)??null:null
  },[replaceItemId,activeSession.items,exerciseById])

  const filteredExercises = useMemo(() => {
    const q = exerciseQuery.trim().toLocaleLowerCase('ru')
    const base=replacingExercise
      ? rankExerciseReplacements(replacingExercise,refs.library.exercises,replacementScope)
      : refs.library.exercises.filter(exercise=>exercise.is_active)

    return base.filter(exercise => {
      const queryHit = !q || [exercise.name, ...exercise.aliases, exercise.description ?? '', ...exercise.tags.map(t=>t.name)]
        .join(' ').toLocaleLowerCase('ru').includes(q)
      const muscleHit = !muscleFilter || exercise.primary_muscles.includes(muscleFilter)
      const equipmentHit=!equipmentFilter || exercise.tags.some(tag=>tag.slug===equipmentFilter)
      return queryHit && muscleHit && equipmentHit
    })
  }, [refs, exerciseQuery, muscleFilter,equipmentFilter,replacingExercise,replacementScope])

  function updateSession(patch: Partial<ProgramSession>) {
    setDraft(current => ({
      ...current,
      sessions:current.sessions.map(session => session.local_id === activeSession.local_id ? {...session,...patch} : session),
    }))
  }

  function updateItem(localId: string, patch: Partial<ProgramExerciseItem> | Partial<ProgramCardioItem>) {
    updateSession({
      items:activeSession.items.map(item => item.local_id === localId ? ({...item,...patch} as ProgramItem) : item),
    })
  }

  function addSession(type: ProgramSession['session_type']) {
    const session = newSession(draft.sessions.length + 1,type)
    setDraft(current => ({...current,sessions:[...current.sessions,session]}))
    setActiveSessionId(session.local_id)
  }

  function removeSession(id: string) {
    if (draft.sessions.length === 1) return
    const next = draft.sessions.filter(session=>session.local_id!==id)
    setDraft(current=>({...current,sessions:next}))
    if (activeSessionId === id) setActiveSessionId(next[0].local_id)
  }

  function openExercisePicker(replaceId:string|null=null){
    setReplaceItemId(replaceId)
    setExerciseQuery('')
    setMuscleFilter('')
    setEquipmentFilter('')
    setReplacementScope(replaceId?'recommended':'all')
    setPickerOpen(true)
  }

  function addExercise(exerciseId: string) {
    const exercise = exerciseById.get(exerciseId)
    if (!exercise) return

    if(replaceItemId){
      updateSession({items:activeSession.items.map(item=>item.local_id===replaceItemId&&item.type==='exercise'?{
        ...item,
        exercise_id:exercise.id,
        substitution_group_id:exercise.substitution_groups.find(group=>group.is_default)?.id??exercise.substitution_groups[0]?.id??'',
        allow_client_substitution:exercise.substitution_groups.length>0,
      }:item)})
      setReplaceItemId(null)
      setPickerOpen(false)
      setExerciseQuery('')
      showAppToast('Упражнение заменено. Подходы, повторы, RIR и место в программе сохранены.','info')
      return
    }

    const item: ProgramExerciseItem = {
      local_id:uid(),
      type:'exercise',
      exercise_id:exercise.id,
      substitution_group_id:exercise.substitution_groups[0]?.id ?? '',
      exercise_role:activeSession.items.some(item=>item.type==='exercise' && item.exercise_role==='main') ? 'accessory' : 'main',
      sets_min:3,
      sets_max:3,
      reps_min:8,
      reps_max:12,
      rir_enabled:defaultRirEnabled,
      rir_min:defaultRirEnabled ? 1 : null,
      rir_max:defaultRirEnabled ? 2 : null,
      rest_seconds:exercise.default_rest_seconds,
      warmup_enabled:false,
      warmup_load_percent_min:50,
      warmup_load_percent_max:60,
      warmup_reps_min:8,
      warmup_reps_max:10,
      warmup_rest_seconds:60,
      warmup_notes:'Разогреться без утомления перед первым рабочим сетом.',
      allow_client_substitution:exercise.substitution_groups.length>0,
      substitution_policy:'strict',
      notes:'',
      progression_notes:'',
      superset_group:null,
      superset_position:null,
    }
    updateSession({items:[...activeSession.items,item]})
    setPickerOpen(false)
    setExerciseQuery('')
  }

  function applyStarterFullBody() {
    const specs = [
      {code:'BACK_MID_CABLE_ROW',sets:3,reps:[8,12],rest:90,role:'main',warmup:true,group:1,pos:1},
      {code:'CHEST_UPPER_DB_PRESS',sets:3,reps:[8,12],rest:90,role:'main',warmup:true,group:1,pos:2},
      {code:'BACK_LAT_NEUTRAL_PULL',sets:3,reps:[8,12],rest:75,role:'main',warmup:false,group:2,pos:1},
      {code:'DELTS_SIDE_CABLE_RAISE',sets:3,reps:[12,20],rest:75,role:'accessory',warmup:false,group:2,pos:2},
      {code:'BICEPS_CABLE_CURL',sets:2,reps:[10,15],rest:75,role:'accessory',warmup:false,group:3,pos:1},
      {code:'TRICEPS_CABLE_PUSHDOWN',sets:2,reps:[10,15],rest:75,role:'accessory',warmup:false,group:3,pos:2},
      {code:'HAMSTRING_LEG_CURL',sets:3,reps:[10,15],rest:75,role:'accessory',warmup:false,group:4,pos:1},
      {code:'DELTS_REAR_FACE_PULL',sets:3,reps:[12,20],rest:75,role:'accessory',warmup:false,group:4,pos:2},
      {code:'CORE_CABLE_CRUNCH',sets:3,reps:[10,20],rest:60,role:'accessory',warmup:false,group:5,pos:1},
      {code:'TRAPS_SHRUG_DB',sets:3,reps:[10,15],rest:75,role:'accessory',warmup:false,group:5,pos:2},
      {code:'QUAD_GLUTE_LEG_PRESS',sets:3,reps:[8,15],rest:90,role:'main',warmup:true,group:6,pos:1},
      {code:'CALVES_LEG_PRESS_RAISE',sets:3,reps:[10,20],rest:90,role:'accessory',warmup:false,group:6,pos:2},
    ] as const
    const missing=specs.filter(spec=>!refs.library.exercises.some(ex=>ex.code===spec.code))
    if(missing.length){
      setNotice('Не удалось собрать пресет: не найдены упражнения '+missing.map(x=>x.code).join(', '))
      return
    }
    const session:ProgramSession={
      local_id:uid(),
      name:'Full Body — силовая',
      session_type:'strength',
      planned_duration_minutes:75,
      notes:'Фиксированный порядок. Упражнения собраны в суперсеты: выполни два упражнения подряд, затем отдохни и переходи к следующему кругу.',
      items:specs.map(spec=>{
        const exercise=refs.library.exercises.find(ex=>ex.code===spec.code)!
        const group=exercise.substitution_groups.find(g=>g.is_default) ?? exercise.substitution_groups[0]
        const item:ProgramExerciseItem={
          local_id:uid(),type:'exercise',exercise_id:exercise.id,
          substitution_group_id:group?.id??'',
          exercise_role:spec.role,
          sets_min:spec.sets,sets_max:spec.sets,reps_min:spec.reps[0],reps_max:spec.reps[1],
          rir_enabled:true,rir_min:1,rir_max:2,rest_seconds:spec.rest,
          warmup_enabled:spec.warmup,
          warmup_load_percent_min:50,warmup_load_percent_max:60,warmup_reps_min:8,warmup_reps_max:10,warmup_rest_seconds:60,
          warmup_notes:'Примерно 50–60% рабочего веса × 8–10 спокойных повторений. Не до утомления.',
          allow_client_substitution:Boolean(group),substitution_policy:'strict',
          notes:'Остановись, когда уверен, что осталось ещё 1–2 чистых повтора.',
          progression_notes:'Когда верхняя граница повторов выполнена во всех рабочих сетах при RIR 1–2 — немного увеличить вес.',
          superset_group:spec.group,
          superset_position:spec.pos as 1|2,
        }
        return item
      }),
    }
    setDraft(current=>({
      ...current,
      name:'Full Body — Андрей',
      description:'Full Body с приоритетом верха тела. Фиксированный порядок и вставочные суперсеты сохраняют сопоставимость результатов между тренировками.',
      weekly_frequency:2,
      sessions:[session],
    }))
    setActiveSessionId(session.local_id)
    setDefaultRirEnabled(true)
    setSavedProgramId(null)
    setPublished(false)
    setNotice('Загружен Full Body с суперсетами. Перетаскивай упражнения, чтобы менять порядок или собирать пары.')
  }

  function addCardio() {
    const item: ProgramCardioItem = {
      local_id:uid(), type:'cardio', modality_code:refs.cardioModalities[0]?.code ?? 'other',
      name:'', duration_minutes:20, target_hr_min:null, target_hr_max:null,
      target_rpe_min:null, target_rpe_max:null, speed_kmh:null, incline_percent:null,
      distance_km:null, notes:'',
    }
    updateSession({items:[...activeSession.items,item]})
  }

  function removeItem(localId: string) {
    const next=activeSession.items.filter(item=>item.local_id!==localId)
    const removed=activeSession.items.find(item=>item.local_id===localId)
    updateSession({items:removed?.type==='exercise'&&removed.superset_group!=null
      ? detachProgramExerciseFromSuperset(activeSession.items,localId).filter(item=>item.local_id!==localId)
      : next})
    if(pairingItemId===localId)setPairingItemId(null)
  }

  function moveItem(localId: string, direction: -1 | 1) {
    const items=activeSession.items
    const source=items.find(item=>item.local_id===localId)
    if(!source)return
    const blockIndexes=items
      .map((item,index)=>source.type==='exercise'&&source.superset_group!=null&&item.type==='exercise'&&item.superset_group===source.superset_group?index:item.local_id===localId?index:-1)
      .filter(index=>index>=0)
    const edge=direction===-1?Math.min(...blockIndexes):Math.max(...blockIndexes)
    const target=items[edge+direction]
    if(!target)return
    updateSession({items:moveProgramBlock(items,localId,target.local_id,direction===-1?'before':'after')})
  }

  function toggleItemExpanded(localId:string){
    setExpandedItems(current=>{
      const next=new Set(current)
      if(next.has(localId))next.delete(localId)
      else next.add(localId)
      return next
    })
  }

  function autoScrollDuringDrag(clientY:number){
    const threshold=Math.min(150,Math.max(90,window.innerHeight*.16))
    if(clientY<threshold){
      const strength=(threshold-clientY)/threshold
      window.scrollBy({top:-Math.max(8,Math.round(30*strength)),behavior:'auto'})
    }else if(clientY>window.innerHeight-threshold){
      const strength=(clientY-(window.innerHeight-threshold))/threshold
      window.scrollBy({top:Math.max(8,Math.round(30*strength)),behavior:'auto'})
    }
  }

  function pairItems(sourceId:string,targetId:string){
    const source=activeSession.items.find(item=>item.local_id===sourceId)
    const target=activeSession.items.find(item=>item.local_id===targetId)
    if(!source||!target||source.type!=='exercise'||target.type!=='exercise')return
    if(target.superset_group!=null&&target.superset_group!==source.superset_group){
      showAppToast('Этот суперсет уже собран из двух упражнений. Сначала разъедини его.','warning')
      return
    }
    const next=pairProgramExercises(activeSession.items,sourceId,targetId)
    if(next===activeSession.items)return
    updateSession({items:next})
    setPairingItemId(null)
    showAppToast('Суперсет собран. Упражнения будут выполняться подряд, отдых — после пары.','info')
  }

  function detachItem(localId:string){
    const next=detachProgramExerciseFromSuperset(activeSession.items,localId)
    updateSession({items:next})
    showAppToast('Упражнения снова выполняются отдельно.','info')
  }

  function finishDrop(targetId:string,mode:'before'|'after'|'superset'){
    if(!draggedItemId||draggedItemId===targetId)return
    if(mode==='superset')pairItems(draggedItemId,targetId)
    else updateSession({items:moveProgramBlock(activeSession.items,draggedItemId,targetId,mode)})
    setDraggedItemId(null)
    setDropTarget(null)
  }

  function onClientChange(clientId: string) {
    if(programId)return
    setSavedProgramId(null)
    setRevisionSourceId(null)
    setEditingVersion(null)
    setSavedDraftSnapshot(null)
    setPublished(false)
    setDraft(current=>({...current,client_id:clientId,is_template:!clientId}))
  }

  function acceptProgramSave(outcome:ProgramSaveOutcome,pending:PendingProgramSave){
    setSavedProgramId(outcome.id)
    setSavedDraftSnapshot(pending.snapshot)

    if(outcome.mode==='updated_active'){
      setRevisionSourceId(outcome.id)
      if(outcome.version!=null)setEditingVersion(outcome.version)
      setPublished(true)
      return
    }

    if(outcome.mode==='revision_created'){
      setRevisionSourceId(pending.revisionSourceId)
      if(outcome.version!=null)setEditingVersion(outcome.version)
    }
    setPublished(false)
  }

  function makePendingSave(
    value:TrainingProgramDraft,
    replaceDraftId:string|null,
    revisionSourceId:string|null,
    creatingRevision:boolean,
  ):PendingProgramSave{
    const copy=cloneProgramDraft(value)
    return {
      requestId:window.crypto.randomUUID(),
      draft:copy,
      snapshot:JSON.stringify(copy),
      replaceDraftId,
      revisionSourceId,
      creatingRevision,
    }
  }

  async function sendPendingSave(pending:PendingProgramSave):Promise<ProgramSaveOutcome>{
    if(pending.revisionSourceId){
      const result=await saveTrainingProgramActiveEdit(pending.draft,pending.requestId,pending.revisionSourceId)
      return {
        id:result.program_id,
        mode:result.mode,
        version:result.version,
        status:result.status,
      }
    }
    const id=await saveTrainingProgramDraft(pending.draft,{
      requestId:pending.requestId,
      replaceDraftId:pending.replaceDraftId,
      revisionSourceId:null,
    })
    return {id,mode:'draft_saved',version:null,status:'draft'}
  }

  function programSaveToast(outcome:ProgramSaveOutcome){
    if(outcome.mode==='updated_active')return 'Изменения сохранены в текущей программе. Клиент увидит их в следующей тренировке.'
    if(outcome.mode==='revision_created')return 'Состав упражнений изменён — создана новая версия. Опубликуй её клиенту после проверки.'
    return 'Черновик программы сохранён.'
  }

  async function saveProgram():Promise<boolean> {
    if(loadFailed){setNotice('Конструктор загружен не полностью. Повтори загрузку перед сохранением.');return false}
    setNotice('')
    if (!draft.name.trim()){setNotice('Укажи название программы.');return false}
    if (!draft.sessions.length){setNotice('Добавь хотя бы одну сессию.');return false}
    if (draft.sessions.some(session=>session.items.length===0)){setNotice('В каждой сессии должен быть хотя бы один блок.');return false}

    if (preview) {
      setSavedProgramId(savedProgramId??programId??('preview-draft-'+Date.now()))
      setSavedDraftSnapshot(JSON.stringify(draft))
      setPublished(Boolean(programId))
      showAppToast(programId?'Изменения сохранены в текущей программе.':'Черновик сохранён в предпросмотре.','info')
      return true
    }

    setSaving(true)
    try {
      let pending=pendingSaveRef.current
      if(pending){
        const recoveredOutcome=await sendPendingSave(pending)
        acceptProgramSave(recoveredOutcome,pending)
        pendingSaveRef.current=null

        const currentSnapshot=JSON.stringify(draft)
        if(currentSnapshot===pending.snapshot){
          showAppToast('Черновик уже был сохранён на сервере.','info')
          return true
        }

        const latest=makePendingSave(draft,recoveredId,null,false)
        pendingSaveRef.current=latest
        const latestOutcome=await sendPendingSave(latest)
        acceptProgramSave(latestOutcome,latest)
        pendingSaveRef.current=null
        showAppToast('Предыдущее сохранение подтверждено, последние изменения тоже сохранены.')
        return true
      }

      const {revisionBaseId,replacingDraftId,creatingRevision}=resolveTrainingProgramSaveMode({
        published,savedProgramId,revisionSourceId,
      })
      pending=makePendingSave(draft,replacingDraftId,revisionBaseId,creatingRevision)
      pendingSaveRef.current=pending

      const outcome=await sendPendingSave(pending)
      acceptProgramSave(outcome,pending)
      pendingSaveRef.current=null
      showAppToast(programSaveToast(outcome),outcome.mode==='revision_created'?'info':'success')
      return true
    } catch (error) {
      const message=error instanceof Error?error.message:'Не удалось подтвердить сохранение программы'
      const pending=pendingSaveRef.current
      if(pending&&message.includes('different program payload')){
        pendingSaveRef.current=null
        setNotice('Конфликт идентификатора сохранения. Обнови страницу перед следующей попыткой.')
        return false
      }
      if(pending){
        try{
          const recovered=pending.revisionSourceId
            ? await findTrainingProgramSmartSaveResult(pending.requestId)
            : null
          const savedId=recovered?.program_id??await findTrainingProgramSaveResult(pending.requestId)
          if(savedId){
            const outcome:ProgramSaveOutcome=recovered
              ? {id:recovered.program_id,mode:recovered.mode,version:recovered.version,status:recovered.status}
              : {id:savedId,mode:'draft_saved',version:null,status:'draft'}
            acceptProgramSave(outcome,pending)
            pendingSaveRef.current=null
            if(JSON.stringify(draft)===pending.snapshot){showAppToast('Черновик уже был сохранён на сервере.','info');return true}
            showAppToast('Предыдущее сохранение подтверждено. Последние изменения ещё не сохранены.','warning')
            return false
          }
          pendingSaveRef.current=null
        }catch{
          setNotice(message+' Сервер пока не удалось перепроверить. Повтори сохранение тем же запросом.')
          return false
        }
      }
      setNotice(message)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function publishProgram() {
    if (!savedProgramId) {
      setNotice('Сначала сохрани черновик программы.')
      return
    }
    if (!draft.client_id) {
      setNotice('Чтобы опубликовать программу, сначала выбери клиента.')
      return
    }
    if(savedDraftSnapshot!==JSON.stringify(draft)){
      setNotice('После сохранения программа была изменена. Сначала сохрани текущую версию.')
      return
    }

    setSaving(true)
    setNotice('')
    try {
      if (!preview) await activateTrainingProgram(savedProgramId)
      setPublished(true)
      setRevisionSourceId(savedProgramId)
      showAppToast('Новая версия опубликована клиенту и стала активной.')
    } catch (error) {
      try{
        const programs=await loadTrainerPrograms()
        const actual=programs.find(program=>program.id===savedProgramId)
        if(actual?.is_active&&actual.status==='active'){
          setPublished(true)
          setRevisionSourceId(savedProgramId)
          showAppToast('Программа уже была опубликована клиенту.','info')
          return
        }
      }catch{}
      setNotice(error instanceof Error ? error.message : 'Не удалось опубликовать программу')
    } finally {
      setSaving(false)
    }
  }

  const hasUnsavedProgramChanges=Boolean(savedProgramId)&&savedDraftSnapshot!==JSON.stringify(draft)
  const hasAnyUnsavedProgramChanges=savedDraftSnapshot!==null
    ? savedDraftSnapshot!==JSON.stringify(draft)
    : JSON.stringify(draft)!==JSON.stringify(initialDraft)

  if (loading) return <div className="library-empty">Загружаю конструктор…</div>
  if(loadFailed)return <div className="page-stack program-builder-page"><div className="workspace-back"><Link to="/builder"><ChevronLeft size={17}/>Конструктор</Link></div><div className="library-empty"><strong>Не удалось безопасно загрузить программу.</strong><span>{notice||'Редактирование не открыто, чтобы не сохранить неполные данные.'}</span>{!notice.includes('Предыдущая версия')&&<button className="primary-button compact" onClick={()=>setReloadKey(key=>key+1)}><RefreshCcw size={15}/>Повторить загрузку</button>}</div></div>

  return (
    <div className="page-stack program-builder-page">
      <UnsavedChangesGuard when={!preview&&hasAnyUnsavedProgramChanges} onSave={saveProgram} saving={saving}/>
      <div className="workspace-back"><Link to="/builder"><ChevronLeft size={17}/>Конструктор</Link></div>

      <section className="program-builder-head">
        <div>
          <span className="eyebrow">Программа тренировок{editingVersion!=null?' · v'+editingVersion:''}</span>
          <h2>{programId?'Редактирование программы':'Собери план из сессий и блоков'}</h2>
          <p>{programId?'Порядок, суперсеты и настройки сохраняются в текущей программе. Новая версия создаётся только если после начала тренировок меняется состав упражнений.':'Одна Full Body или несколько силовых и кардио-сессий — структура подстраивается под клиента, а не наоборот.'}</p>
        </div>
        <div className="program-head-actions">
          <button className="ghost-button light-ghost" disabled={saving} onClick={applyStarterFullBody}><Dumbbell size={16}/>Full Body — старт</button>
          <button className="ghost-button light-ghost" disabled={saving} onClick={()=>void saveProgram()}><Save size={16}/>{programId?'Сохранить изменения':savedProgramId?'Сохранить изменения':'Сохранить черновик'}</button>
          {draft.client_id && savedProgramId && <button className="primary-button compact" disabled={saving||published||hasUnsavedProgramChanges} onClick={()=>void publishProgram()}><CheckCircle2 size={16}/>{published?'Опубликована':hasUnsavedProgramChanges?'Сначала сохрани изменения':'Опубликовать клиенту'}</button>}
        </div>
      </section>

      <section className="panel program-basics">
        <div className="form-grid-3">
          <label className="field-label">Название программы<input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
          <label className="field-label">Для кого
            <select value={draft.client_id} disabled={Boolean(programId)} onChange={e=>onClientChange(e.target.value)}>
              <option value="">Шаблон без клиента</option>
              {refs.clients.map(client=><option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
            {programId&&<small>Клиент фиксирован для всей истории версий этой программы.</small>}
          </label>
          <label className="field-label">Тренировок в неделю
            <input type="number" min="1" max="14" value={draft.weekly_frequency ?? ''} onChange={e=>setDraft({...draft,weekly_frequency:toNullableNumber(e.target.value)})}/>
          </label>
        </div>
        <label className="field-label">Комментарий к программе<textarea rows={2} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} placeholder="Например: две силовые в неделю, между ними минимум 48 часов"/></label>
        <div className="program-default-options">
          <label className="mini-toggle">
            <ToggleSwitch checked={defaultRirEnabled} onChange={value=>{
              setDefaultRirEnabled(value)
              setDraft(current=>({...current,sessions:current.sessions.map(session=>({
                ...session,
                items:session.items.map(item=>item.type==='exercise'
                  ? {...item,rir_enabled:value,rir_min:value?(item.rir_min ?? 1):null,rir_max:value?(item.rir_max ?? 2):null}
                  : item)
              }))}))
            }}/>
            <span><strong>RIR для программы</strong><small>{defaultRirEnabled?'Клиент видит RIR; у отдельного упражнения можно выключить':'RIR скрыт; у отдельного упражнения можно включить'}</small></span>
          </label>
        </div>
      </section>

      <section className="session-strip">
        <div className="session-tabs">
          {draft.sessions.map((session,index)=>(
            <button key={session.local_id} className={`session-tab ${session.local_id===activeSession.local_id?'is-active':''}`} onClick={()=>setActiveSessionId(session.local_id)}>
              <span className={`session-type-dot ${session.session_type}`}/>
              <span><strong>{session.name}</strong><small>{session.session_type==='strength'?'Силовая':session.session_type==='cardio'?'Кардио':'Смешанная'}</small></span>
              {draft.sessions.length>1 && session.local_id===activeSession.local_id && <X size={14} role="button" aria-label="Удалить сессию" onClick={e=>{e.stopPropagation();setPendingRemoval({kind:'session',id:session.local_id,label:session.name})}}/>}
            </button>
          ))}
        </div>
        <div className="add-session-menu">
          <button className="ghost-button" onClick={()=>addSession('strength')}><Plus size={14}/>Силовая</button>
          <button className="ghost-button" onClick={()=>addSession('cardio')}><Plus size={14}/>Кардио</button>
          <button className="ghost-button" onClick={()=>addSession('mixed')}><Plus size={14}/>Смешанная</button>
        </div>
      </section>

      <section className="panel session-editor">
        <div className="session-editor-head">
          <div className="session-title-fields">
            <input className="session-name-input" value={activeSession.name} onChange={e=>updateSession({name:e.target.value})}/>
            <select value={activeSession.session_type} onChange={e=>updateSession({session_type:e.target.value as ProgramSession['session_type']})}>
              <option value="strength">Силовая</option>
              <option value="cardio">Кардио</option>
              <option value="mixed">Смешанная</option>
            </select>
          </div>
          <label className="duration-field"><Clock3 size={15}/><input type="number" min="5" max="600" value={activeSession.planned_duration_minutes ?? ''} onChange={e=>updateSession({planned_duration_minutes:toNullableNumber(e.target.value)})}/><span>мин</span></label>
        </div>

        <div className="program-items" onDragOver={e=>{if(draggedItemId)autoScrollDuringDrag(e.clientY)}}>
          {activeSession.items.map((item,index)=>{
            if (item.type === 'exercise') {
              const exercise = exerciseById.get(item.exercise_id)
              if (!exercise) return null
              const expanded=expandedItems.has(item.local_id)
              const isSuperset=item.superset_group!=null
              return (
                <article
                  className={`program-item exercise-program-item ${isSuperset?'is-superset':''} ${item.superset_position===1?'is-superset-first':item.superset_position===2?'is-superset-second':''} ${expanded?'is-expanded':'is-collapsed'} ${dropTarget?.itemId===item.local_id?`is-drop-${dropTarget.mode}`:''}`}
                  key={item.local_id}
                  onDragOver={e=>{
                    if(!draggedItemId||draggedItemId===item.local_id)return
                    const source=activeSession.items.find(candidate=>candidate.local_id===draggedItemId)
                    const sameSuperset=source?.type==='exercise'&&source.superset_group!=null&&source.superset_group===item.superset_group
                    if(sameSuperset)return
                    e.preventDefault()
                    const rect=e.currentTarget.getBoundingClientRect()
                    const ratio=(e.clientY-rect.top)/Math.max(rect.height,1)
                    const canPair=source?.type==='exercise'&&source.superset_group==null&&item.superset_group==null
                    const mode=canPair&&ratio>=.32&&ratio<=.68?'superset':ratio<.5?'before':'after'
                    setDropTarget({itemId:item.local_id,mode})
                  }}
                  onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDropTarget(current=>current?.itemId===item.local_id?null:current)}}
                  onDrop={e=>{e.preventDefault();if(dropTarget?.itemId===item.local_id)finishDrop(item.local_id,dropTarget.mode)}}
                >
                  {isSuperset&&item.superset_position===1&&<div className="program-superset-label"><Repeat2Icon/><span><strong>Суперсет</strong><small>перетаскивается целиком · упражнения выполняются подряд</small></span></div>}
                  {dropTarget?.itemId===item.local_id&&<div className={`program-drop-hint ${dropTarget.mode}`}>{dropTarget.mode==='superset'?'Объединить в суперсет':dropTarget.mode==='before'?'Переместить выше':'Переместить ниже'}</div>}
                  <div
                    className="program-item-grip"
                    draggable
                    role="button"
                    tabIndex={0}
                    aria-label={isSuperset?'Перетащить суперсет':'Перетащить упражнение'}
                    title={isSuperset?'Перетащи — оба упражнения суперсета переместятся вместе':'Перетащи между упражнениями, чтобы изменить порядок, или на карточку, чтобы собрать суперсет'}
                    onDragStart={e=>{setDraggedItemId(item.local_id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',item.local_id)}}
                    onDragEnd={()=>{setDraggedItemId(null);setDropTarget(null)}}
                  ><GripVertical size={17}/></div>
                  <div className="program-item-main">
                    <div className="program-item-title-row compact-editor-row">
                      <div className="program-item-identity">
                        <Link
                          className="program-exercise-thumb-link"
                          to={`/builder/exercises?edit=${encodeURIComponent(exercise.id)}&returnTo=${encodeURIComponent(programId?`/builder/programs/${programId}/edit`:'/builder')}`}
                          title="Открыть карточку упражнения"
                          aria-label={`Редактировать упражнение: ${exercise.name}`}
                          onClick={e=>e.stopPropagation()}
                        >
                          {exercise.image_url
                            ? <img className="program-exercise-thumb" src={exercise.image_url} alt="" loading="lazy"/>
                            : <span className="program-exercise-thumb placeholder"><ImageIcon size={18}/></span>}
                        </Link>
                        <div>
                          <div className="chip-row compact-chips">
                            {exercise.primary_muscles.slice(0,2).map(code=><span className="muscle-chip primary" key={code}>{muscleName.get(code) ?? code}</span>)}
                            {isSuperset&&<span className="soft-chip superset-chip">Суперсет · {item.superset_position}/2</span>}
                            {(exercise.media?.some(media=>media.kind==='video'||media.kind==='animation')||exercise.video_url||exercise.animation_url)&&<span className="soft-chip program-media-chip"><Film size={11}/>Видео</span>}
                          </div>
                          <h3>{exercise.name}</h3>
                          <div className="program-prescription-summary">
                            <strong>{item.sets_min}×{compactReps(item)}</strong>
                            {item.rir_enabled&&<span>RIR {item.rir_min??'—'}{item.rir_max!=null&&item.rir_max!==item.rir_min?`–${item.rir_max}`:''}</span>}
                            <span>Отдых {compactRest(item.rest_seconds)}</span>
                            {item.warmup_enabled&&<span>+ разминка</span>}
                          </div>
                        </div>
                      </div>
                    </div>

                    {expanded&&<div className="program-item-details">
                      <div className="program-detail-head">
                        <span>Настройки упражнения</span>
                        <select className="role-select" value={item.exercise_role} onChange={e=>updateItem(item.local_id,{exercise_role:e.target.value as ProgramExerciseItem['exercise_role']})}>
                          <option value="main">Основное</option>
                          <option value="accessory">Дополнительное</option>
                          <option value="optional">Опционально</option>
                        </select>
                      </div>

                      <div className="prescription-grid">
                        <label><span>Подходы</span><input type="number" min="1" max="20" value={item.sets_min} onChange={e=>updateItem(item.local_id,{sets_min:Number(e.target.value)||1,sets_max:Number(e.target.value)||1})}/></label>
                        <label><span>Повторы</span><div className="range-input"><input type="number" min="1" value={item.reps_min ?? ''} onChange={e=>updateItem(item.local_id,{reps_min:toNullableNumber(e.target.value)})}/><i>—</i><input type="number" min="1" value={item.reps_max ?? ''} onChange={e=>updateItem(item.local_id,{reps_max:toNullableNumber(e.target.value)})}/></div></label>
                        <label><span>RIR</span>{item.rir_enabled
                          ? <div className="range-input"><input type="number" min="0" max="3" value={item.rir_min ?? ''} onChange={e=>updateItem(item.local_id,{rir_min:toNullableNumber(e.target.value)})}/><i>—</i><input type="number" min="0" max="3" value={item.rir_max ?? ''} onChange={e=>updateItem(item.local_id,{rir_max:toNullableNumber(e.target.value)})}/></div>
                          : <div className="disabled-field-note">не показывать</div>}
                        </label>
                        <label><span>Отдых</span><div className="rest-parts-input compact-rest">
                          <label><input type="number" min="0" max="30" value={Math.floor(item.rest_seconds/60)} onChange={e=>updateItem(item.local_id,{rest_seconds:restFromParts(item.rest_seconds,'minutes',e.target.value)})}/><span>мин</span></label>
                          <label><input type="number" min="0" max="59" value={item.rest_seconds%60} onChange={e=>updateItem(item.local_id,{rest_seconds:restFromParts(item.rest_seconds,'seconds',e.target.value)})}/><span>сек</span></label>
                        </div></label>
                      </div>

                      <div className="program-item-options">
                        <label className="mini-toggle"><ToggleSwitch checked={item.rir_enabled} onChange={value=>updateItem(item.local_id,{rir_enabled:value,rir_min:value?(item.rir_min ?? 1):null,rir_max:value?(item.rir_max ?? 2):null})}/><span>Показывать RIR клиенту</span></label>
                        <label className="mini-toggle"><ToggleSwitch checked={item.warmup_enabled} onChange={value=>updateItem(item.local_id,{warmup_enabled:value})}/><span>Разминка перед упражнением</span></label>
                        <label className="mini-toggle"><ToggleSwitch checked={item.allow_client_substitution} onChange={value=>updateItem(item.local_id,{allow_client_substitution:value})}/><span>Разрешить замену</span></label>
                        {exercise.substitution_groups.length>0 && <>
                          <select value={item.substitution_group_id} onChange={e=>updateItem(item.local_id,{substitution_group_id:e.target.value})}>
                            <option value="">Без группы замен</option>
                            {exercise.substitution_groups.map(group=><option value={group.id} key={group.id}>{group.name}</option>)}
                          </select>
                          {item.allow_client_substitution && item.substitution_group_id && (
                            <select className="substitution-policy-select" value={item.substitution_policy} onChange={e=>updateItem(item.local_id,{substitution_policy:e.target.value as ProgramExerciseItem['substitution_policy']})} title="Насколько широко клиент может выбирать замену">
                              <option value="strict">Только близкие замены</option>
                              <option value="flexible">+ допустимые варианты</option>
                              <option value="wide">+ запасные / широкая группа</option>
                            </select>
                          )}
                        </>}
                      </div>

                      {item.warmup_enabled && <div className="warmup-builder-row">
                        <span>Разминка</span>
                        <label><input type="number" min="10" max="100" value={item.warmup_load_percent_min} onChange={e=>updateItem(item.local_id,{warmup_load_percent_min:Number(e.target.value)||50})}/><small>%</small></label>
                        <i>—</i>
                        <label><input type="number" min="10" max="100" value={item.warmup_load_percent_max} onChange={e=>updateItem(item.local_id,{warmup_load_percent_max:Number(e.target.value)||60})}/><small>%</small></label>
                        <label><input type="number" min="1" max="30" value={item.warmup_reps_min} onChange={e=>updateItem(item.local_id,{warmup_reps_min:Number(e.target.value)||8})}/><small>повт.</small></label>
                        <i>—</i>
                        <label><input type="number" min="1" max="30" value={item.warmup_reps_max} onChange={e=>updateItem(item.local_id,{warmup_reps_max:Number(e.target.value)||10})}/><small>повт.</small></label>
                        <label><input type="number" min="15" max="300" step="15" value={item.warmup_rest_seconds} onChange={e=>updateItem(item.local_id,{warmup_rest_seconds:Math.max(15,Math.min(300,Number(e.target.value)||60))})}/><small>сек отдыха</small></label>
                      </div>}
                      {item.warmup_enabled && <input className="inline-note-input" value={item.warmup_notes} onChange={e=>updateItem(item.local_id,{warmup_notes:e.target.value})} placeholder="Подсказка по разминке"/>}
                      <input className="inline-note-input" value={item.notes} onChange={e=>updateItem(item.local_id,{notes:e.target.value})} placeholder="Комментарий тренера к упражнению — необязательно"/>
                    </div>}
                  </div>

                  <div className="program-item-actions">
                    <button className="icon-button program-expand-button" aria-label={expanded?'Свернуть настройки':'Развернуть настройки'} title={expanded?'Свернуть':'Все настройки'} aria-expanded={expanded} onClick={()=>toggleItemExpanded(item.local_id)}>{expanded?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>
                    {expanded&&<>
                      <button className="icon-button" aria-label="Поднять упражнение" title={isSuperset?'Поднять суперсет':'Поднять'} disabled={index===0} onClick={()=>moveItem(item.local_id,-1)}><ArrowUp size={15}/></button>
                      <button className="icon-button" aria-label="Опустить упражнение" title={isSuperset?'Опустить суперсет':'Опустить'} disabled={index===activeSession.items.length-1} onClick={()=>moveItem(item.local_id,1)}><ArrowDown size={15}/></button>
                      {item.superset_group==null
                        ? <button className={`icon-button ${pairingItemId===item.local_id?'is-active':''}`} aria-label="Объединить в суперсет" title="Объединить в суперсет" onClick={()=>setPairingItemId(current=>current===item.local_id?null:item.local_id)}><Link2 size={15}/></button>
                        : <button className="icon-button" aria-label="Разъединить суперсет" title="Разъединить суперсет" onClick={()=>detachItem(item.local_id)}><Unlink2 size={15}/></button>}
                      <button className="icon-button" aria-label="Заменить упражнение" title="Заменить упражнение" onClick={()=>openExercisePicker(item.local_id)}><RefreshCcw size={15}/></button>
                      <button className="icon-button danger" aria-label="Удалить упражнение" title="Удалить упражнение" onClick={()=>setPendingRemoval({kind:'item',id:item.local_id,label:exercise.name,isSuperset})}><Trash2 size={15}/></button>
                    </>}
                  </div>
                  {pairingItemId&&pairingItemId!==item.local_id&&item.superset_group==null&&<button className="program-pair-target" type="button" onClick={()=>pairItems(pairingItemId,item.local_id)}><Link2 size={15}/>Объединить сюда</button>}
                </article>
              )
            }

            const modality = refs.cardioModalities.find(mod=>mod.code===item.modality_code)
            return (
              <article
                className={`program-item cardio-program-item ${dropTarget?.itemId===item.local_id?`is-drop-${dropTarget.mode}`:''}`}
                key={item.local_id}
                onDragOver={e=>{
                  if(!draggedItemId||draggedItemId===item.local_id)return
                  e.preventDefault()
                  const rect=e.currentTarget.getBoundingClientRect()
                  const mode=(e.clientY-rect.top)<rect.height/2?'before':'after'
                  setDropTarget({itemId:item.local_id,mode})
                }}
                onDrop={e=>{e.preventDefault();if(dropTarget?.itemId===item.local_id)finishDrop(item.local_id,dropTarget.mode==='superset'?'after':dropTarget.mode)}}
              >
                {dropTarget?.itemId===item.local_id&&<div className={`program-drop-hint ${dropTarget.mode}`}>{dropTarget.mode==='before'?'Переместить выше':'Переместить ниже'}</div>}
                <div className="program-item-grip cardio" draggable role="button" tabIndex={0} aria-label="Перетащить кардио-блок" onDragStart={e=>{setDraggedItemId(item.local_id);e.dataTransfer.effectAllowed='move'}} onDragEnd={()=>{setDraggedItemId(null);setDropTarget(null)}}><GripVertical size={17}/></div>
                <div className="program-item-main">
                  <div className="program-item-title-row">
                    <div>
                      <div className="chip-row compact-chips"><span className="cardio-chip"><Activity size={12}/>Кардио</span></div>
                      <h3>{item.name || modality?.name || 'Кардио'}</h3>
                    </div>
                    <select value={item.modality_code} onChange={e=>updateItem(item.local_id,{modality_code:e.target.value})}>
                      {refs.cardioModalities.map(mod=><option key={mod.code} value={mod.code}>{mod.name}</option>)}
                    </select>
                  </div>

                  <div className="prescription-grid cardio-grid">
                    <label><span>Время</span><div className="suffix-input"><input type="number" min="1" value={item.duration_minutes ?? ''} onChange={e=>updateItem(item.local_id,{duration_minutes:toNullableNumber(e.target.value)})}/><small>мин</small></div></label>
                    <label><span>Пульс</span><div className="range-input"><input type="number" min="30" max="250" value={item.target_hr_min ?? ''} onChange={e=>updateItem(item.local_id,{target_hr_min:toNullableNumber(e.target.value)})}/><i>—</i><input type="number" min="30" max="250" value={item.target_hr_max ?? ''} onChange={e=>updateItem(item.local_id,{target_hr_max:toNullableNumber(e.target.value)})}/></div></label>
                    <label><span>Наклон</span><div className="suffix-input"><input type="number" min="0" max="40" step=".5" value={item.incline_percent ?? ''} onChange={e=>updateItem(item.local_id,{incline_percent:toNullableNumber(e.target.value)})}/><small>%</small></div></label>
                    <label><span>Скорость</span><div className="suffix-input"><input type="number" min="0" step=".1" value={item.speed_kmh ?? ''} onChange={e=>updateItem(item.local_id,{speed_kmh:toNullableNumber(e.target.value)})}/><small>км/ч</small></div></label>
                  </div>
                  <input className="inline-note-input" value={item.notes} onChange={e=>updateItem(item.local_id,{notes:e.target.value})} placeholder="Например: темп комфортный, можно говорить фразами"/>
                </div>
                <div className="program-item-actions">
                  <button className="icon-button" disabled={index===0} onClick={()=>moveItem(item.local_id,-1)}><ArrowUp size={15}/></button>
                  <button className="icon-button" disabled={index===activeSession.items.length-1} onClick={()=>moveItem(item.local_id,1)}><ArrowDown size={15}/></button>
                  <button className="icon-button danger" aria-label="Удалить кардио-блок" title="Удалить кардио-блок" onClick={()=>setPendingRemoval({kind:'item',id:item.local_id,label:item.name || modality?.name || 'Кардио',isSuperset:false})}><Trash2 size={15}/></button>
                </div>
              </article>
            )
          })}

          {activeSession.items.length===0 && <div className="program-empty">
            <div className="program-empty-icon"><Gauge size={22}/></div>
            <strong>Сессия пока пустая</strong>
            <span>Добавь упражнение из библиотеки или кардио-блок.</span>
          </div>}
        </div>

        <div className="program-add-bar">
          <button className="primary-button compact" onClick={()=>openExercisePicker()}><Plus size={16}/><Dumbbell size={16}/>Упражнение</button>
          <button className="ghost-button" onClick={addCardio}><Plus size={15}/><Bike size={16}/>Кардио</button>
        </div>
      </section>

      {notice && <div className="drawer-notice program-notice">{notice}</div>}

      <ConfirmActionSheet
        open={pendingRemoval!==null}
        eyebrow="Подтверждение удаления"
        destructive
        title={pendingRemoval?.kind==='session'
          ? `Удалить сессию «${pendingRemoval.label}»?`
          : `Удалить «${pendingRemoval?.label??''}»?`}
        message={pendingRemoval?.kind==='session'
          ? 'Сессия и все её упражнения/кардио будут удалены из текущей версии программы. Изменение применится после сохранения.'
          : pendingRemoval?.isSuperset
            ? 'Упражнение будет удалено из текущей версии, а оставшийся участник суперсета станет обычным упражнением. Изменение применится после сохранения.'
            : 'Этот блок будет удалён из текущей версии программы. Изменение применится после сохранения.'}
        confirmLabel="Удалить"
        onCancel={()=>setPendingRemoval(null)}
        onConfirm={()=>{
          if(!pendingRemoval)return
          if(pendingRemoval.kind==='session')removeSession(pendingRemoval.id)
          else removeItem(pendingRemoval.id)
          setPendingRemoval(null)
        }}
      />

      {pickerOpen && <div className="drawer-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target){setPickerOpen(false);setReplaceItemId(null)}}}>
        <aside className="exercise-drawer program-picker">
          <div className="drawer-head">
            <div><span className="eyebrow">Библиотека</span><h3>{replaceItemId?'Заменить упражнение':'Добавить упражнение'}</h3></div>
            <button className="icon-button" onClick={()=>{setPickerOpen(false);setReplaceItemId(null)}}><X size={18}/></button>
          </div>
          <div className="drawer-body">
            <div className="search-box"><Search size={17}/><input value={exerciseQuery} onChange={e=>setExerciseQuery(e.target.value)} placeholder="Найти упражнение"/></div>
            {replaceItemId&&replacingExercise&&<div className="replacement-scope-panel">
              <div className="replacement-scope-copy"><strong>Замена для «{replacingExercise.name}»</strong><span>Сначала показываем упражнения с максимально похожей функцией. При необходимости открой всю библиотеку.</span></div>
              <div className="selectable-chip-row replacement-scope-switch">
                <button className={`selectable-chip ${replacementScope==='recommended'?'is-selected':''}`} onClick={()=>setReplacementScope('recommended')}>Близкие замены</button>
                <button className={`selectable-chip ${replacementScope==='all'?'is-selected':''}`} onClick={()=>setReplacementScope('all')}>Вся библиотека</button>
              </div>
            </div>}
            <div className="selectable-chip-row">
              <button className={`selectable-chip ${!muscleFilter?'is-selected':''}`} onClick={()=>setMuscleFilter('')}>Все мышцы</button>
              {refs.library.muscles.map(m=><button key={m.code} className={`selectable-chip ${muscleFilter===m.code?'is-selected':''}`} onClick={()=>setMuscleFilter(m.code)}>{m.name}</button>)}
            </div>
            <div className="selectable-chip-row equipment-filter-row">
              <button className={`selectable-chip ${!equipmentFilter?'is-selected':''}`} onClick={()=>setEquipmentFilter('')}>Любое оборудование</button>
              {equipmentTags.map(tag=><button key={tag.slug} className={`selectable-chip ${equipmentFilter===tag.slug?'is-selected':''}`} onClick={()=>setEquipmentFilter(tag.slug)}>{tag.name}</button>)}
            </div>
            <div className="program-exercise-picker-list">
              {filteredExercises.map(exercise=>(
                <button className="program-exercise-pick" key={exercise.id} onClick={()=>addExercise(exercise.id)}>
                  <div className="exercise-avatar">{exercise.image_url ? <img src={exercise.image_url} alt="" loading="lazy"/> : <Dumbbell size={19}/>}</div>
                  <div>
                    <strong>{exercise.name}</strong>
                    <small className="picker-exercise-meta">{exercise.exercise_type==='compound'?'Базовое':'Изоляция'} · отдых {Math.floor(exercise.default_rest_seconds/60)}:{String(exercise.default_rest_seconds%60).padStart(2,'0')}</small>
                    <div className="chip-row compact-chips">
                      {exercise.primary_muscles.slice(0,2).map(code=><span className="muscle-chip primary" key={code}>{muscleName.get(code) ?? code}</span>)}
                      {exercise.tags.slice(0,2).map(tag=><span className="soft-chip" key={tag.id}>{tag.name}</span>)}
                    </div>
                  </div>
                  <ChevronRight size={17}/>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>}
    </div>
  )
}
