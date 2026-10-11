import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Clock3, Dumbbell, ExternalLink, Film, ImagePlus, Info, Pencil, Plus, Repeat2,
  Search, Tags, TriangleAlert, X
} from 'lucide-react'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { ConfirmActionSheet } from '../components/ConfirmActionSheet'
import { UnsavedChangesGuard } from '../components/UnsavedChangesGuard'
import { RichTextField } from '../components/RichTextField'
import { addExerciseMedia, loadExerciseLibrary, removeExerciseMediaItem, saveExercise, saveExerciseWithNewGroups, setExerciseMediaCover, updateExerciseMediaCaption } from '../features/exercises/service'
import type { Exercise, ExerciseDraft, ExerciseLibraryData, ExerciseMedia, SubstitutionGroup } from '../features/exercises/types'

type Props = { preview: boolean }

function sameStringSet(a:string[],b:string[]){
  return JSON.stringify([...a].sort())===JSON.stringify([...b].sort())
}
function exerciseMatchesDraft(actual:Exercise,draft:ExerciseDraft){
  return actual.name.trim()===draft.name.trim()
    && (actual.description??'').trim()===draft.description.trim()
    && (actual.instructions??'').trim()===draft.instructions.trim()
    && (actual.setup_notes??'').trim()===draft.setup_notes.trim()
    && (actual.common_mistakes??'').trim()===draft.common_mistakes.trim()
    && actual.exercise_type===(draft.exercise_type||'compound')
    && actual.tracking_type===draft.tracking_type
    && sameStringSet(actual.aliases??[],draft.aliases)
    && (actual.equipment_code??'')===(draft.equipment_code||'')
    && (actual.movement_pattern_code??'')===(draft.movement_pattern_code||'')
    && actual.default_rest_seconds===draft.default_rest_seconds
    && (actual.technique_url??'').trim()===draft.technique_url.trim()
    && actual.is_unilateral===draft.is_unilateral
    && actual.is_active===draft.is_active
    && sameStringSet(actual.primary_muscles,draft.primary_muscles)
    && sameStringSet(actual.secondary_muscles,draft.secondary_muscles)
    && sameStringSet(actual.stabilizer_muscles,draft.stabilizer_muscles)
    && sameStringSet(actual.tags.map(tag=>tag.name),draft.tags)
}

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
      exercise_type:'compound', tracking_type:'weight_reps', aliases:[], equipment_code:'dumbbell', movement_pattern_code:'incline_push',
      default_rest_seconds:150, technique_url:'', image_url:null, is_unilateral:false, is_active:true,
      primary_muscles:['chest_upper'],
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
      exercise_type:'compound', tracking_type:'weight_reps', aliases:[], equipment_code:'cable', movement_pattern_code:'horizontal_pull',
      default_rest_seconds:150, technique_url:'', image_url:null, is_unilateral:false, is_active:true,
      primary_muscles:['back_mid'],
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
  aliases:[],
  exercise_type:'',
  tracking_type:'weight_reps',
  equipment_code:'',
  movement_pattern_code:'',
  default_rest_seconds:120,
  technique_url:'',
  is_unilateral:false,
  is_active:true,
  primary_muscles:[],
  secondary_muscles:[],
  stabilizer_muscles:[],
  tags:[],
  substitution_group_ids:[],
}

function draftFromExercise(exercise: Exercise): ExerciseDraft {
  return {
    id:exercise.id,
    name:exercise.name,
    description:exercise.description ?? '',
    instructions:[exercise.setup_notes,exercise.instructions].filter(Boolean).join(' '),
    setup_notes:'',
    common_mistakes:exercise.common_mistakes ?? '',
    aliases:exercise.aliases,
    exercise_type:exercise.exercise_type,
    tracking_type:exercise.tracking_type,
    equipment_code:exercise.equipment_code ?? '',
    movement_pattern_code:exercise.movement_pattern_code ?? '',
    default_rest_seconds:exercise.default_rest_seconds,
    technique_url:exercise.technique_url ?? '',
    is_unilateral:exercise.is_unilateral,
    is_active:exercise.is_active,
    primary_muscles:exercise.primary_muscles,
    secondary_muscles:exercise.secondary_muscles,
    stabilizer_muscles:exercise.stabilizer_muscles,
    tags:exercise.tags.map(tag=>tag.name),
    substitution_group_ids:exercise.substitution_groups.map(group=>group.id),
  }
}

function secondsLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}:${String(rest).padStart(2,'0')}` : `${minutes} мин`
}

function exerciseTypeLabel(type: Exercise['exercise_type']) {
  if (type === 'compound') return 'Базовое'
  if (type === 'isolation') return 'Изоляция'
  return 'Кардио'
}

function trackingTypeLabel(type: Exercise['tracking_type']) {
  const labels: Record<Exercise['tracking_type'],string> = {
    weight_reps:'Вес × повторения',
    bodyweight_reps:'Собственный вес × повторения',
    weighted_bodyweight:'Собственный вес + доп. вес',
    assisted_bodyweight:'Собственный вес с помощью',
    reps_only:'Только повторения',
    duration:'Время',
    weight_duration:'Вес × время',
    distance_duration:'Дистанция + время',
    weight_distance:'Вес × дистанция',
  }
  return labels[type]
}

function matchLabel(match: 'direct' | 'acceptable' | 'fallback') {
  if (match === 'direct') return 'прямая'
  if (match === 'acceptable') return 'допустимая'
  return 'запасная'
}

export function ExerciseLibraryPage({ preview }: Props) {
  const navigate=useNavigate()
  const [searchParams,setSearchParams]=useSearchParams()
  const requestedEditId=searchParams.get('edit')
  const returnTo=searchParams.get('returnTo')
  const [data, setData] = useState<ExerciseLibraryData>(previewData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [muscleFilter, setMuscleFilter] = useState('')
  const [equipmentFilter, setEquipmentFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [videoFilter,setVideoFilter]=useState<'all'|'missing'|'ready'>('all')
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<ExerciseDraft>(emptyDraft)
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [videoFiles, setVideoFiles] = useState<File[]>([])
  const [pendingMediaRemoval,setPendingMediaRemoval]=useState<ExerciseMedia|null>(null)
  const [mediaCaptionDrafts,setMediaCaptionDrafts]=useState<Record<string,string>>({})
  const [editorSavedSnapshot,setEditorSavedSnapshot]=useState<string|null>(null)
  const [closeEditorConfirmation,setCloseEditorConfirmation]=useState(false)

  async function refresh() {
    setLoading(true); setError('')
    try {
      const fresh=await loadExerciseLibrary()
      setData(fresh)
      return fresh
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить библиотеку'); return null }
    finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [preview])

  useEffect(()=>{
    if(!requestedEditId||loading||editorOpen)return
    const exercise=data.exercises.find(item=>item.id===requestedEditId)
    if(exercise)openEdit(exercise)
  },[requestedEditId,loading,data.exercises,editorOpen])

  const muscleNames = useMemo(() => new Map(data.muscles.map(item=>[item.code,item.name])), [data.muscles])
  const equipmentNames = useMemo(() => new Map(data.equipment.map(item=>[item.code,item.name])), [data.equipment])
  const patternNames = useMemo(() => new Map(data.patterns.map(item=>[item.code,item.name])), [data.patterns])

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('ru')
    return data.exercises.filter(exercise => {
      const allMuscles = [...exercise.primary_muscles,...exercise.secondary_muscles,...exercise.stabilizer_muscles]
      const matchesQuery = !q || [
        exercise.name, exercise.description ?? '', exercise.code, exercise.aliases.join(' '),
        exercise.tags.map(tag=>tag.name).join(' '),
        allMuscles.map(code=>muscleNames.get(code) ?? code).join(' '),
      ].join(' ').toLocaleLowerCase('ru').includes(q)
      const matchesMuscle = !muscleFilter || allMuscles.includes(muscleFilter)
      const matchesEquipment = !equipmentFilter || exercise.equipment_code === equipmentFilter
      const matchesMechanics = !typeFilter || exercise.exercise_type === typeFilter
      const matchesVideo = videoFilter==='all' || (videoFilter==='ready' ? Boolean(exercise.video_url) : !exercise.video_url)
      return matchesQuery && matchesMuscle && matchesEquipment && matchesMechanics && matchesVideo
    })
  }, [data.exercises,query,muscleFilter,equipmentFilter,typeFilter,videoFilter,muscleNames])

  function clearEditorMediaDrafts(){
    setImageFiles([])
    setVideoFiles([])
    setPendingMediaRemoval(null)
    setMediaCaptionDrafts({})
  }

  function openCreate() {
    setDraft(emptyDraft);setEditorSavedSnapshot(JSON.stringify(emptyDraft))
    setTagInput('');clearEditorMediaDrafts();setNotice('');setEditorOpen(true)
  }

  function openEdit(exercise: Exercise) {
    const next=draftFromExercise(exercise)
    setDraft(next);setEditorSavedSnapshot(JSON.stringify(next))
    setTagInput('');clearEditorMediaDrafts()
    setMediaCaptionDrafts(Object.fromEntries((exercise.media??[]).map(media=>[media.id,media.caption??''])))
    setNotice('');setEditorOpen(true)
  }

  const editorDirty=editorOpen&&((imageFiles.length>0)||(videoFiles.length>0)||(
    editorSavedSnapshot!==null&&JSON.stringify(draft)!==editorSavedSnapshot
  ))

  function finishCloseEditor(){
    setEditorOpen(false)
    clearEditorMediaDrafts()
    if(requestedEditId){
      if(returnTo){navigate(returnTo);return}
      const next=new URLSearchParams(searchParams)
      next.delete('edit');next.delete('returnTo')
      setSearchParams(next,{replace:true})
    }
  }

  function requestCloseEditor(){
    if(editorDirty){setCloseEditorConfirmation(true);return}
    finishCloseEditor()
  }

  function discardEditorChanges(){
    setCloseEditorConfirmation(false)
    finishCloseEditor()
  }

  function togglePrimary(code: string) {
    setDraft(current=>({
      ...current,
      primary_muscles:current.primary_muscles.includes(code)
        ? current.primary_muscles.filter(item=>item!==code)
        : [...current.primary_muscles,code],
      secondary_muscles:current.secondary_muscles.filter(item=>item!==code),
      stabilizer_muscles:current.stabilizer_muscles.filter(item=>item!==code),
    }))
  }

  function toggleSecondary(code: string) {
    setDraft(current=>({
      ...current,
      secondary_muscles:current.secondary_muscles.includes(code)
        ? current.secondary_muscles.filter(item=>item!==code)
        : [...current.secondary_muscles,code],
      primary_muscles:current.primary_muscles.filter(item=>item!==code),
      stabilizer_muscles:current.stabilizer_muscles.filter(item=>item!==code),
    }))
  }

  function toggleStabilizer(code: string) {
    setDraft(current=>({
      ...current,
      stabilizer_muscles:current.stabilizer_muscles.includes(code)
        ? current.stabilizer_muscles.filter(item=>item!==code)
        : [...current.stabilizer_muscles,code],
      primary_muscles:current.primary_muscles.filter(item=>item!==code),
      secondary_muscles:current.secondary_muscles.filter(item=>item!==code),
    }))
  }

  function addTag() {
    const value = tagInput.trim().replace(/^#/,'')
    if (!value || draft.tags.some(tag=>tag.toLocaleLowerCase('ru')===value.toLocaleLowerCase('ru'))) {
      setTagInput(''); return
    }
    setDraft(current=>({...current,tags:[...current.tags,value]})); setTagInput('')
  }

  function updateDraftRest(part:'minutes'|'seconds',value:string) {
    const numeric=Math.max(0,Number(value)||0)
    setDraft(current=>{
      const minutes=part==='minutes' ? Math.min(30,Math.floor(numeric)) : Math.floor(current.default_rest_seconds/60)
      const seconds=part==='seconds' ? Math.min(59,Math.floor(numeric)) : current.default_rest_seconds%60
      return {...current,default_rest_seconds:Math.min(1800,Math.max(15,minutes*60+seconds))}
    })
  }

  async function removeMedia(media:ExerciseMedia){
    if(!draft.id||preview||saving)return
    setSaving(true);setNotice('')
    try{
      const result=await removeExerciseMediaItem(draft.id,media.id)
      setPendingMediaRemoval(null)
      const refreshed=await refresh()
      if(result.storageCleanupFailed){
        setNotice('Медиа убрано из упражнения. Старый файл не удалось очистить, но приложение его больше не использует.')
      }else{
        setNotice(refreshed?'Медиа удалено.':'Медиа удалено, но библиотеку не удалось обновить.')
      }
    }catch(e){
      setNotice(e instanceof Error?e.message:'Не удалось удалить медиа')
    }finally{
      setSaving(false)
    }
  }

  async function makeCover(media:ExerciseMedia){
    if(!draft.id||preview||saving||media.kind!=='image')return
    setSaving(true);setNotice('')
    try{
      await setExerciseMediaCover(draft.id,media.id)
      await refresh()
      setNotice('Превью обновлено.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось изменить превью')}
    finally{setSaving(false)}
  }

  async function saveMediaCaption(media:ExerciseMedia){
    if(!draft.id||preview||saving)return
    const value=mediaCaptionDrafts[media.id]??media.caption??''
    if(value===(media.caption??''))return
    setSaving(true);setNotice('')
    try{
      await updateExerciseMediaCaption(draft.id,media.id,value)
      await refresh()
      setNotice('Подпись к медиа сохранена.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить подпись')}
    finally{setSaving(false)}
  }

  async function submit():Promise<boolean> {
    if (!draft.name.trim()){setNotice('Укажи название упражнения.');return false}
    if (!draft.exercise_type){setNotice('Выбери тип упражнения.');return false}
    if (draft.exercise_type !== 'cardio' && draft.primary_muscles.length === 0){setNotice('Выбери хотя бы одну основную мышцу.');return false}

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
        exercise_type:draft.exercise_type || 'compound',
        tracking_type:draft.tracking_type,
        aliases:draft.aliases,
        equipment_code:draft.equipment_code || null,
        movement_pattern_code:draft.movement_pattern_code || null,
        default_rest_seconds:draft.default_rest_seconds,
        technique_url:draft.technique_url.trim() || null,
        image_url:imageFiles[0] ? URL.createObjectURL(imageFiles[0]) : existing?.image_url ?? null,
        video_url:videoFiles[0] ? URL.createObjectURL(videoFiles[0]) : existing?.video_url ?? null,
        animation_url:existing?.animation_url ?? null,
        media:[
          ...(existing?.media??[]),
          ...imageFiles.map((file,index)=>({id:`preview-image-${index}`,kind:'image' as const,url:URL.createObjectURL(file),caption:null,sort_order:100+index*10})),
          ...videoFiles.map((file,index)=>({id:`preview-video-${index}`,kind:'video' as const,url:URL.createObjectURL(file),caption:null,sort_order:200+index*10})),
        ],
        is_unilateral:draft.is_unilateral,
        is_active:draft.is_active,
        primary_muscles:draft.primary_muscles,
        secondary_muscles:draft.secondary_muscles,
        stabilizer_muscles:draft.stabilizer_muscles,
        tags:draft.tags.map((name,index)=>({id:`preview-tag-${index}`,name,slug:name.toLocaleLowerCase('ru').replace(/\s+/g,'-')})),
        substitution_groups:existing?.substitution_groups ?? [],
      }
      setData(current=>({...current,exercises:draft.id
        ? current.exercises.map(item=>item.id===draft.id?exercise:item)
        : [exercise,...current.exercises]}))
      setNotice('Сохранено в предпросмотре.')
      setTimeout(()=>setEditorOpen(false),450)
      return true
    }

    const knownExerciseIds=new Set(data.exercises.map(exercise=>exercise.id))
    setSaving(true); setNotice('')
    try {
      const draftGroupNames=data.substitutionGroups
        .filter(group=>group.id.startsWith('draft-group-')&&draft.substitution_group_ids.includes(group.id))
        .map(group=>group.name)
      let id:string
      try{
        id=draftGroupNames.length
          ? await saveExerciseWithNewGroups(draft,draftGroupNames)
          : await saveExercise(draft)
      }catch(saveError){
        let recovered:Exercise|null=null
        try{
          const actual=await loadExerciseLibrary()
          recovered=draft.id
            ? actual.exercises.find(exercise=>exercise.id===draft.id&&exerciseMatchesDraft(exercise,draft))??null
            : actual.exercises.find(exercise=>!knownExerciseIds.has(exercise.id)&&exerciseMatchesDraft(exercise,draft))??null
          if(recovered)setData(actual)
        }catch{}
        if(!recovered)throw saveError
        id=recovered.id
        setNotice('Упражнение уже было сохранено на сервере. Продолжаю с этой же записью.')
      }

      let savedDraft={...draft,id,substitution_group_ids:draft.substitution_group_ids.filter(groupId=>!groupId.startsWith('draft-group-'))}
      setDraft(savedDraft)
      setEditorSavedSnapshot(JSON.stringify(savedDraft))

      const mediaWarnings:string[]=[]
      for(const file of imageFiles){
        try{await addExerciseMedia(id,file,'image')}
        catch(e){mediaWarnings.push('изображение '+file.name+': '+(e instanceof Error?e.message:'ошибка загрузки'))}
      }
      for(const file of videoFiles){
        try{await addExerciseMedia(id,file,'video')}
        catch(e){mediaWarnings.push('видео '+file.name+': '+(e instanceof Error?e.message:'ошибка загрузки'))}
      }
      setImageFiles([])
      setVideoFiles([])

      const refreshed=await refresh()
      if(!refreshed){
        setNotice('Упражнение сохранено, но список не удалось обновить. Повторно создавать упражнение не нужно.')
        return true
      }

      const freshExercise=refreshed.exercises.find(exercise=>exercise.id===id)
      if(freshExercise){
        savedDraft={...savedDraft,substitution_group_ids:freshExercise.substitution_groups.map(group=>group.id)}
        setDraft(savedDraft)
        setEditorSavedSnapshot(JSON.stringify(savedDraft))
      }

      if(mediaWarnings.length){
        setNotice('Упражнение сохранено, но не всё медиа загрузилось: '+mediaWarnings.join('; ')+'. Повторное сохранение обновит эту же запись.')
        return false
      }
      finishCloseEditor()
      return true
    }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Не удалось сохранить упражнение'); return false }
    finally { setSaving(false) }
  }

  async function addSubstitutionGroup() {
    const name=newGroupName.trim()
    if(!name)return
    const stamp=Date.now()
    const group:SubstitutionGroup={
      id:(preview?'preview-group-':'draft-group-')+stamp,
      code:(preview?'PREVIEW_':'DRAFT_')+stamp,
      name,purpose:null,scope:'specific',parent_group_id:null,
    }
    setData(current=>({...current,substitutionGroups:[...current.substitutionGroups,group]}))
    setDraft(current=>({...current,substitution_group_ids:[...current.substitution_group_ids,group.id]}))
    setNewGroupName('')
    if(!preview)setNotice('Новая группа будет создана вместе с упражнением после «Сохранить упражнение».')
  }

  const editingExercise = draft.id ? data.exercises.find(item=>item.id===draft.id) : undefined

  return (
    <div className="page-stack exercise-library-page">
      <UnsavedChangesGuard when={!preview&&editorDirty} onSave={submit} saving={saving}/>
      <section className="exercise-library-hero">
        <div>
          <span className="eyebrow">Библиотека упражнений</span>
          <h2>Упражнение хранит смысл, а программа — назначение</h2>
          <p>Тип упражнения, основные и дополнительные мышцы, техника, оборудование и логика замен живут в справочнике. Нагрузка и роль в конкретной тренировке задаются уже в программе.</p>
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
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}>
          <option value="">Любой тип</option>
          <option value="compound">Базовые</option>
          <option value="isolation">Изоляция</option>
          <option value="cardio">Кардио</option>
        </select>
        <select value={videoFilter} onChange={e=>setVideoFilter(e.target.value as 'all'|'missing'|'ready')}>
          <option value="all">Все видео</option>
          <option value="missing">Без видео</option>
          <option value="ready">С видео</option>
        </select>
      </section>

      {preview && <div className="preview-inline-note">Предпросмотр читает реальный справочник из Supabase. Изменения в демо-режиме остаются локальными.</div>}
      {error && <div className="form-error">{error}</div>}

      <div className="exercise-library-summary">
        <span><strong>{filtered.length}</strong> упражнений</span>
        {muscleFilter && <button onClick={()=>setMuscleFilter('')} className="filter-chip">{muscleNames.get(muscleFilter)} <X size={12}/></button>}
        {equipmentFilter && <button onClick={()=>setEquipmentFilter('')} className="filter-chip">{equipmentNames.get(equipmentFilter)} <X size={12}/></button>}
        {typeFilter && <button onClick={()=>setTypeFilter('')} className="filter-chip">{typeFilter==='compound'?'Базовые':typeFilter==='isolation'?'Изоляция':'Кардио'} <X size={12}/></button>}
        {videoFilter!=='all'&&<button onClick={()=>setVideoFilter('all')} className="filter-chip">{videoFilter==='ready'?'С видео':'Без видео'} <X size={12}/></button>}
        <span className="exercise-video-count"><Film size={13}/>{data.exercises.filter(item=>item.video_url).length} / {data.exercises.length} с видео</span>
      </div>

      {loading ? <div className="library-empty">Загружаю библиотеку…</div> : (
        <div className="exercise-library-grid">
          {filtered.map(exercise=>(
            <article className="exercise-library-card" key={exercise.id}>
              <div className="exercise-card-main">
                <div className="exercise-avatar">{exercise.image_url ? <img src={exercise.image_url} alt="" loading="lazy"/> : <Dumbbell size={22}/>}</div>
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
                <span className={exercise.exercise_type==='compound'?'fact-strong':''}>{exerciseTypeLabel(exercise.exercise_type)}</span>
                <span>{trackingTypeLabel(exercise.tracking_type)}</span>
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
                {exercise.video_url&&<span className="exercise-video-status"><Film size={15}/>Видео загружено</span>}
                {exercise.technique_url && <a className="text-button" href={exercise.technique_url} target="_blank" rel="noreferrer"><ExternalLink size={15}/>Внешнее видео</a>}
              </div>
            </article>
          ))}
          {filtered.length===0 && <div className="library-empty">Ничего не найдено. Сними фильтр или добавь новое упражнение.</div>}
        </div>
      )}

      {editorOpen && <div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)requestCloseEditor()}}>
        <aside className="exercise-drawer">
          <div className="drawer-head">
            <div><span className="eyebrow">{draft.id?'Редактирование':'Новое упражнение'}</span><h3>{draft.id?draft.name:'Добавить в библиотеку'}</h3></div>
            <button className="icon-button" onClick={requestCloseEditor}><X size={18}/></button>
          </div>

          <div className="drawer-body">
            <label className="field-label">Название<input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="Например, жим гантелей на наклонной"/></label>
            <label className="field-label">Другие названия / как было в старой таблице
              <input value={draft.aliases.join(', ')} onChange={e=>setDraft({...draft,aliases:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})} placeholder="Через запятую"/>
            </label>

            <div className="form-grid-2">
              <label className="field-label">Тип упражнения
                <select value={draft.exercise_type} onChange={e=>setDraft({...draft,exercise_type:e.target.value as ExerciseDraft['exercise_type']})}>
                  <option value="">Выбрать</option>
                  <option value="compound">Базовое</option>
                  <option value="isolation">Изоляция</option>
                  <option value="cardio">Кардио</option>
                </select>
              </label>
              <label className="field-label">Способ учёта
                <select value={draft.tracking_type} onChange={e=>setDraft({...draft,tracking_type:e.target.value as ExerciseDraft['tracking_type']})}>
                  <option value="weight_reps">Вес × повторения</option>
                  <option value="bodyweight_reps">Собственный вес × повторения</option>
                  <option value="weighted_bodyweight">Собственный вес + доп. вес</option>
                  <option value="assisted_bodyweight">Собственный вес с помощью</option>
                  <option value="reps_only">Только повторения</option>
                  <option value="duration">Время</option>
                  <option value="weight_duration">Вес × время</option>
                  <option value="distance_duration">Дистанция + время</option>
                  <option value="weight_distance">Вес × дистанция</option>
                </select>
              </label>
            </div>

            <div className="field-block">
              <span className="field-label-text">Основные мышцы</span>
              <div className="selectable-chip-row">
                {data.muscles.map(item=>(
                  <button type="button" key={item.code} className={`selectable-chip ${draft.primary_muscles.includes(item.code)?'is-selected':''}`} onClick={()=>togglePrimary(item.code)}>{item.name}</button>
                ))}
              </div>
            </div>

            <div className="field-block">
              <span className="field-label-text">Дополнительные мышцы</span>
              <div className="selectable-chip-row">
                {data.muscles.map(item=>(
                  <button type="button" key={item.code} className={`selectable-chip ${draft.secondary_muscles.includes(item.code)?'is-selected':''}`} onClick={()=>toggleSecondary(item.code)}>{item.name}</button>
                ))}
              </div>
            </div>

            <div className="field-block">
              <span className="field-label-text">Стабилизаторы</span>
              <div className="selectable-chip-row">
                {data.muscles.map(item=>(
                  <button type="button" key={item.code} className={`selectable-chip ${draft.stabilizer_muscles.includes(item.code)?'is-selected':''}`} onClick={()=>toggleStabilizer(item.code)}>{item.name}</button>
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

            <div className="field-block">
              <span className="field-label-text">Рекомендуемый отдых по умолчанию</span>
              <div className="rest-parts-input">
                <label><input type="number" min="0" max="30" value={Math.floor(draft.default_rest_seconds/60)} onChange={e=>updateDraftRest('minutes',e.target.value)}/><span>мин</span></label>
                <label><input type="number" min="0" max="59" value={draft.default_rest_seconds%60} onChange={e=>updateDraftRest('seconds',e.target.value)}/><span>сек</span></label>
              </div>
            </div>

            <label className="field-label">Коротко<textarea value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} rows={2} placeholder="Одна простая фраза: что делает упражнение"/></label>
            <RichTextField
              label="Техника"
              value={draft.instructions}
              onChange={instructions=>setDraft({...draft,instructions})}
              rows={9}
              help="Можно оформить как мини-статью: подзаголовки, жирный текст, списки и ссылки."
              placeholder={"#### Исходное положение\nКоротко опиши, как расположиться.\n\n#### Как выполнять\n1. Первый шаг\n2. Второй шаг"}
            />
            <RichTextField
              label="Что важно"
              value={draft.common_mistakes}
              onChange={common_mistakes=>setDraft({...draft,common_mistakes})}
              rows={5}
              help="Необязательно. Обычно достаточно 2–4 коротких пунктов."
              placeholder={"- Не раскачивай корпус\n- Двигайся плавно\n- Не бери вес в ущерб технике"}
            />
            <label className="field-label">Внешняя ссылка на технику / видео <small className="field-help">Необязательно — например, YouTube или другая внешняя страница. Для своих роликов лучше использовать загрузку ниже.</small><input type="url" value={draft.technique_url} onChange={e=>setDraft({...draft,technique_url:e.target.value})} placeholder="https://..."/></label>

            <div className="field-block">
              <span className="field-label-text"><ImagePlus size={14}/> Изображения техники</span>
              <div className="exercise-media-gallery">
                {(editingExercise?.media??[]).filter(media=>media.kind==='image').map((media,index)=>(
                  <article className="exercise-media-tile" key={media.id}>
                    <a href={media.url} target="_blank" rel="noreferrer" className="exercise-media-preview-link" title="Открыть в полном размере">
                      <img src={media.url} alt={media.caption||`${editingExercise?.name??'Упражнение'} — изображение ${index+1}`} loading="lazy"/>
                    </a>
                    <div className="exercise-media-tile-meta">
                      <span>{index===0?'Превью':`Фото ${index+1}`}</span>
                      {!preview&&index!==0&&<button type="button" className="text-button" disabled={saving} onClick={()=>void makeCover(media)}>Сделать превью</button>}
                      {!preview&&<button type="button" className="text-button danger-text-button" disabled={saving} onClick={()=>setPendingMediaRemoval(media)}>Удалить</button>}
                    </div>
                    {!preview&&<input
                      className="exercise-media-caption"
                      value={mediaCaptionDrafts[media.id]??media.caption??''}
                      onChange={e=>setMediaCaptionDrafts(current=>({...current,[media.id]:e.target.value}))}
                      onBlur={()=>void saveMediaCaption(media)}
                      placeholder="Подпись: фаза движения, положение корпуса…"
                    />}
                  </article>
                ))}
                {(editingExercise?.media??[]).filter(media=>media.kind==='image').length===0&&imageFiles.length===0&&<div className="exercise-image-placeholder"><Dumbbell size={22}/><span>Пока без изображения</span></div>}
                {imageFiles.map((file,index)=><div className="exercise-media-tile pending" key={file.name+index}><img src={URL.createObjectURL(file)} alt="Новое изображение"/><span>Будет добавлено после сохранения</span></div>)}
              </div>
              <label className="ghost-button exercise-image-upload">
                <Plus size={14}/>Добавить изображения
                <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e=>setImageFiles(Array.from(e.target.files??[]))}/>
              </label>
              <small className="field-help">Можно добавить несколько JPG, PNG или WebP до 8 МБ каждый. Первое изображение используется как превью; остальные открываются в полном размере.</small>
            </div>

            <div className="field-block">
              <span className="field-label-text"><Film size={14}/> Видео техники</span>
              <div className="exercise-media-gallery video-gallery">
                {(editingExercise?.media??[]).filter(media=>media.kind==='video'||media.kind==='animation').map((media,index)=>(
                  <article className="exercise-media-tile video" key={media.id}>
                    <video src={media.url} controls muted playsInline preload="metadata" poster={editingExercise?.image_url??undefined}/>
                    <div className="exercise-media-tile-meta">
                      <span>{media.caption||`Видео ${index+1}`}</span>
                      {!preview&&<button type="button" className="text-button danger-text-button" disabled={saving} onClick={()=>setPendingMediaRemoval(media)}>Удалить</button>}
                    </div>
                    {!preview&&<input
                      className="exercise-media-caption"
                      value={mediaCaptionDrafts[media.id]??media.caption??''}
                      onChange={e=>setMediaCaptionDrafts(current=>({...current,[media.id]:e.target.value}))}
                      onBlur={()=>void saveMediaCaption(media)}
                      placeholder="Например: положение локтя / нижняя фаза"
                    />}
                  </article>
                ))}
                {(editingExercise?.media??[]).filter(media=>media.kind==='video'||media.kind==='animation').length===0&&videoFiles.length===0&&<div className="exercise-video-placeholder"><Film size={24}/><span>Пока без видео</span></div>}
                {videoFiles.map((file,index)=><div className="exercise-media-tile video pending" key={file.name+index}><video src={URL.createObjectURL(file)} controls muted playsInline preload="metadata"/><span>Будет добавлено после сохранения</span></div>)}
              </div>
              <label className="ghost-button exercise-video-upload">
                <Plus size={14}/>Добавить видео
                <input type="file" multiple accept="video/mp4,video/webm" onChange={e=>setVideoFiles(Array.from(e.target.files??[]))}/>
              </label>
              <small className="field-help">Можно хранить несколько роликов для разных элементов техники. MP4 (H.264) рекомендуется; до 50 МБ каждый.</small>
            </div>

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
            <button className="ghost-button" onClick={requestCloseEditor}>Отмена</button>
            <button className="primary-button compact" disabled={saving} onClick={()=>void submit()}>{saving?'Сохраняю…':'Сохранить упражнение'}</button>
          </div>
        </aside>
      </div>}

      <ConfirmActionSheet
        open={Boolean(pendingMediaRemoval)}
        title={pendingMediaRemoval?.kind==='image'?'Удалить изображение?':'Удалить видео?'}
        message="Файл исчезнет из карточки упражнения. История уже выполненных тренировок не изменится."
        confirmLabel="Удалить"
        destructive
        busy={saving}
        onCancel={()=>setPendingMediaRemoval(null)}
        onConfirm={()=>{if(pendingMediaRemoval)void removeMedia(pendingMediaRemoval)}}
      />

      {closeEditorConfirmation&&<div className="drawer-backdrop">
        <aside className="exercise-drawer workout-sheet finish-workout-sheet">
          <div className="drawer-head"><div><span className="eyebrow">Упражнение</span><h3>Отменить несохранённые изменения?</h3></div></div>
          <div className="drawer-body">
            <div className="finish-workout-icon"><TriangleAlert size={24}/></div>
            <p className="sheet-description">Изменения упражнения ещё не сохранены.</p>
            <div className="finish-workout-actions">
              <button className="ghost-button" onClick={()=>setCloseEditorConfirmation(false)}>Остаться</button>
              <button className="primary-button" onClick={discardEditorChanges}>Отменить изменения</button>
            </div>
          </div>
        </aside>
      </div>}
    </div>
  )
}
