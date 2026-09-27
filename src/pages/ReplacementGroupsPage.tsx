import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Dumbbell, Layers3, Plus, Save, Search, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  createSubstitutionGroup, loadExerciseLibrary, saveSubstitutionGroup,
  type ReplacementMemberDraft
} from '../features/exercises/service'
import type {
  Exercise, ExerciseLibraryData, SubstitutionGroup, SubstitutionMatchType
} from '../features/exercises/types'

type Props = { preview: boolean }

const previewSpecific: SubstitutionGroup = {
  id:'preview-upper',code:'CHEST_UPPER_PRESS',name:'Жимы на верх груди',
  purpose:'Близкие варианты наклонного жима',scope:'specific',parent_group_id:'preview-chest',
}
const previewBroad: SubstitutionGroup = {
  id:'preview-chest',code:'CHEST_PRESS',name:'Жимы на грудь',
  purpose:'Широкая резервная группа жимов на грудь',scope:'broad',parent_group_id:null,
}
const previewHam: SubstitutionGroup = {
  id:'preview-ham',code:'HAMSTRING_KNEE_FLEXION',name:'Сгибания колена на бицепс бедра',
  purpose:'Прямые замены сгибанию ног',scope:'specific',parent_group_id:null,
}

const previewExercises: Exercise[] = [
  {
    id:'p1',code:'CHEST_UPPER_DB_PRESS',name:'Жим гантелей на наклонной скамье 25–35°',
    description:'Многосуставной жим с акцентом на верх груди',instructions:null,setup_notes:null,common_mistakes:null,
    exercise_type:'compound',tracking_type:'weight_reps',aliases:[],equipment_code:'dumbbell',movement_pattern_code:'incline_push',default_rest_seconds:150,
    technique_url:null,is_unilateral:false,is_active:true,primary_muscles:['chest_upper'],
    secondary_muscles:['triceps'],stabilizer_muscles:[],tags:[],
    substitution_groups:[{...previewSpecific,priority:10,is_default:true,match_type:'direct',membership_notes:null}],
  },
  {
    id:'p2',code:'CHEST_UPPER_BB_PRESS',name:'Жим штанги на наклонной скамье',
    description:'Наклонный жим со штангой',instructions:null,setup_notes:null,common_mistakes:null,
    exercise_type:'compound',tracking_type:'weight_reps',aliases:[],equipment_code:'barbell',movement_pattern_code:'incline_push',default_rest_seconds:150,
    technique_url:null,is_unilateral:false,is_active:true,primary_muscles:['chest_upper'],
    secondary_muscles:['triceps'],stabilizer_muscles:[],tags:[],
    substitution_groups:[{...previewSpecific,priority:20,is_default:false,match_type:'direct',membership_notes:null}],
  },
  {
    id:'p3',code:'CHEST_UPPER_SMITH_PRESS',name:'Жим в Смите на наклонной скамье',
    description:'Наклонный жим с фиксированной траекторией',instructions:null,setup_notes:null,common_mistakes:null,
    exercise_type:'compound',tracking_type:'weight_reps',aliases:[],equipment_code:'smith',movement_pattern_code:'incline_push',default_rest_seconds:150,
    technique_url:null,is_unilateral:false,is_active:true,primary_muscles:['chest_upper'],
    secondary_muscles:['triceps'],stabilizer_muscles:[],tags:[],
    substitution_groups:[{...previewSpecific,priority:30,is_default:false,match_type:'direct',membership_notes:null}],
  },
  {
    id:'h1',code:'HAMSTRING_LEG_CURL',name:'Сгибание ног в тренажёре лёжа',
    description:'Сгибание колена',instructions:null,setup_notes:null,common_mistakes:null,
    exercise_type:'isolation',tracking_type:'weight_reps',aliases:[],equipment_code:'machine',movement_pattern_code:'knee_flexion',default_rest_seconds:75,
    technique_url:null,is_unilateral:false,is_active:true,primary_muscles:['hamstrings'],
    secondary_muscles:[],stabilizer_muscles:[],tags:[],
    substitution_groups:[{...previewHam,priority:10,is_default:true,match_type:'direct',membership_notes:null}],
  },
  {
    id:'h2',code:'HAMSTRING_SEATED_CURL',name:'Сгибание ног сидя',
    description:'Сгибание колена сидя',instructions:null,setup_notes:null,common_mistakes:null,
    exercise_type:'isolation',tracking_type:'weight_reps',aliases:[],equipment_code:'machine',movement_pattern_code:'knee_flexion',default_rest_seconds:75,
    technique_url:null,is_unilateral:false,is_active:true,primary_muscles:['hamstrings'],
    secondary_muscles:[],stabilizer_muscles:[],tags:[],
    substitution_groups:[{...previewHam,priority:20,is_default:false,match_type:'direct',membership_notes:null}],
  },
  {
    id:'h3',code:'HAMSTRING_RDL_DB',name:'Румынская тяга с гантелями',
    description:'Тазовый шарнир: та же целевая группа, но другая функция',instructions:null,setup_notes:null,common_mistakes:null,
    exercise_type:'compound',tracking_type:'weight_reps',aliases:[],equipment_code:'dumbbell',movement_pattern_code:'hinge',default_rest_seconds:150,
    technique_url:null,is_unilateral:false,is_active:true,primary_muscles:['hamstrings','glutes'],
    secondary_muscles:[],stabilizer_muscles:['core'],tags:[],
    substitution_groups:[{...previewHam,priority:90,is_default:false,match_type:'fallback',membership_notes:'Не прямая биомеханическая замена'}],
  },
]

const previewLibrary: ExerciseLibraryData = {
  exercises:previewExercises,
  muscles:[],
  equipment:[],
  patterns:[],
  substitutionGroups:[previewSpecific,previewBroad,previewHam],
}

type GroupDraft = {
  id:string
  name:string
  purpose:string
  scope:'specific'|'broad'
  parent_group_id:string
}

function memberLabel(type: SubstitutionMatchType) {
  if (type==='direct') return 'Прямая'
  if (type==='acceptable') return 'Допустимая'
  return 'Запасная'
}

export function ReplacementGroupsPage({preview}:Props) {
  const [library,setLibrary]=useState<ExerciseLibraryData>(previewLibrary)
  const [loading,setLoading]=useState(!preview)
  const [notice,setNotice]=useState('')
  const [selectedId,setSelectedId]=useState(previewLibrary.substitutionGroups[0]?.id ?? '')
  const [draft,setDraft]=useState<GroupDraft|null>(null)
  const [members,setMembers]=useState<ReplacementMemberDraft[]>([])
  const [query,setQuery]=useState('')
  const [saving,setSaving]=useState(false)

  async function refresh(preferredId?:string) {
    if (preview) return
    setLoading(true)
    try {
      const data=await loadExerciseLibrary()
      setLibrary(data)
      setSelectedId(preferredId || selectedId || data.substitutionGroups[0]?.id || '')
    } catch(e) {
      setNotice(e instanceof Error?e.message:'Не удалось загрузить группы замен')
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{ void refresh() },[preview])

  const selected=library.substitutionGroups.find(group=>group.id===selectedId) ?? null

  useEffect(()=>{
    if(!selected){setDraft(null);setMembers([]);return}
    setDraft({
      id:selected.id,name:selected.name,purpose:selected.purpose ?? '',
      scope:selected.scope,parent_group_id:selected.parent_group_id ?? '',
    })
    const linked=library.exercises
      .map(exercise=>{
        const membership=exercise.substitution_groups.find(group=>group.id===selected.id)
        if(!membership)return null
        return {
          exercise_id:exercise.id,
          match_type:membership.match_type,
          is_default:membership.is_default,
          notes:membership.membership_notes ?? '',
          priority:membership.priority,
        }
      })
      .filter(Boolean)
      .sort((a,b)=>(a?.priority ?? 0)-(b?.priority ?? 0))
      .map(item=>({
        exercise_id:item!.exercise_id,
        match_type:item!.match_type,
        is_default:item!.is_default,
        notes:item!.notes,
      }))
    setMembers(linked)
  },[selectedId,library])

  const exerciseById=useMemo(()=>new Map(library.exercises.map(e=>[e.id,e])),[library])
  const available=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase('ru')
    return library.exercises.filter(exercise=>
      exercise.is_active &&
      !members.some(member=>member.exercise_id===exercise.id) &&
      (!q || [exercise.name,exercise.code,exercise.description ?? ''].join(' ').toLocaleLowerCase('ru').includes(q))
    ).slice(0,12)
  },[library,members,query])

  function addMember(exerciseId:string) {
    setMembers(current=>[...current,{
      exercise_id:exerciseId,match_type:'direct',is_default:current.length===0,notes:'',
    }])
    setQuery('')
  }

  function updateMember(exerciseId:string,patch:Partial<ReplacementMemberDraft>) {
    setMembers(current=>current.map(member=>{
      if(member.exercise_id!==exerciseId){
        return patch.is_default ? {...member,is_default:false} : member
      }
      return {...member,...patch}
    }))
  }

  function removeMember(exerciseId:string) {
    setMembers(current=>{
      const next=current.filter(member=>member.exercise_id!==exerciseId)
      if(next.length && !next.some(member=>member.is_default)) next[0]={...next[0],is_default:true}
      return next
    })
  }

  async function createGroup() {
    if(preview){
      const group:SubstitutionGroup={
        id:`preview-${Date.now()}`,code:`PREVIEW_${Date.now()}`,name:'Новая группа',
        purpose:null,scope:'specific',parent_group_id:null,
      }
      setLibrary(current=>({...current,substitutionGroups:[...current.substitutionGroups,group]}))
      setSelectedId(group.id)
      return
    }
    try {
      const group=await createSubstitutionGroup('Новая группа замен')
      await refresh(group.id)
    } catch(e){setNotice(e instanceof Error?e.message:'Не удалось создать группу')}
  }

  async function save() {
    if(!draft)return
    if(!draft.name.trim())return setNotice('Укажи название группы.')
    if(!members.length)return setNotice('Добавь хотя бы одно упражнение.')
    if(!members.some(member=>member.is_default))return setNotice('Отметь основное упражнение группы.')

    if(preview){
      const groupIndex=library.substitutionGroups.findIndex(g=>g.id===draft.id)
      const nextGroup:SubstitutionGroup={
        ...library.substitutionGroups[groupIndex],
        name:draft.name.trim(),purpose:draft.purpose.trim()||null,scope:draft.scope,
        parent_group_id:draft.scope==='specific'?(draft.parent_group_id||null):null,
      }
      const nextExercises=library.exercises.map(exercise=>{
        const oldWithout=exercise.substitution_groups.filter(group=>group.id!==draft.id)
        const member=members.find(item=>item.exercise_id===exercise.id)
        if(!member)return {...exercise,substitution_groups:oldWithout}
        return {...exercise,substitution_groups:[...oldWithout,{
          ...nextGroup,priority:(members.indexOf(member)+1)*10,is_default:member.is_default,
          match_type:member.match_type,membership_notes:member.notes||null,
        }]}
      })
      const nextGroups=[...library.substitutionGroups]
      nextGroups[groupIndex]=nextGroup
      setLibrary({...library,substitutionGroups:nextGroups,exercises:nextExercises})
      setNotice('Сохранено в предпросмотре.')
      return
    }

    setSaving(true);setNotice('')
    try{
      await saveSubstitutionGroup({
        id:draft.id,name:draft.name,purpose:draft.purpose||null,scope:draft.scope,
        parent_group_id:draft.scope==='specific'?(draft.parent_group_id||null):null,
      },members)
      await refresh(draft.id)
      setNotice('Группа замен сохранена.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить группу')}
    finally{setSaving(false)}
  }

  return <div className="page-stack replacement-groups-page">
    <div className="workspace-back"><Link to="/builder"><ChevronLeft size={17}/>Конструктор</Link></div>

    <section className="section-intro">
      <div>
        <span className="eyebrow">Замены упражнений</span>
        <h2>Сначала близкая замена, затем — более широкая</h2>
        <p>Группа мышц описывает анатомию. Группа замен — то, чем реально можно заменить упражнение в программе. Это разные сущности.</p>
      </div>
      <button className="primary-button compact" onClick={()=>void createGroup()}><Plus size={16}/>Новая группа</button>
    </section>

    {notice&&<div className="drawer-notice">{notice}</div>}
    {loading?<div className="library-empty">Загружаю группы…</div>:
    <div className="replacement-layout">
      <aside className="replacement-groups-list panel">
        <div className="replacement-list-head"><Layers3 size={17}/><strong>Группы</strong><span>{library.substitutionGroups.length}</span></div>
        {library.substitutionGroups.map(group=><button
          key={group.id}
          className={`replacement-group-button ${group.id===selectedId?'is-active':''}`}
          onClick={()=>{setSelectedId(group.id);setNotice('')}}
        >
          <div><strong>{group.name}</strong><span>{group.scope==='specific'?'Точная группа':'Широкая группа'}</span></div>
          <small>{library.exercises.filter(e=>e.substitution_groups.some(g=>g.id===group.id)).length}</small>
        </button>)}
      </aside>

      {draft&&<section className="panel replacement-editor">
        <div className="replacement-editor-head">
          <div><span className="eyebrow">Редактор группы</span><h3>{draft.name}</h3></div>
          <button className="primary-button compact" disabled={saving} onClick={()=>void save()}><Save size={15}/>{saving?'Сохраняю…':'Сохранить'}</button>
        </div>

        <div className="form-grid-2">
          <label className="field-label">Название<input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
          <label className="field-label">Уровень
            <select value={draft.scope} onChange={e=>setDraft({...draft,scope:e.target.value as GroupDraft['scope'],parent_group_id:e.target.value==='broad'?'':draft.parent_group_id})}>
              <option value="specific">Точная группа</option>
              <option value="broad">Широкая резервная группа</option>
            </select>
          </label>
        </div>

        <label className="field-label">Назначение<textarea rows={2} value={draft.purpose} onChange={e=>setDraft({...draft,purpose:e.target.value})} placeholder="Например: все близкие варианты наклонного жима"/></label>

        {draft.scope==='specific'&&<label className="field-label">Широкая резервная группа
          <select value={draft.parent_group_id} onChange={e=>setDraft({...draft,parent_group_id:e.target.value})}>
            <option value="">Нет</option>
            {library.substitutionGroups.filter(g=>g.scope==='broad'&&g.id!==draft.id).map(group=><option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </label>}

        <div className="replacement-help">
          <strong>Логика для клиента</strong>
          <span><b>Прямая</b> — почти тот же тренировочный смысл. <b>Допустимая</b> — хороший компромисс. <b>Запасная</b> — только когда близкого варианта нет.</span>
        </div>

        <div className="replacement-members">
          <div className="replacement-members-head"><strong>Упражнения группы</strong><span>{members.length}</span></div>
          {members.map((member,index)=>{
            const exercise=exerciseById.get(member.exercise_id)
            if(!exercise)return null
            return <div className="replacement-member-row" key={member.exercise_id}>
              <div className="replacement-member-index">{index+1}</div>
              <div className="replacement-member-name">
                <strong>{exercise.name}</strong><span>{exercise.code}</span>
              </div>
              <select value={member.match_type} onChange={e=>updateMember(member.exercise_id,{match_type:e.target.value as SubstitutionMatchType})}>
                <option value="direct">{memberLabel('direct')}</option>
                <option value="acceptable">{memberLabel('acceptable')}</option>
                <option value="fallback">{memberLabel('fallback')}</option>
              </select>
              <label className="replacement-default-radio">
                <input type="radio" name="default-exercise" checked={member.is_default} onChange={()=>updateMember(member.exercise_id,{is_default:true})}/>
                Основное
              </label>
              <button className="icon-button danger" onClick={()=>removeMember(member.exercise_id)}><Trash2 size={15}/></button>
            </div>
          })}
        </div>

        <div className="replacement-add">
          <div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Добавить упражнение в группу"/></div>
          {query&&<div className="replacement-search-results">
            {available.map(exercise=><button key={exercise.id} onClick={()=>addMember(exercise.id)}>
              <Dumbbell size={16}/><div><strong>{exercise.name}</strong><span>{exercise.code}</span></div><Plus size={15}/>
            </button>)}
            {!available.length&&<span>Подходящих упражнений не найдено</span>}
          </div>}
        </div>
      </section>}
    </div>}
  </div>
}
