import { useEffect, useMemo, useState } from 'react'
import { Apple, Bell, CheckCircle2, ChevronLeft, Dumbbell, EyeOff, Gauge, Plus, Save } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { serviceModules, trackingGroups } from '../data/platformDemo'
import { loadClientModules, loadClientTracking, loadTrainerClient, saveClientWorkspaceConfig, type TrainerClient } from '../features/clients/service'
import { loadTrainerClientNutritionPlans, type TrainerClientNutritionPlanSummary } from '../features/nutrition/service'
import { createClientReminderRuleFromDraft, loadClientReminderRules, reminderPreset, saveClientReminderRule, type ReminderRule } from '../features/notifications/service'
import { activateTrainingProgram, assignTrainingProgramCopy, loadClientTrainingPrograms, loadTrainerPrograms, type TrainerProgramSummary } from '../features/programs/service'

type Props={preview:boolean}
const moduleIcons={nutrition:Apple,training:Dumbbell,progress:Gauge,checkins:Gauge,notifications:Bell} as const
const weekdayLabels=['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС']

const previewClient:TrainerClient={id:'sergey',display_name:'Сергей',nickname:'Музыкант',age:37,city:null,avatar_key:'fox',timezone:'Europe/Moscow',status:'active',started_at:'2026-09-27'}

export function ClientWorkspacePage({preview}:Props){
  const {clientId=''}=useParams()
  const navigate=useNavigate()
  const initialFields=useMemo(()=>Object.fromEntries(trackingGroups.flatMap(g=>g.items.map(i=>[i.code,{enabled:i.enabled,required:i.required,clientCanHide:i.clientCanHide,label:i.label}]))),[])
  const [client,setClient]=useState<TrainerClient>(previewClient)
  const [enabledModules,setEnabledModules]=useState<Record<string,boolean>>(()=>Object.fromEntries(serviceModules.map(m=>[m.code,preview])))
  const [fields,setFields]=useState(initialFields)
  const [rules,setRules]=useState<ReminderRule[]>([])
  const [loading,setLoading]=useState(!preview)
  const [saving,setSaving]=useState(false)
  const [notice,setNotice]=useState('')
  const [programs,setPrograms]=useState<TrainerProgramSummary[]>([])
  const [programBusy,setProgramBusy]=useState<string|null>(null)
  const [availablePrograms,setAvailablePrograms]=useState<TrainerProgramSummary[]>([])
  const [programPickerOpen,setProgramPickerOpen]=useState(false)
  const [nutritionPlans,setNutritionPlans]=useState<TrainerClientNutritionPlanSummary[]>([])

  useEffect(()=>{
    if(preview){setLoading(false);return}
    Promise.all([loadTrainerClient(clientId),loadClientModules(clientId),loadClientTracking(clientId),loadClientReminderRules(clientId),loadClientTrainingPrograms(clientId),loadTrainerClientNutritionPlans(clientId)])
      .then(([c,m,t,r,p,np])=>{
        setClient(c)
        setEnabledModules(prev=>({...prev,...m}))
        setFields(prev=>{
          const next={...prev}
          Object.entries(t).forEach(([code,val])=>{if(next[code])next[code]={...next[code],...val}})
          return next
        })
        setRules(r)
        setPrograms(p)
        setNutritionPlans(np)
        loadTrainerPrograms().then(setAvailablePrograms).catch(e=>setNotice(e instanceof Error?e.message:'Не удалось загрузить список программ'))
      })
      .catch(e=>setNotice(e instanceof Error?e.message:'Не удалось загрузить клиента'))
      .finally(()=>setLoading(false))
  },[clientId,preview])

  function patchField(code:string,patch:Record<string,boolean>){setFields(prev=>({...prev,[code]:{...prev[code],...patch}}))}
  function patchRule(id:string,patch:Partial<ReminderRule>){setRules(list=>list.map(r=>r.id===id?{...r,...patch}:r))}
  function toggleDay(rule:ReminderRule,day:number){
    const days=rule.weekdays??[]
    patchRule(rule.id,{weekdays:days.includes(day)?days.filter(x=>x!==day):[...days,day].sort()})
  }

  async function saveAll(){
    if(preview){setNotice('В preview изменения не пишутся в базу.');return}
    const ruleWithoutDays=rules.find(rule=>rule.enabled&&(!rule.weekdays||rule.weekdays.length===0))
    if(ruleWithoutDays){setNotice('У правила «'+(ruleWithoutDays.name||'Напоминание')+'» не выбран ни один день. Выбери хотя бы один день или выключи правило.');return}
    setSaving(true);setNotice('')
    try{
      await saveClientWorkspaceConfig(
        clientId,
        enabledModules,
        Object.fromEntries(Object.entries(fields).map(([code,v])=>[code,{enabled:v.enabled,required:v.required}])),
      )
      const persistedRules:ReminderRule[]=[]
      for(const rule of rules){
        const normalized={...rule,channels:['in_app']} as ReminderRule
        if(rule.id.startsWith('draft:')) persistedRules.push(await createClientReminderRuleFromDraft(normalized))
        else {await saveClientReminderRule(normalized);persistedRules.push(normalized)}
      }
      setRules(persistedRules)
      setNotice('Настройки клиента и напоминаний сохранены.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить изменения')}
    finally{setSaving(false)}
  }

  async function makeProgramCurrent(programId:string){
    if(preview)return
    setProgramBusy(programId);setNotice('')
    try{
      await activateTrainingProgram(programId)
      setPrograms(list=>list.map(p=>({...p,is_active:p.id===programId,status:p.id===programId?'active':(p.status==='active'?'archived':p.status)})))
      setNotice('Программа назначена клиенту.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось назначить программу')}
    finally{setProgramBusy(null)}
  }

  async function assignProgram(sourceId:string){
    if(preview)return
    setProgramBusy(sourceId);setNotice('')
    try{
      await assignTrainingProgramCopy(sourceId,clientId)
      const [clientPrograms,allPrograms]=await Promise.all([loadClientTrainingPrograms(clientId),loadTrainerPrograms()])
      setPrograms(clientPrograms);setAvailablePrograms(allPrograms);setProgramPickerOpen(false)
      setNotice('Новая программа назначена клиенту. Предыдущая сохранена в истории.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось назначить программу')}
    finally{setProgramBusy(null)}
  }

  function addRule(type:string){
    if(rules.some(rule=>rule.reminder_type===type)){setNotice('Такое правило уже добавлено. Измени существующее правило ниже.');return}
    const preset=reminderPreset(clientId,type,client.timezone)
    setRules(list=>[...list,{...preset,id:'draft:'+type,created_by:null}])
    setNotice('Правило добавлено в форму. Нажми «Сохранить изменения», чтобы применить его.')
  }

  if(loading)return <div className="library-empty">Загружаю клиента…</div>

  return <div className="page-stack">
    <div className="workspace-back"><Link to="/clients"><ChevronLeft size={17}/>Все клиенты</Link></div>
    <section className="client-workspace-head">
      <div className="client-identity">
        <div className="avatar xl">{client.display_name.slice(0,1)}</div>
        <div><div className="chip-row"><span className="status-pill">Активен</span>{client.nickname&&<span className="soft-chip">{client.nickname}</span>}</div><h2>{client.display_name}</h2><p>{client.age?client.age+' лет · ':''}{client.city||'город не указан'} · настрой только то, что реально нужно этому клиенту.</p></div>
      </div>
      <button className="primary-button compact" disabled={saving} onClick={()=>void saveAll()}><Save size={16}/>{saving?'Сохраняю…':'Сохранить изменения'}</button>
    </section>
    {notice&&<div className="drawer-notice">{notice}</div>}

    <section className="settings-section">
      <div className="settings-section-head"><div><span className="eyebrow">Программа</span><h3>Тренировки клиента</h3><p>Текущая программа и предыдущие версии.</p></div><button className="primary-button compact" onClick={()=>setProgramPickerOpen(v=>!v)}><Dumbbell size={16}/>{programPickerOpen?'Закрыть':'Сменить программу'}</button></div>
      {programPickerOpen&&<div className="program-picker"><strong>Выбери программу</strong><p>Назначение создаст клиенту отдельную копию. Текущая программа останется в истории.</p>{availablePrograms.filter(p=>p.is_template||p.client_id===clientId).length===0?<div className="library-empty">Нет доступных программ. Создай шаблон в Конструкторе.</div>:availablePrograms.filter(p=>p.is_template||p.client_id===clientId).map(p=><button key={p.id} className="program-picker-option" disabled={programBusy===p.id||p.is_active} onClick={()=>void assignProgram(p.id)}><span><strong>{p.name}</strong><small>{p.weekly_frequency}× в неделю{p.is_template?' · шаблон':` · v${p.version}`}</small></span><span>{p.is_active?'Текущая':'Назначить'}</span></button>)}</div>}
      {programs.length===0?<div className="library-empty">Программа пока не назначена. Создай её в Конструкторе и выбери этого клиента.</div>:<div className="trainer-program-list">
        {programs.map(program=><article className={'trainer-program-row '+(program.is_active?'is-active':'')} key={program.id}>
          <div><div className="chip-row">{program.is_active&&<span className="status-pill">Текущая</span>}<span className="soft-chip">v{program.version}</span></div><strong>{program.name}</strong><span>{program.weekly_frequency}× в неделю</span></div>
          <div className="program-row-actions">{program.is_active?<span className="program-row-status"><CheckCircle2 size={14}/>Назначена</span>:program.status!=='archived'?<button className="ghost-button compact" disabled={programBusy===program.id} onClick={()=>void makeProgramCurrent(program.id)}>Назначить</button>:<span className="program-row-status">Предыдущая версия</span>}</div>
        </article>)}
      </div>}
    </section>

    <section className="settings-section">
      <div className="settings-section-head"><div><span className="eyebrow">Питание</span><h3>Meal plan клиента</h3><p>Опубликованный план питания, который клиент видит в своём кабинете.</p></div><button className="primary-button compact" onClick={()=>navigate('/builder/nutrition/new?client='+clientId)}><Apple size={16}/>{nutritionPlans.length?'Изменить meal plan':'Создать meal plan'}</button></div>
      {nutritionPlans.length===0
        ? <div className="library-empty">Meal plan клиенту ещё не опубликован. Создай план и нажми «Опубликовать клиенту».</div>
        : <div className="trainer-program-list">{nutritionPlans.map(plan=><article className={'trainer-program-row '+(plan.status==='active'?'is-active':'')} key={plan.id}><div><div className="chip-row">{plan.status==='active'&&<span className="status-pill">Текущий</span>}<span className="soft-chip">v{plan.version}</span></div><strong>{plan.name}</strong><span>{plan.daily_kcal_target} ккал{plan.protein_target_g!=null?' · '+plan.protein_target_g+' г белка':''}</span></div><div className="program-row-actions"><span className="program-row-status">{plan.status==='active'?<><CheckCircle2 size={14}/>Назначен</>:plan.status==='draft'?'Черновик':'Предыдущая версия'}</span></div></article>)}</div>}
    </section>

    <section className="settings-section">
      <div className="settings-section-head"><div><span className="eyebrow">01 · Сопровождение</span><h3>Что входит в программу</h3><p>Разделы, которые клиент увидит в своём кабинете.</p></div></div>
      <div className="module-grid">{serviceModules.map(module=>{const Icon=moduleIcons[module.code];const checked=enabledModules[module.code]??false;return <article className={'module-card '+(checked?'is-enabled':'')} key={module.code}><div className="module-icon"><Icon size={20}/></div><div className="module-copy"><strong>{module.name}</strong><span>{module.description}</span></div><ToggleSwitch label={'Модуль '+module.name} checked={checked} onChange={value=>setEnabledModules(prev=>({...prev,[module.code]:value}))}/></article>})}</div>
    </section>

    <section className="settings-section">
      <div className="settings-section-head"><div><span className="eyebrow">02 · Поля</span><h3>Что клиент будет заполнять</h3><p>Обязательные поля нельзя скрыть. Необязательные клиент сможет убрать у себя, если это разрешено.</p></div></div>
      <div className="tracking-groups">{trackingGroups.map(group=><article className="tracking-group" key={group.title}><div className="tracking-group-head"><div><h4>{group.title}</h4><p>{group.description}</p></div></div><div className="tracking-table"><div className="tracking-row tracking-header"><span>Показатель</span><span>Показывать</span><span>Обязательное</span><span>Клиент может скрыть</span></div>{group.items.map(item=>{const current=fields[item.code];return <div className={'tracking-row '+(current.enabled?'':'is-muted')} key={item.code}><strong>{item.label}</strong><ToggleSwitch checked={current.enabled} onChange={enabled=>patchField(item.code,enabled?{enabled}:{enabled:false,required:false})} label={'Показывать '+item.label}/><ToggleSwitch checked={current.required} disabled={!current.enabled} onChange={required=>patchField(item.code,{required})} label={'Обязательное '+item.label}/><div className="permission-cell">{current.clientCanHide&&current.enabled&&!current.required?<span className="permission-ok"><EyeOff size={14}/>Да</span>:<span className="permission-no">Нет</span>}</div></div>})}</div></article>)}</div>
    </section>

    <section className="settings-section notification-rules-section">
      <div className="settings-section-head">
        <div><span className="eyebrow">03 · Уведомления</span><h3>Правила напоминаний</h3><p>Система может пропускать уведомление, если действие уже выполнено. В пилоте используем только уведомления внутри Andrey Fit.</p></div>
        <div className="reminder-add-menu">
          {[
            ['weight','Вес'],['waist','Талия'],['nutrition','Питание'],['daily_checkin','Самочувствие'],
            ['monthly_measurements','Замеры месяца'],['progress_photo','Фото'],['monthly_checkin','Итоги месяца'],['workout','Тренировка'],
          ].map(([type,label])=>{const exists=rules.some(rule=>rule.reminder_type===type);return <button className="ghost-button" key={type} disabled={exists} onClick={()=>addRule(type)}><Plus size={14}/>{exists?label+' · добавлено':label}</button>})}
        </div>
      </div>
      {rules.length===0?<div className="library-empty">Правил пока нет. Добавь только те напоминания, которые действительно нужны.</div>:<div className="reminder-rule-list">
        {rules.map(rule=><article className={'reminder-rule-card '+(rule.enabled?'':'is-disabled')} key={rule.id}>
          <div className="reminder-rule-main">
            <div className="reminder-rule-name-wrap"><input className="reminder-rule-name" value={rule.name??''} onChange={e=>patchRule(rule.id,{name:e.target.value})}/>{rule.id.startsWith('draft:')&&<small>не сохранено</small>}</div>
            <label>Время<input type="time" value={rule.local_time.slice(0,5)} onChange={e=>patchRule(rule.id,{local_time:e.target.value+':00',last_processed_local_date:undefined} as Partial<ReminderRule>)}/></label>
            <label>Кому<select value={rule.recipient_mode} onChange={e=>patchRule(rule.id,{recipient_mode:e.target.value as ReminderRule['recipient_mode']})}><option value="client">Клиенту</option><option value="coach">Тренеру</option><option value="both">Обоим</option></select></label>
            <ToggleSwitch checked={rule.enabled} onChange={enabled=>patchRule(rule.id,{enabled})} label="Правило включено"/>
          </div>
          <div className="weekday-picker">{weekdayLabels.map((label,i)=>{const day=i+1;return <button key={day} className={rule.weekdays?.includes(day)?'is-active':''} onClick={()=>toggleDay(rule,day)}>{label}</button>})}</div>
          <div className="reminder-rule-options">
            <label className="rule-check"><input type="checkbox" checked={rule.skip_if_completed} onChange={e=>patchRule(rule.id,{skip_if_completed:e.target.checked})}/>Не напоминать, если уже выполнено</label>
            <span className="soft-chip">в приложении</span>
          </div>
          <div className="reminder-copy-fields"><input value={rule.title_template??''} onChange={e=>patchRule(rule.id,{title_template:e.target.value})} placeholder="Заголовок уведомления"/><input value={rule.body_template??''} onChange={e=>patchRule(rule.id,{body_template:e.target.value})} placeholder="Текст уведомления"/></div>
        </article>)}
      </div>}
    </section>
  </div>
}
