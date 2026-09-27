import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowDown, ArrowUp, Bike, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  Dumbbell, Gauge, GripVertical, Plus, Save, Search, Trash2, X
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { activateTrainingProgram, createTrainingProgram, loadProgramBuilderReferences } from '../features/programs/service'
import { loadExerciseLibrary } from '../features/exercises/service'
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

export function ProgramBuilderPage({ preview }: Props) {
  const [refs, setRefs] = useState<ProgramBuilderReferences>(previewReferences)
  const [draft, setDraft] = useState<TrainingProgramDraft>(initialDraft)
  const [activeSessionId, setActiveSessionId] = useState(initialDraft.sessions[0].local_id)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [savedProgramId,setSavedProgramId] = useState<string | null>(null)
  const [published,setPublished] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [exerciseQuery, setExerciseQuery] = useState('')
  const [muscleFilter, setMuscleFilter] = useState('')
  const [defaultRirEnabled,setDefaultRirEnabled] = useState(true)

  useEffect(() => {
    setLoading(true)
    if (preview) {
      loadExerciseLibrary()
        .then(library => setRefs(current => ({...current, library})))
        .catch(error => setNotice(error instanceof Error ? error.message : 'Не удалось загрузить библиотеку упражнений'))
        .finally(()=>setLoading(false))
      return
    }

    loadProgramBuilderReferences()
      .then(setRefs)
      .catch(error => setNotice(error instanceof Error ? error.message : 'Не удалось загрузить справочники'))
      .finally(()=>setLoading(false))
  }, [preview])

  const activeIndex = Math.max(0, draft.sessions.findIndex(session => session.local_id === activeSessionId))
  const activeSession = draft.sessions[activeIndex] ?? draft.sessions[0]
  const exerciseById = useMemo(() => new Map(refs.library.exercises.map(item => [item.id,item])), [refs])
  const muscleName = useMemo(() => new Map(refs.library.muscles.map(item => [item.code,item.name])), [refs])

  const filteredExercises = useMemo(() => {
    const q = exerciseQuery.trim().toLocaleLowerCase('ru')
    return refs.library.exercises.filter(exercise => {
      const queryHit = !q || [exercise.name, ...exercise.aliases, exercise.description ?? '', ...exercise.tags.map(t=>t.name)]
        .join(' ').toLocaleLowerCase('ru').includes(q)
      const muscleHit = !muscleFilter || exercise.primary_muscles.includes(muscleFilter)
      return exercise.is_active && queryHit && muscleHit
    })
  }, [refs, exerciseQuery, muscleFilter])

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

  function addExercise(exerciseId: string) {
    const exercise = exerciseById.get(exerciseId)
    if (!exercise) return
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
      warmup_notes:'Разогреться без утомления перед первым рабочим сетом.',
      allow_client_substitution:exercise.substitution_groups.length>0,
      substitution_policy:'strict',
      notes:'',
      progression_notes:'',
    }
    updateSession({items:[...activeSession.items,item]})
    setPickerOpen(false)
    setExerciseQuery('')
  }

  function applyStarterFullBody() {
    const specs = [
      {code:'BACK_MID_CABLE_ROW',sets:2,reps:[8,12],rest:120,role:'main',warmup:true},
      {code:'CHEST_MACHINE_PRESS',sets:2,reps:[8,12],rest:120,role:'main',warmup:true},
      {code:'BACK_LAT_NEUTRAL_PULL',sets:2,reps:[8,12],rest:120,role:'main',warmup:false},
      {code:'HAMSTRING_SEATED_CURL',sets:2,reps:[10,15],rest:90,role:'accessory',warmup:false},
      {code:'DELTS_SIDE_DB_RAISE',sets:2,reps:[12,20],rest:75,role:'accessory',warmup:false},
      {code:'CORE_CABLE_CRUNCH',sets:2,reps:[10,15],rest:75,role:'accessory',warmup:false},
      {code:'CALVES_STANDING_RAISE',sets:1,reps:[10,15],rest:75,role:'accessory',warmup:false},
      {code:'QUAD_GLUTE_LEG_PRESS',sets:2,reps:[8,12],rest:120,role:'main',warmup:true},
      {code:'BICEPS_CABLE_CURL',sets:1,reps:[10,15],rest:75,role:'accessory',warmup:false},
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
      planned_duration_minutes:60,
      notes:'Выполнять 3 раза в неделю, желательно оставляя хотя бы один день между силовыми.',
      items:specs.map(spec=>{
        const exercise=refs.library.exercises.find(ex=>ex.code===spec.code)!
        const group=exercise.substitution_groups.find(g=>g.is_default) ?? exercise.substitution_groups[0]
        const item:ProgramExerciseItem={
          local_id:uid(),type:'exercise',exercise_id:exercise.id,
          substitution_group_id:group?.id??'',
          exercise_role:spec.role,
          sets_min:spec.sets,sets_max:spec.sets,reps_min:spec.reps[0],reps_max:spec.reps[1],
          rir_enabled:true,rir_min:1,rir_max:2,rest_seconds:spec.rest,
          warmup_enabled:'warmup' in spec ? spec.warmup : false,
          warmup_load_percent_min:50,warmup_load_percent_max:60,warmup_reps_min:8,warmup_reps_max:10,
          warmup_notes:'Примерно 50–60% рабочего веса × 8–10 спокойных повторений. Не до утомления.',
          allow_client_substitution:Boolean(group),substitution_policy:'strict',
          notes:'Остановись, когда уверен, что осталось ещё 1–2 чистых повтора.',
          progression_notes:'Когда верхняя граница повторов выполнена во всех рабочих подходах при RIR 1–2 — немного увеличить вес.',
        }
        return item
      }),
    }
    setDraft(current=>({
      ...current,
      name:'Full Body — старт',
      description:'Одна и та же силовая сессия 3 раза в неделю. Первые недели — техника, стабильность и постепенная двойная прогрессия без обязательного отказа.',
      weekly_frequency:3,
      sessions:[session],
    }))
    setActiveSessionId(session.local_id)
    setDefaultRirEnabled(true)
    setSavedProgramId(null)
    setPublished(false)
    setNotice('Загружен пресет Full Body — старт. Можно подправить упражнения и назначить клиенту.')
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
    updateSession({items:activeSession.items.filter(item=>item.local_id!==localId)})
  }

  function moveItem(localId: string, direction: -1 | 1) {
    const items = [...activeSession.items]
    const index = items.findIndex(item=>item.local_id===localId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= items.length) return
    ;[items[index],items[target]] = [items[target],items[index]]
    updateSession({items})
  }

  function onClientChange(clientId: string) {
    setSavedProgramId(null)
    setPublished(false)
    setDraft(current=>({...current,client_id:clientId,is_template:!clientId}))
  }

  async function saveProgram() {
    setNotice('')
    if (!draft.name.trim()) return setNotice('Укажи название программы.')
    if (!draft.sessions.length) return setNotice('Добавь хотя бы одну сессию.')
    if (draft.sessions.some(session=>session.items.length===0)) return setNotice('В каждой сессии должен быть хотя бы один блок.')

    if (preview) {
      setSavedProgramId('preview-program')
      setNotice('Черновик сохранён в предпросмотре. Можно проверить сценарий публикации клиенту.')
      return
    }

    setSaving(true)
    try {
      const id = await createTrainingProgram(draft)
      setSavedProgramId(id)
      setPublished(false)
      setNotice('Черновик программы сохранён.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось сохранить программу')
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

    setSaving(true)
    setNotice('')
    try {
      if (!preview) await activateTrainingProgram(savedProgramId)
      setPublished(true)
      setNotice('Программа опубликована клиенту и стала активной.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось опубликовать программу')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="library-empty">Загружаю конструктор…</div>

  return (
    <div className="page-stack program-builder-page">
      <div className="workspace-back"><Link to="/builder"><ChevronLeft size={17}/>Конструктор</Link></div>

      <section className="program-builder-head">
        <div>
          <span className="eyebrow">Программа тренировок</span>
          <h2>Собери план из сессий и блоков</h2>
          <p>Одна Full Body или несколько силовых и кардио-сессий — структура подстраивается под клиента, а не наоборот.</p>
        </div>
        <div className="program-head-actions">
          <button className="ghost-button light-ghost" disabled={saving} onClick={applyStarterFullBody}><Dumbbell size={16}/>Full Body — старт</button>
          <button className="ghost-button light-ghost" disabled={saving} onClick={()=>void saveProgram()}><Save size={16}/>{savedProgramId?'Сохранить новый черновик':'Сохранить черновик'}</button>
          {draft.client_id && savedProgramId && <button className="primary-button compact" disabled={saving||published} onClick={()=>void publishProgram()}><CheckCircle2 size={16}/>{published?'Опубликована':'Опубликовать клиенту'}</button>}
        </div>
      </section>

      <section className="panel program-basics">
        <div className="form-grid-3">
          <label className="field-label">Название программы<input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
          <label className="field-label">Для кого
            <select value={draft.client_id} onChange={e=>onClientChange(e.target.value)}>
              <option value="">Шаблон без клиента</option>
              {refs.clients.map(client=><option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
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
              {draft.sessions.length>1 && session.local_id===activeSession.local_id && <X size={14} onClick={e=>{e.stopPropagation();removeSession(session.local_id)}}/>}
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

        <div className="program-items">
          {activeSession.items.map((item,index)=>{
            if (item.type === 'exercise') {
              const exercise = exerciseById.get(item.exercise_id)
              if (!exercise) return null
              return (
                <article className="program-item exercise-program-item" key={item.local_id}>
                  <div className="program-item-grip"><GripVertical size={17}/></div>
                  <div className="program-item-main">
                    <div className="program-item-title-row">
                      <div className="program-item-identity">
                        {exercise.image_url ? <img className="program-exercise-thumb" src={exercise.image_url} alt="" loading="lazy"/> : null}
                        <div>
                        <div className="chip-row compact-chips">
                          {exercise.primary_muscles.slice(0,2).map(code=><span className="muscle-chip primary" key={code}>{muscleName.get(code) ?? code}</span>)}
                          <span className="soft-chip">{exercise.exercise_type==='compound'?'базовое':exercise.exercise_type==='isolation'?'изоляция':'кардио'}</span>
                        </div>
                        <h3>{exercise.name}</h3>
                        </div>
                      </div>
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
                          <select
                            className="substitution-policy-select"
                            value={item.substitution_policy}
                            onChange={e=>updateItem(item.local_id,{substitution_policy:e.target.value as ProgramExerciseItem['substitution_policy']})}
                            title="Насколько широко клиент может выбирать замену"
                          >
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
                    </div>}
                    {item.warmup_enabled && <input className="inline-note-input" value={item.warmup_notes} onChange={e=>updateItem(item.local_id,{warmup_notes:e.target.value})} placeholder="Подсказка по разминке"/>}
                    <input className="inline-note-input" value={item.notes} onChange={e=>updateItem(item.local_id,{notes:e.target.value})} placeholder="Комментарий тренера к упражнению — необязательно"/>
                  </div>

                  <div className="program-item-actions">
                    <button className="icon-button" disabled={index===0} onClick={()=>moveItem(item.local_id,-1)}><ArrowUp size={15}/></button>
                    <button className="icon-button" disabled={index===activeSession.items.length-1} onClick={()=>moveItem(item.local_id,1)}><ArrowDown size={15}/></button>
                    <button className="icon-button danger" onClick={()=>removeItem(item.local_id)}><Trash2 size={15}/></button>
                  </div>
                </article>
              )
            }

            const modality = refs.cardioModalities.find(mod=>mod.code===item.modality_code)
            return (
              <article className="program-item cardio-program-item" key={item.local_id}>
                <div className="program-item-grip cardio"><GripVertical size={17}/></div>
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
                  <button className="icon-button danger" onClick={()=>removeItem(item.local_id)}><Trash2 size={15}/></button>
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
          <button className="primary-button compact" onClick={()=>setPickerOpen(true)}><Plus size={16}/><Dumbbell size={16}/>Упражнение</button>
          <button className="ghost-button" onClick={addCardio}><Plus size={15}/><Bike size={16}/>Кардио</button>
        </div>
      </section>

      {notice && <div className="drawer-notice program-notice">{notice}</div>}

      {pickerOpen && <div className="drawer-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setPickerOpen(false)}}>
        <aside className="exercise-drawer program-picker">
          <div className="drawer-head">
            <div><span className="eyebrow">Библиотека</span><h3>Добавить упражнение</h3></div>
            <button className="icon-button" onClick={()=>setPickerOpen(false)}><X size={18}/></button>
          </div>
          <div className="drawer-body">
            <div className="search-box"><Search size={17}/><input value={exerciseQuery} onChange={e=>setExerciseQuery(e.target.value)} placeholder="Найти упражнение"/></div>
            <div className="selectable-chip-row">
              <button className={`selectable-chip ${!muscleFilter?'is-selected':''}`} onClick={()=>setMuscleFilter('')}>Все</button>
              {refs.library.muscles.map(m=><button key={m.code} className={`selectable-chip ${muscleFilter===m.code?'is-selected':''}`} onClick={()=>setMuscleFilter(m.code)}>{m.name}</button>)}
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
