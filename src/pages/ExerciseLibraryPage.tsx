import { useEffect, useMemo, useState } from 'react'
import {
  Clock3, Dumbbell, ExternalLink, Info, Pencil, Plus, Repeat2,
  Search, Tags, TriangleAlert, X
} from 'lucide-react'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { createSubstitutionGroup, loadExerciseLibrary, saveExercise } from '../features/exercises/service'
import type { Exercise, ExerciseDraft, ExerciseLibraryData, SubstitutionGroup } from '../features/exercises/types'

type Props = { preview: boolean }

const previewGroup = (
  id: string, code: string, name: string, purpose: string, scope: 'specific' | 'broad' = 'specific'
): SubstitutionGroup => ({ id, code, name, purpose, scope, parent_group_id:null })

const previewData: ExerciseLibraryData = {
  muscles: [
    { code:'chest', name:'Грудь', parent_code:null, sort_order:10 },
    { code:'chest_upper', name:'Верх груди', parent_code:'chest', sort_order:11 },
    { code:'back', name:'Спина', parent_code:null, sort_order:20 },
    { code:'back_mid', name:'Середина спины', parent_code:'back', sort_order:21 },
    { code:'lats', name:'Широчайшие', parent_code:null, sort_order:30 },
    { code:'delts_front', name:'Передняя дельта', parent_code:null, sort_order:40 },
    { code:'delts_side', name:'Средняя дельта', parent_code:null, sort_order:50 },
    { code:'triceps', name:'Трицепс', parent_code:null, sort_order:80 },
    { code:'quads', name:'Квадрицепс', parent_code:null, sort_order:90 },
    { code:'glutes', name:'Ягодицы', parent_code:null, sort_order:110 },
  ],
  equipment: [
    { code:'bodyweight', name:'Собственный вес', sort_order:10 },
    { code:'dumbbell', name:'Гантели', sort_order:20 },
    { code:'barbell', name:'Штанга', sort_order:30 },
    { code:'smith', name:'Машина Смита', sort_order:40 },
    { code:'cable', name:'Кроссовер / блок', sort_order:50 },
    { code:'machine', name:'Тренажёр', sort_order:60 },
  ],
  patterns: [
    { code:'incline_push', name:'Наклонный жим', sort_order:20 },
    { code:'horizontal_pull', name:'Горизонтальная тяга', sort_order:40 },
    { code:'vertical_pull', name:'Вертикальная тяга', sort_order:50 },
    { code:'squat', name:'Присед / жим ногами', sort_order:60 },
    { code:'lateral_raise', name:'Отведение плеча', sort_order:130 },
  ],
  substitutionGroups: [
    previewGroup('sg-1','CHEST_UPPER_PRESS','Жимы на верх груди','Близкие варианты наклонного жима'),
    previewGroup('sg-2','BACK_HORIZONTAL_ROW','Горизонтальные тяги','Тяги к корпусу'),
  ],
  exercises: [
    {
      id:'ex-1', code:'CHEST_UPPER_DB_PRESS', name:'Жим гантелей на наклонной скамье 25–35°',
      description:'Многосуставной жим с акцентом на верхнюю часть груди.',
      instructions:'Опускай гантели подконтрольно к верхней части груди и выжимай вверх, сохраняя стабильные лопатки.',
      setup_notes:'Угол 25–35°, стопы устойчиво на полу, лопатки сведены и опущены.',
      common_mistakes:'Слишком высокий угол; плечи уходят вперёд; сокращение амплитуды ради веса.',
      mechanics:'compound', equipment_code:'dumbbell', movement_pattern_code:'incline_push',
      default_rest_seconds:150, technique_url:'', is_unilateral:false, is_active:true,
      primary_muscle:'chest_upper', primary_muscles:['chest_upper'],
      secondary_muscles:['triceps','delts_front'], stabilizer_muscles:[], tags:[],
      substitution_groups:[{
        ...previewGroup('sg-1','CHEST_UPPER_PRESS','Жимы на верх груди','Близкие варианты наклонного жима'),
        priority:10,is_default:true,match_type:'direct',membership_notes:'Основной вариант',
      }],
    },
    {
      id:'ex-2', code:'BACK_MID_CABLE_ROW', name:'Горизонтальная тяга в блочном тренажёре',
      description:'Многосуставная горизонтальная тяга для середины спины.',
      instructions:'Тяни рукоять к нижним рёбрам, ведя локти назад; не раскачивай корпус.',
      setup_notes:'Нейтральный позвоночник, грудь открыта, плечи опущены.',
      common_mistakes:'Раскачка; тяга только руками; чрезмерное отклонение корпуса.',
      mechanics:'compound', equipment_code:'cable', movement_pattern_code:'horizontal_pull',
      default_rest_seconds:150, technique_url:'', is_unilateral:false, is_active:true,
      primary_muscle:'back_mid', primary_muscles:['back_mid'],
      secondary_muscles:['lats'], stabilizer_muscles:[], tags:[],
      substitution_groups:[{
        ...previewGroup('sg-2','BACK_HORIZONTAL_ROW','Горизонтальные тяги','Тяги к корпусу'),
        priority:10,is_default:true,match_type:'direct',membership_notes:null,
      }],
    },
  ],
}

const emptyDraft: ExerciseDraft = {
  name:'',
  description:'',
  instructions:'',
  setup_notes:'',
  common_mistakes:'',
  mechanics:'',
  equipment_code:'',
  movement_pattern_code:'',
  default_rest_seconds:120,
  technique_url:'',
  is_unilateral:false,
  is_active:true,
  primary_muscle:'',
  secondary_muscles:[],
  tags:[],
  substitution_group_ids:[],
}

function draftFromExercise(exercise: Exercise): ExerciseDraft {
  return {
    id:exercise.id,
    name:exercise.name,
    description:exercise.description ?? '',
    instructions:exercise.instructions ?? '',
    setup_notes:exercise.setup_notes ?? '',
    common_mistakes:exercise.common_mistakes ?? '',
    mechanics:exercise.mechanics ?? '',
    equipment_code:exercise.equipment_code ?? '',
    movement_pattern_code:exercise.movement_pattern_code ?? '',
    default_rest_seconds:exercise.default_rest_seconds,
    technique_url:exercise.technique_url ?? '',
    is_unilateral:exercise.is_unilateral,
    is_active:exercise.is_active,
    primary_muscle:exercise.primary_muscle ?? '',
    secondary_muscles:exercise.secondary_muscles,
    tags:exercise.tags.map(tag=>tag.name),
    substitution_group_ids:exercise.substitution_groups.map(group=>group.id),
  }
}

function secondsLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}:${String(rest).padStart(2,'0')}` : `${minutes} мин`
}

function matchLabel(match: 'direct' | 'acceptable' | 'fallback') {
  if (match === 'direct') return 'прямая'
  if (match === 'acceptable') return 'допустимая'
  return 'запасная'
}

export function ExerciseLibraryPage({ preview }: Props) {
  const [data, setData] = useState<ExerciseLibraryData>(previewData)
  const [loading, setLoading] = useState(!preview)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [muscleFilter, setMuscleFilter] = useState('')
  const [equipmentFilter, setEquipmentFilter] = useState('')
  const [mechanicsFilter, setMechanicsFilter] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<ExerciseDraft>(emptyDraft)
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [newGroupName, setNewGroupName] = useState('')

  async function refresh() {
    if (preview) return
    setLoading(true); setError('')
    try { setData(await loadExerciseLibrary()) }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить библиотеку') }
    finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [preview])

  const muscleNames = useMemo(() => new Map(data.muscles.map(item=>[item.code,item.name])), [data.muscles])
  const equipmentNames = useMemo(() => new Map(data.equipment.map(item=>[item.code,item.name])), [data.equipment])
  const patternNames = useMemo(() => new Map(data.patterns.map(item=>[item.code,item.name])), [data.patterns])

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru')
    return data.exercises.filter(exercise => {
      const allMuscles = [...exercise.primary_muscles,...exercise.secondary_muscles,...exercise.stabilizer_muscles]
      const matchesQuery = !q || [
        exercise.name, exercise.description ?? '', exercise.code,
        exercise.tags.map(tag=>tag.name).join(' '),
        allMuscles.map(code=>muscleNames.get(code) ?? code).join(' '),
      ].join(' ').toLocaleLowerCase('ru').includes(q)
      const matchesMuscle = !muscleFilter || allMuscles.includes(muscleFilter)
      const matchesEquipment = !equipmentFilter || exercise.equipment_code === equipmentFilter
      const matchesMechanics = !mechanicsFilter || exercise.mechanics === mechanicsFilter
      return matchesQuery && matchesMuscle && matchesEquipment && matchesMechanics
    })
  }, [data.exercises,query,muscleFilter,equipmentFilter,mechanicsFilter,muscleNames])

  function openCreate() {
    setDraft(emptyDraft); setTagInput(''); setNotice(''); setEditorOpen(true)
  }

  function openEdit(exercise: Exercise) {
    setDraft(draftFromExercise(exercise)); setTagInput(''); setNotice(''); setEditorOpen(true)
  }

  function toggleSecondary(code: string) {
    setDraft(current=>({
      ...current,
      secondary_muscles:current.secondary_muscles.includes(code)
        ? current.secondary_muscles.filter(item=>item!==code)
        : [...current.secondary_muscles,code],
    }))
  }

  function addTag() {
    const value = tagInput.trim().replace(/^#/,'')
    if (!value || draft.tags.some(tag=>tag.toLocaleLowerCase('ru')===value.toLocaleLowerCase('ru'))) {
      setTagInput(''); return
    }
    setDraft(current=>({...current,tags:[...current.tags,value]})); setTagInput('')
  }

  async function submit() {
    if (!draft.name.trim()) return setNotice('Укажи название упражнения.')
    if (!draft.primary_muscle) return setNotice('Выбери основную группу мышц.')
    if (!draft.mechanics) return setNotice('Укажи: многосуставное или изолирующее.')

    if (preview) {
      const id = draft.id ?? `preview-${Date.now()}`
      const existing = data.exercises.find(item=>item.id===draft.id)
      const exercise: Exercise = {
        id,
        code:existing?.code ?? `EX_${Date.now()}`,
        name:draft.name.trim(),
        description:draft.description.trim() || null,
        instructions:draft.instructions.trim() || null,
        setup_notes:draft.setup_notes.trim() || null,
        common_mistakes:draft.common_mistakes.trim() || null,
        mechanics:draft.mechanics || null,
        equipment_code:draft.equipment_code || null,
        movement_pattern_code:draft.movement_pattern_code || null,
        default_rest_seconds:draft.default_rest_seconds,
        technique_url:draft.technique_url.trim() || null,
        is_unilateral:draft.is_unilateral,
        is_active:draft.is_active,
        primary_muscle:draft.primary_muscle,
        primary_muscles:[draft.primary_muscle],
        secondary_muscles:draft.secondary_muscles,
        stabilizer_muscles:[],
        tags:draft.tags.map((name,index)=>({id:`preview-tag-${index}`,name,slug:name.toLocaleLowerCase('ru').replace(/\s+/g,'-')})),
        substitution_groups:existing?.substitution_groups ?? [],
      }
      setData(current=>({...current,exercises:draft.id
        ? current.exercises.map(item=>item.id===draft.id?exercise:item)
        : [exercise,...current.exercises]}))
      setNotice('Сохранено в предпросмотре.')
      setTimeout(()=>setEditorOpen(false),450)
      return
    }

    setSaving(true); setNotice('')
    try { await saveExercise(draft); await refresh(); setEditorOpen(false) }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Не удалось сохранить упражнение') }
    finally { setSaving(false) }
  }

  async function addSubstitutionGroup() {
    const name = newGroupName.trim()
    if (!name) return
    if (preview) {
      const group: SubstitutionGroup = {
        id:`preview-group-${Date.now()}`, code:`PREVIEW_${Date.now()}`,
        name,purpose:null,scope:'specific',parent_group_id:null,
      }
      setData(current=>({...current,substitutionGroups:[...current.substitutionGroups,group]}))
      setDraft(current=>({...current,substitution_group_ids:[...current.substitution_group_ids,group.id]}))
      setNewGroupName(''); return
    }
    try {
      const group=await createSubstitutionGroup(name)
      setData(current=>({...current,substitutionGroups:[...current.substitutionGroups,group]}))
      setDraft(current=>({...current,substitution_group_ids:[...current.substitution_group_ids,group.id]}))
      setNewGroupName('')
    } catch(e) {
      setNotice(e instanceof Error ? e.message : 'Не удалось создать группу замен')
    }
  }

  const editingExercise = draft.id ? data.exercises.find(item=>item.id===draft.id) : undefined

  return (
    <div className="page-stack exercise-library-page">
      <section className="exercise-library-hero">
        <div>
          <span className="eyebrow">Библиотека упражнений</span>
          <h2>Упражнение хранит смысл, а программа — назначение</h2>
          <p>Мышцы, механика, техника, оборудование и базовый отдых живут в справочнике. Роль «основное / дополнительное» задаётся уже внутри конкретной программы.</p>
        </div>
        <button className="primary-button compact" onClick={openCreate}><Plus size={17}/>Добавить упражнение</button>
      </section>

      <section className="exercise-toolbar exercise-toolbar-4">
        <div className="search-box exercise-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Название, код, мышца или тег"/></div>
        <select value={muscleFilter} onChange={e=>setMuscleFilter(e.target.value)}>
          <option value="">Все мышцы</option>
          {data.muscles.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
        <select value={equipmentFilter} onChange={e=>setEquipmentFilter(e.target.value)}>
          <option value="">Всё оборудование</option>
          {data.equipment.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
        <select value={mechanicsFilter} onChange={e=>setMechanicsFilter(e.target.value)}>
          <option value="">Любой тип</option>
          <option value="compound">Многосуставные</option>
          <option value="isolation">Изолирующие</option>
        </select>
      </section>

      {preview && <div className="preview-inline-note">Предпросмотр показывает механику кабинета. Реальная библиотека уже хранится в Supabase и появится после входа тренера.</div>}
      {error && <div className="form-error">{error}</div>}

      <div className="exercise-library-summary">
        <span><strong>{filtered.length}</strong> упражнений</span>
        {muscleFilter && <button onClick={()=>setMuscleFilter('')} className="filter-chip">{muscleNames.get(muscleFilter)} <X size={12}/></button>}
        {equipmentFilter && <button onClick={()=>setEquipmentFilter('')} className="filter-chip">{equipmentNames.get(equipmentFilter)} <X size={12}/></button>}
        {mechanicsFilter && <button onClick={()=>setMechanicsFilter('')} className="filter-chip">{mechanicsFilter==='compound'?'Многосуставные':'Изолирующие'} <X size={12}/></button>}
      </div>

      {loading ? <div className="library-empty">Загружаю библиотеку…</div> : (
        <div className="exercise-library-grid">
          {filtered.map(exercise=>(
            <article className="exercise-library-card" key={exercise.id}>
              <div className="exercise-card-main">
                <div className="exercise-avatar"><Dumbbell size={22}/></div>
                <div className="exercise-library-title">
                  <div className="chip-row">
                    {exercise.primary_muscles.map(code=><span className="muscle-chip primary" key={code}>{muscleNames.get(code) ?? code}</span>)}
                    {exercise.secondary_muscles.slice(0,2).map(code=><span className="muscle-chip" key={code}>{muscleNames.get(code) ?? code}</span>)}
                  </div>
                  <h3>{exercise.name}</h3>
                  <p>{exercise.description || patternNames.get(exercise.movement_pattern_code ?? '') || 'Описание можно добавить позже'}</p>
                </div>
                <button className="icon-button" onClick={()=>openEdit(exercise)} title="Редактировать"><Pencil size={17}/></button>
              </div>

              <div className="exercise-facts">
                <span className={exercise.mechanics==='compound'?'fact-strong':''}>
                  {exercise.mechanics==='compound'?'Многосуставное':exercise.mechanics==='isolation'?'Изолирующее':'Тип не указан'}
                </span>
                {exercise.equipment_code && <span><Dumbbell size={14}/>{equipmentNames.get(exercise.equipment_code) ?? exercise.equipment_code}</span>}
                <span><Clock3 size={14}/>{secondsLabel(exercise.default_rest_seconds)}</span>
                <span><Repeat2 size={14}/>{exercise.substitution_groups.length ? `${exercise.substitution_groups.length} групп замен` : 'Без группы замен'}</span>
              </div>

              {exercise.substitution_groups.length>0 && <div className="replacement-preview">
                {exercise.substitution_groups.slice(0,3).map(group=>(
                  <span key={group.id} className={`replacement-pill ${group.match_type}`}>
                    {group.name} · {matchLabel(group.match_type)}
                  </span>
                ))}
              </div>}

              <div className="exercise-card-footer">
                <button className="text-button" onClick={()=>openEdit(exercise)}><Info size={15}/>Техника и настройки</button>
                {exercise.technique_url && <a className="text-button" href={exercise.technique_url} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Видео</a>}
              </div>
            </article>
          ))}
          {filtered.length===0 && <div className="library-empty">Ничего не найдено. Сними фильтр или добавь новое упражнение.</div>}
        </div>
      )}

      {editorOpen && <div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditorOpen(false)}}>
        <aside className="exercise-drawer">
          <div className="drawer-head">
            <div><span className="eyebrow">{draft.id?'Редактирование':'Новое упражнение'}</span><h3>{draft.id?draft.name:'Добавить в библиотеку'}</h3></div>
            <button className="icon-button" onClick={()=>setEditorOpen(false)}><X size={18}/></button>
          </div>

          <div className="drawer-body">
            <label className="field-label">Название<input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="Например, жим гантелей на наклонной"/></label>

            <div className="form-grid-2">
              <label className="field-label">Основная мышца
                <select value={draft.primary_muscle} onChange={e=>setDraft({...draft,primary_muscle:e.target.value,secondary_muscles:draft.secondary_muscles.filter(x=>x!==e.target.value)})}>
                  <option value="">Выбрать</option>
                  {data.muscles.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
                </select>
              </label>
              <label className="field-label">Механика
                <select value={draft.mechanics} onChange={e=>setDraft({...draft,mechanics:e.target.value as ExerciseDraft['mechanics']})}>
                  <option value="">Выбрать</option>
                  <option value="compound">Многосуставное</option>
                  <option value="isolation">Изолирующее</option>
                </select>
              </label>
            </div>

            <div className="field-block">
              <span className="field-label-text">Дополнительные мышцы</span>
              <div className="selectable-chip-row">
                {data.muscles.filter(item=>item.code!==draft.primary_muscle).map(item=>(
                  <button type="button" key={item.code} className={`selectable-chip ${draft.secondary_muscles.includes(item.code)?'is-selected':''}`} onClick={()=>toggleSecondary(item.code)}>{item.name}</button>
                ))}
              </div>
            </div>

            <div className="form-grid-2">
              <label className="field-label">Паттерн движения
                <select value={draft.movement_pattern_code} onChange={e=>setDraft({...draft,movement_pattern_code:e.target.value})}>
                  <option value="">Не указано</option>
                  {data.patterns.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
                </select>
              </label>
              <label className="field-label">Оборудование
                <select value={draft.equipment_code} onChange={e=>setDraft({...draft,equipment_code:e.target.value})}>
                  <option value="">Не указано</option>
                  {data.equipment.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}
                </select>
              </label>
            </div>

            <label className="field-label">Рекомендуемый отдых по умолчанию, сек.
              <input type="number" min="15" max="1800" step="15" value={draft.default_rest_seconds} onChange={e=>setDraft({...draft,default_rest_seconds:Math.max(15,Number(e.target.value)||120)})}/>
            </label>

            <label className="field-label">Короткое описание<textarea value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} rows={2} placeholder="Для чего упражнение и чем оно отличается"/></label>
            <label className="field-label">Настройка / исходное положение<textarea value={draft.setup_notes} onChange={e=>setDraft({...draft,setup_notes:e.target.value})} rows={2} placeholder="Угол скамьи, положение стоп, высота сиденья…"/></label>
            <label className="field-label">Техника выполнения<textarea value={draft.instructions} onChange={e=>setDraft({...draft,instructions:e.target.value})} rows={4} placeholder="Короткие понятные подсказки клиенту"/></label>
            <label className="field-label">Частые ошибки<textarea value={draft.common_mistakes} onChange={e=>setDraft({...draft,common_mistakes:e.target.value})} rows={3} placeholder="Что чаще всего портит движение"/></label>
            <label className="field-label">Ссылка на технику / видео<input type="url" value={draft.technique_url} onChange={e=>setDraft({...draft,technique_url:e.target.value})} placeholder="https://..."/></label>

            <div className="field-block">
              <span className="field-label-text"><Tags size={14}/> Теги</span>
              <div className="tag-editor">
                <div className="chip-row">
                  {draft.tags.map(tag=><button type="button" className="soft-chip removable-chip" key={tag} onClick={()=>setDraft({...draft,tags:draft.tags.filter(item=>item!==tag)})}>#{tag}<X size={11}/></button>)}
                </div>
                <div className="inline-add">
                  <input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addTag()}}} placeholder="Например: без осевой нагрузки"/>
                  <button type="button" className="ghost-button" onClick={addTag}>Добавить</button>
                </div>
              </div>
            </div>

            <div className="field-block">
              <span className="field-label-text"><Repeat2 size={14}/> Группы замен</span>
              {editingExercise?.substitution_groups.length ? (
                <div className="replacement-detail-list">
                  {editingExercise.substitution_groups.map(group=>(
                    <div className="replacement-detail-row" key={group.id}>
                      <div><strong>{group.name}</strong><span>{group.purpose || 'Без описания'}</span></div>
                      <span className={`replacement-pill ${group.match_type}`}>{matchLabel(group.match_type)}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="drawer-notice neutral"><TriangleAlert size={14}/> Для упражнения пока не настроена группа замен.</div>}

              {!editingExercise && <>
                <div className="selectable-chip-row">
                  {data.substitutionGroups.filter(group=>group.scope==='specific').map(group=>(
                    <button type="button" key={group.id} className={`selectable-chip ${draft.substitution_group_ids.includes(group.id)?'is-selected':''}`} onClick={()=>setDraft(current=>({...current,substitution_group_ids:current.substitution_group_ids.includes(group.id)?current.substitution_group_ids.filter(id=>id!==group.id):[...current.substitution_group_ids,group.id]}))}>{group.name}</button>
                  ))}
                </div>
                <div className="inline-add compact-inline-add">
                  <input value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} placeholder="Новая группа, например «Наклонные жимы»"/>
                  <button type="button" className="ghost-button" onClick={()=>void addSubstitutionGroup()}><Plus size={14}/>Создать</button>
                </div>
              </>}
              <small className="field-help">Приоритет «прямая / допустимая / запасная» лучше менять в отдельном редакторе групп замен, чтобы случайно не разрушить логику программы.</small>
            </div>

            <div className="exercise-toggle-row">
              <div><strong>Одностороннее упражнение</strong><span>Например, тяга одной рукой или болгарский сплит-присед</span></div>
              <ToggleSwitch checked={draft.is_unilateral} onChange={value=>setDraft({...draft,is_unilateral:value})}/>
            </div>
            <div className="exercise-toggle-row">
              <div><strong>Показывать в библиотеке</strong><span>Архивные упражнения остаются в истории</span></div>
              <ToggleSwitch checked={draft.is_active} onChange={value=>setDraft({...draft,is_active:value})}/>
            </div>

            {notice && <div className="drawer-notice">{notice}</div>}
          </div>

          <div className="drawer-footer">
            <button className="ghost-button" onClick={()=>setEditorOpen(false)}>Отмена</button>
            <button className="primary-button compact" disabled={saving} onClick={()=>void submit()}>{saving?'Сохраняю…':'Сохранить упражнение'}</button>
          </div>
        </aside>
      </div>}
    </div>
  )
}
