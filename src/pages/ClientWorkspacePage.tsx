import { useEffect, useMemo, useState } from 'react'
import { Apple, Bell, CheckCircle2, ChevronLeft, Dumbbell, EyeOff, Gauge, Plus, Save, Send } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { UnsavedChangesGuard } from '../components/UnsavedChangesGuard'
import { serviceModules, trackingGroups } from '../data/platformDemo'
import { createClientTelegramLink, loadClientModules, loadClientTelegramConnection, loadClientTracking, loadTrainerClient, saveClientWorkspace, type TrainerClient } from '../features/clients/service'
import { loadTrainerClientJournal, saveTrainerClientTargets, type TrainerClientJournal, type TrainerClientTargets } from '../features/clients/journal'
import { createNutritionPlanRevision, loadTrainerClientNutritionMode, loadTrainerClientNutritionPlans, setNutritionTrackingMode, type NutritionTrackingMode, type TrainerClientNutritionPlanSummary } from '../features/nutrition/service'
import { chooseNutritionEditTarget } from '../features/nutrition/versioning'
import { loadClientReminderRules, reminderPreset, type ReminderRule } from '../features/notifications/service'
import { activateTrainingProgram, assignTrainingProgramCopy, loadClientTrainingPrograms, loadTrainerPrograms, type TrainerProgramSummary } from '../features/programs/service'
import { showAppToast } from '../lib/toast'

type Props={preview:boolean}
const moduleIcons={nutrition:Apple,training:Dumbbell,progress:Gauge,checkins:Gauge,notifications:Bell} as const
const weekdayLabels=['ПН','ВТ','СР','ЧТ','ПТ','СБ','ВС']

function workspaceRuleSignature(rule:ReminderRule){
  return JSON.stringify({
    module_code:rule.module_code??null,
    reminder_type:rule.reminder_type,
    name:rule.name??null,
    local_time:(rule.local_time||'').slice(0,5),
    weekdays:[...(rule.weekdays??[])].sort((a,b)=>a-b),
    timezone:rule.timezone,
    enabled:rule.enabled,
    channels:[...(rule.channels??[])].sort(),
    recipient_mode:rule.recipient_mode,
    skip_if_completed:rule.skip_if_completed,
    title_template:rule.title_template??null,
    body_template:rule.body_template??null,
    action_path:rule.action_path??null,
    settings:rule.settings??{},
  })
}
function workspaceSemanticSignature(
  modules:Record<string,boolean>,
  tracking:Record<string,{enabled:boolean;required:boolean}>,
  rules:ReminderRule[],
){
  return JSON.stringify({
    modules:Object.entries(modules).sort(([a],[b])=>a.localeCompare(b)),
    tracking:Object.entries(tracking).sort(([a],[b])=>a.localeCompare(b)),
    rules:rules.map(workspaceRuleSignature).sort(),
  })
}

const previewClient:TrainerClient={id:'sergey',display_name:'Сергей',login_alias:'sergey-r8m3',nickname:'Музыкант',age:37,city:null,avatar_key:'fox',timezone:'Europe/Moscow',status:'active',started_at:'2026-09-27',ended_at:null,last_activity_at:'2026-10-01T18:20:00+03:00',last_activity_kind:'workout'}

export function ClientWorkspacePage({preview}:Props){
  const {clientId=''}=useParams()
  const navigate=useNavigate()
  const initialFields=useMemo(()=>Object.fromEntries(trackingGroups.flatMap(g=>g.items.map(i=>[i.code,{enabled:i.enabled,required:i.required,clientCanHide:i.clientCanHide,label:i.label}]))),[])
  const [client,setClient]=useState<TrainerClient>(previewClient)
  const [enabledModules,setEnabledModules]=useState<Record<string,boolean>>(()=>Object.fromEntries(serviceModules.map(m=>[m.code,preview])))
  const [fields,setFields]=useState(initialFields)
  const [rules,setRules]=useState<ReminderRule[]>([])
  const [loading,setLoading]=useState(!preview)
  const [coreLoadFailed,setCoreLoadFailed]=useState(false)
  const [workspaceReloadKey,setWorkspaceReloadKey]=useState(0)
  const [saving,setSaving]=useState(false)
  const [notice,setNotice]=useState('')
  const [programs,setPrograms]=useState<TrainerProgramSummary[]>([])
  const [programBusy,setProgramBusy]=useState<string|null>(null)
  const [availablePrograms,setAvailablePrograms]=useState<TrainerProgramSummary[]>([])
  const [programPickerOpen,setProgramPickerOpen]=useState(false)
  const [nutritionPlans,setNutritionPlans]=useState<TrainerClientNutritionPlanSummary[]>(preview?[{
    id:'preview-nutrition-active',name:'Базовый рацион',status:'active',version:2,
    daily_kcal_target:2300,protein_target_g:150,published_at:'2026-10-01T10:00:00Z',updated_at:'2026-10-01T10:00:00Z',
  }]:[])
  const [journal,setJournal]=useState<TrainerClientJournal|null>(null)
  const [targetForm,setTargetForm]=useState({calories:'',tolerance:'100',protein:'',fatMin:'',fatMax:'',carbs:''})
  const [targetsBusy,setTargetsBusy]=useState(false)
  const [nutritionMode,setNutritionMode]=useState<NutritionTrackingMode>('meal_plan')
  const [nutritionModeBusy,setNutritionModeBusy]=useState(false)
  const [nutritionPlanBusy,setNutritionPlanBusy]=useState(false)
  const [savedWorkspaceSnapshot,setSavedWorkspaceSnapshot]=useState<string|null>(null)
  const [telegramLinkBusy,setTelegramLinkBusy]=useState(false)
  const [telegramConnectionBusy,setTelegramConnectionBusy]=useState(!preview)
  const [telegramConnected,setTelegramConnected]=useState<boolean|null>(preview?false:null)

  useEffect(()=>{
    if(preview){setLoading(false);setCoreLoadFailed(false);return}
    let cancelled=false
    setLoading(true)
    setCoreLoadFailed(false)
    setSavedWorkspaceSnapshot(null)
    setNotice('')
    const addNotice=(message:string)=>{if(!cancelled)setNotice(current=>current?current+' '+message:message)}

    // Core editable state is all-or-nothing. Never expose default values for editing
    // if even one source failed, otherwise a later save could overwrite real data.
    Promise.all([loadTrainerClient(clientId),loadClientModules(clientId),loadClientTracking(clientId),loadClientReminderRules(clientId)])
      .then(([clientData,modules,tracking,reminders])=>{
        if(cancelled)return
        setClient(clientData)
        setEnabledModules(prev=>({...prev,...modules}))
        setFields(prev=>{
          const next={...prev}
          Object.entries(tracking).forEach(([code,val])=>{if(next[code])next[code]={...next[code],...val}})
          return next
        })
        setRules(reminders)
      })
      .catch(e=>{
        if(cancelled)return
        setCoreLoadFailed(true)
        addNotice((e instanceof Error?e.message:'Не удалось загрузить основные настройки клиента')+' Изменения заблокированы, чтобы не перезаписать данные значениями по умолчанию.')
      })
      .finally(()=>{if(!cancelled)setLoading(false)})

    void loadClientTrainingPrograms(clientId)
      .then(value=>{if(!cancelled)setPrograms(value)})
      .catch(()=>addNotice('Не удалось загрузить программы клиента.'))

    void loadTrainerPrograms()
      .then(value=>{if(!cancelled)setAvailablePrograms(value)})
      .catch(()=>addNotice('Не удалось загрузить список программ.'))

    void loadTrainerClientNutritionPlans(clientId)
      .then(value=>{if(!cancelled)setNutritionPlans(value)})
      .catch(()=>addNotice('Не удалось загрузить Meal Plan.'))

    void loadTrainerClientNutritionMode(clientId)
      .then(value=>{if(!cancelled)setNutritionMode(value)})
      .catch(()=>addNotice('Не удалось загрузить режим питания.'))

    void loadTrainerClientJournal(clientId)
      .then(value=>{
        if(cancelled)return
        setJournal(value)
        const t=value.targets
        setTargetForm({
          calories:t?.calories_target==null?'':String(t.calories_target),
          tolerance:String(t?.calorie_tolerance??100),
          protein:t?.protein_target_g==null?'':String(t.protein_target_g),
          fatMin:t?.fat_min_g==null?'':String(t.fat_min_g),
          fatMax:t?.fat_max_g==null?'':String(t.fat_max_g),
          carbs:t?.carbs_target_g==null?'':String(t.carbs_target_g),
        })
      })
      .catch(()=>addNotice('Не удалось загрузить дневник и цели клиента.'))

    void loadClientTelegramConnection(clientId)
      .then(value=>{if(!cancelled)setTelegramConnected(value)})
      .catch(()=>{if(!cancelled){setTelegramConnected(null);addNotice('Не удалось проверить подключение Telegram.')}})
      .finally(()=>{if(!cancelled)setTelegramConnectionBusy(false)})

    return()=>{cancelled=true}
  },[clientId,preview,workspaceReloadKey])

  const workspaceEditable=preview||client.status==='active'
  const clientStatusLabel=client.status==='paused'?'Заморожен':client.status==='finished'?'Архив':'Активен'

  const currentWorkspaceSnapshot=useMemo(()=>JSON.stringify({
    modules:enabledModules,
    tracking:Object.fromEntries(Object.entries(fields).map(([code,v])=>[code,{enabled:v.enabled,required:v.required}])),
    rules,
  }),[enabledModules,fields,rules])

  useEffect(()=>{
    if(!loading&&!coreLoadFailed&&savedWorkspaceSnapshot===null)setSavedWorkspaceSnapshot(currentWorkspaceSnapshot)
  },[loading,coreLoadFailed,savedWorkspaceSnapshot,currentWorkspaceSnapshot])

  function patchField(code:string,patch:Record<string,boolean>){setFields(prev=>({...prev,[code]:{...prev[code],...patch}}))}
  function patchRule(id:string,patch:Partial<ReminderRule>){setRules(list=>list.map(r=>r.id===id?{...r,...patch}:r))}
  function toggleDay(rule:ReminderRule,day:number){
    const days=rule.weekdays??[]
    patchRule(rule.id,{weekdays:days.includes(day)?days.filter(x=>x!==day):[...days,day].sort()})
  }

  async function saveAll():Promise<boolean>{
    if(coreLoadFailed){setNotice('Основные настройки клиента загружены не полностью. Обнови данные перед сохранением.');return false}
    if(!workspaceEditable){setNotice('Архивный или замороженный клиент доступен только для просмотра. Сначала верни его в активное сопровождение.');return false}
    if(preview){setNotice('В preview изменения не пишутся в базу.');return false}
    const ruleWithoutDays=rules.find(rule=>rule.enabled&&(!rule.weekdays||rule.weekdays.length===0))
    if(ruleWithoutDays){setNotice('У правила «'+(ruleWithoutDays.name||'Напоминание')+'» не выбран ни один день. Выбери хотя бы один день или выключи правило.');return false}
    setSaving(true);setNotice('')
    try{
      const savedRules=await saveClientWorkspace(
        clientId,
        enabledModules,
        Object.fromEntries(Object.entries(fields).map(([code,v])=>[code,{enabled:v.enabled,required:v.required}])),
        rules.map(rule=>({...rule,channels:['in_app','telegram']})),
      )
      const nextRules=savedRules as ReminderRule[]
      setRules(nextRules)
      setSavedWorkspaceSnapshot(JSON.stringify({
        modules:enabledModules,
        tracking:Object.fromEntries(Object.entries(fields).map(([code,v])=>[code,{enabled:v.enabled,required:v.required}])),
        rules:nextRules,
      }))
      showAppToast('Настройки клиента и напоминаний сохранены.')
      return true
    }catch(e){
      const requestedTracking=Object.fromEntries(Object.entries(fields).map(([code,v])=>[code,{enabled:v.enabled,required:v.required}]))
      const requestedRules=rules.map(rule=>({...rule,channels:['in_app','telegram']}))
      try{
        const [actualModules,actualTracking,actualRules]=await Promise.all([
          loadClientModules(clientId),
          loadClientTracking(clientId),
          loadClientReminderRules(clientId),
        ])
        if(workspaceSemanticSignature(actualModules,actualTracking,actualRules)
          ===workspaceSemanticSignature(enabledModules,requestedTracking,requestedRules)){
          const nextFields={...fields}
          Object.entries(actualTracking).forEach(([code,value])=>{
            if(nextFields[code])nextFields[code]={...nextFields[code],...value}
          })
          const nextModules={...enabledModules,...actualModules}
          setEnabledModules(nextModules)
          setFields(nextFields)
          setRules(actualRules)
          setSavedWorkspaceSnapshot(JSON.stringify({
            modules:nextModules,
            tracking:Object.fromEntries(Object.entries(nextFields).map(([code,v])=>[code,{enabled:v.enabled,required:v.required}])),
            rules:actualRules,
          }))
          showAppToast('Настройки клиента уже были сохранены на сервере.','info')
          return true
        }
      }catch{}
      setNotice(e instanceof Error?e.message:'Не удалось сохранить изменения')
      return false
    }
    finally{setSaving(false)}
  }

  function optionalNumber(value:string){
    const normalized=value.trim().replace(',','.')
    if(!normalized)return null
    const n=Number(normalized)
    return Number.isFinite(n)?n:null
  }

  async function saveTargets(){
    if(targetsBusy||!workspaceEditable)return
    const calories=optionalNumber(targetForm.calories)
    const tolerance=optionalNumber(targetForm.tolerance)??100
    const protein=optionalNumber(targetForm.protein)
    const fatMin=optionalNumber(targetForm.fatMin)
    const fatMax=optionalNumber(targetForm.fatMax)
    const carbs=optionalNumber(targetForm.carbs)
    if(calories!=null&&(calories<500||calories>10000)){setNotice('Проверь цель по калориям.');return}
    if(tolerance<0||tolerance>1000){setNotice('Допуск по калориям должен быть от 0 до 1000.');return}
    if(fatMin!=null&&fatMax!=null&&fatMin>fatMax){setNotice('Минимум жиров не может быть выше максимума.');return}
    setTargetsBusy(true);setNotice('')
    try{
      if(preview){
        showAppToast('Цели сохранены в preview.')
        return
      }
      const saved=await saveTrainerClientTargets(clientId,{
        calories_target:calories,calorie_tolerance:tolerance,protein_target_g:protein,
        fat_min_g:fatMin,fat_max_g:fatMax,carbs_target_g:carbs,
      },journal?.targets)
      setJournal(current=>current?{...current,targets:saved}:current)
      showAppToast('Цели клиента сохранены.')
    }catch(e){
      setNotice(e instanceof Error?e.message:'Не удалось сохранить цели клиента')
    }finally{setTargetsBusy(false)}
  }

  async function switchClientNutritionMode(next:NutritionTrackingMode){
    if(nutritionModeBusy||next===nutritionMode)return
    const hasActivePlan=nutritionPlans.some(plan=>plan.status==='active')
    if(next==='meal_plan'&&!hasActivePlan){setNotice('Сначала создай и опубликуй клиенту Meal Plan.');return}
    setNutritionModeBusy(true);setNotice('')
    try{
      if(!preview)await setNutritionTrackingMode(clientId,next)
      setNutritionMode(next)
      showAppToast(next==='meal_plan'
        ? 'Meal Plan снова включён для клиента.'
        : 'Клиент переведён на подсчёт калорий. Его Meal Plan сохранён для быстрого возврата.')
    }catch(e){
      if(!preview){
        try{
          const actual=await loadTrainerClientNutritionMode(clientId)
          setNutritionMode(actual)
          if(actual===next){
            showAppToast(next==='meal_plan'?'Meal Plan уже включён для клиента.':'Клиент уже переведён на подсчёт калорий.','info')
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось переключить режим питания')
    }
    finally{setNutritionModeBusy(false)}
  }

  async function editNutritionPlan(){
    if(nutritionPlanBusy)return
    const target=chooseNutritionEditTarget(nutritionPlans)
    if(target.kind==='resume_draft'){
      navigate('/builder/nutrition/'+target.planId+'/edit')
      return
    }
    if(target.kind==='create_new'){
      navigate('/builder/nutrition/new?client='+clientId)
      return
    }
    if(preview){
      navigate('/builder/nutrition/preview-revision/edit')
      return
    }

    setNutritionPlanBusy(true);setNotice('')
    try{
      const id=await createNutritionPlanRevision(target.planId)
      try{setNutritionPlans(await loadTrainerClientNutritionPlans(clientId))}catch{}
      navigate('/builder/nutrition/'+id+'/edit')
    }catch(error){
      try{
        const actual=await loadTrainerClientNutritionPlans(clientId)
        setNutritionPlans(actual)
        const recovered=actual.find(plan=>plan.status==='draft')
        if(recovered){
          navigate('/builder/nutrition/'+recovered.id+'/edit')
          showAppToast('Черновик новой версии уже был создан на сервере.','info')
          return
        }
      }catch{}
      setNotice(error instanceof Error?error.message:'Не удалось создать новую версию Meal Plan')
    }finally{setNutritionPlanBusy(false)}
  }

  async function makeProgramCurrent(programId:string){
    if(preview)return
    setProgramBusy(programId);setNotice('')
    try{
      await activateTrainingProgram(programId)
      setPrograms(list=>list.map(p=>({...p,is_active:p.id===programId,status:p.id===programId?'active':(p.status==='active'?'archived':p.status)})))
      showAppToast('Программа назначена клиенту.')
    }catch(e){
      try{
        const actual=await loadClientTrainingPrograms(clientId)
        setPrograms(actual)
        if(actual.some(program=>program.id===programId&&program.is_active)){
          showAppToast('Программа уже назначена клиенту.','info')
          return
        }
      }catch{}
      setNotice(e instanceof Error?e.message:'Не удалось назначить программу')
    }
    finally{setProgramBusy(null)}
  }

  async function assignProgram(sourceId:string){
    if(preview)return
    const knownProgramIds=new Set(programs.map(program=>program.id))
    setProgramBusy(sourceId);setNotice('')
    try{
      const assignedId=await assignTrainingProgramCopy(sourceId,clientId)
      setProgramPickerOpen(false)
      showAppToast('Новая программа назначена клиенту. Предыдущая сохранена в истории.')
      const [clientProgramsResult,allProgramsResult]=await Promise.allSettled([
        loadClientTrainingPrograms(clientId),
        loadTrainerPrograms(),
      ])
      if(clientProgramsResult.status==='fulfilled')setPrograms(clientProgramsResult.value)
      if(allProgramsResult.status==='fulfilled')setAvailablePrograms(allProgramsResult.value)
      if(clientProgramsResult.status==='rejected'||allProgramsResult.status==='rejected'){
        setNotice('Программа назначена, но список не удалось полностью обновить. Повторное назначение не требуется.')
      }else if(!clientProgramsResult.value.some(program=>program.id===assignedId||program.is_active)){
        setNotice('Программа назначена, но новая версия пока не появилась в списке. Обнови страницу перед повторным назначением.')
      }
    }catch(e){
      // The copy RPC may have committed before the response was lost. A newly created active id
      // is reliable evidence; matching only by name would risk a false success.
      try{
        const actual=await loadClientTrainingPrograms(clientId)
        setPrograms(actual)
        const newlyCreatedActive=actual.find(program=>program.is_active&&!knownProgramIds.has(program.id))
        if(newlyCreatedActive){
          setProgramPickerOpen(false)
          showAppToast('Программа уже была назначена клиенту.','info')
          return
        }
      }catch{}
      setNotice(e instanceof Error?e.message:'Не удалось назначить программу')
    }
    finally{setProgramBusy(null)}
  }

  async function retryTelegramConnection(){
    if(preview){setTelegramConnected(false);return}
    if(telegramConnectionBusy)return
    setTelegramConnectionBusy(true);setNotice('')
    try{
      setTelegramConnected(await loadClientTelegramConnection(clientId))
    }catch(e){
      setTelegramConnected(null)
      setNotice(e instanceof Error?e.message:'Не удалось проверить подключение Telegram.')
    }finally{setTelegramConnectionBusy(false)}
  }

  async function copyTelegramLink(){
    if(preview){setNotice('В preview Telegram-ссылка не создаётся.');return}
    if(telegramLinkBusy)return
    setTelegramLinkBusy(true);setNotice('')
    try{
      const url=await createClientTelegramLink(clientId)
      try{
        await navigator.clipboard.writeText(url)
        showAppToast('Telegram-ссылка скопирована. Она действует 15 минут.')
      }catch{
        setNotice('Telegram-ссылка действует 15 минут: '+url)
      }
    }catch(e){
      setNotice(e instanceof Error?e.message:'Не удалось создать Telegram-ссылку.')
    }finally{
      setTelegramLinkBusy(false)
    }
  }

  function addRule(type:string){
    if(rules.some(rule=>rule.reminder_type===type)){setNotice('Такое правило уже добавлено. Измени существующее правило ниже.');return}
    const preset=reminderPreset(clientId,type,client.timezone)
    setRules(list=>[...list,{...preset,id:'draft:'+type,created_by:null}])
    setNotice('Правило добавлено в форму. Нажми «Сохранить изменения», чтобы применить его.')
  }

  const nutritionDraft=nutritionPlans.find(plan=>plan.status==='draft')??null
  const activeNutritionPlan=nutritionPlans.find(plan=>plan.status==='active')??null

  if(loading)return <div className="library-empty">Загружаю клиента…</div>
  if(coreLoadFailed)return <div className="page-stack"><div className="workspace-back"><Link to="/clients"><ChevronLeft size={17}/>Все клиенты</Link></div><div className="library-empty"><strong>Не удалось безопасно загрузить карточку клиента.</strong><span>Редактирование не открыто, чтобы случайно не перезаписать реальные настройки.</span><button className="primary-button compact" onClick={()=>setWorkspaceReloadKey(key=>key+1)}>Повторить загрузку</button></div>{notice&&<div className="drawer-notice">{notice}</div>}</div>

  return <div className="page-stack">
    <UnsavedChangesGuard when={!preview&&workspaceEditable&&savedWorkspaceSnapshot!==null&&currentWorkspaceSnapshot!==savedWorkspaceSnapshot} onSave={saveAll} saving={saving}/>
    <div className="workspace-back"><Link to="/clients"><ChevronLeft size={17}/>Все клиенты</Link></div>
    <section className="client-workspace-head">
      <div className="client-identity">
        <div className="avatar xl">{client.display_name.slice(0,1)}</div>
        <div><div className="chip-row"><span className={'status-pill '+(client.status==='active'?'':client.status==='paused'?'is-warning':'is-muted')}>{clientStatusLabel}</span>{client.nickname&&<span className="soft-chip">{client.nickname}</span>}{telegramConnected&&<span className="soft-chip">Telegram подключён</span>}</div><h2>{client.display_name}</h2><p>{client.age?client.age+' лет · ':''}{client.city||'город не указан'} · {workspaceEditable?'настрой только то, что реально нужно этому клиенту.':'данные сохранены; настройки доступны только для просмотра.'}</p></div>
      </div>
      {workspaceEditable&&<div className="client-workspace-actions">
        <button className="ghost-button compact" disabled={telegramLinkBusy||telegramConnectionBusy||telegramConnected===true} onClick={()=>telegramConnected===null?void retryTelegramConnection():void copyTelegramLink()}><Send size={16}/>{telegramConnected===true?'Telegram подключён':telegramConnectionBusy?'Проверяю Telegram…':telegramConnected===null?'Проверить Telegram':telegramLinkBusy?'Создаю…':'Подключить Telegram'}</button>
        <button className="primary-button compact" disabled={saving} onClick={()=>void saveAll()}><Save size={16}/>{saving?'Сохраняю…':'Сохранить изменения'}</button>
      </div>}
    </section>
    {notice&&<div className="drawer-notice">{notice}</div>}
    {!workspaceEditable&&<div className="drawer-notice workspace-readonly-notice">{client.status==='paused'?'Сопровождение заморожено. История и настройки доступны для просмотра; изменения заблокированы до возврата клиента в active.':'Клиент в архиве. История и настройки сохранены и доступны для просмотра; чтобы снова менять программу, питание и напоминания, сначала верни клиента в active.'}</div>}

    <fieldset className="workspace-settings-fieldset" disabled={!workspaceEditable}>
    <section className="settings-section">
      <div className="settings-section-head"><div><span className="eyebrow">Программа</span><h3>Тренировки клиента</h3><p>Текущая программа и предыдущие версии.</p></div><button className="primary-button compact" disabled={Boolean(programBusy)} onClick={()=>setProgramPickerOpen(v=>!v)}><Dumbbell size={16}/>{programPickerOpen?'Закрыть':'Сменить программу'}</button></div>
      {programPickerOpen&&<div className="program-picker"><strong>Выбери программу</strong><p>Назначение создаст клиенту отдельную копию. Текущая программа останется в истории.</p>{availablePrograms.filter(p=>p.is_template||p.client_id===clientId).length===0?<div className="library-empty">Нет доступных программ. Создай шаблон в Конструкторе.</div>:availablePrograms.filter(p=>p.is_template||p.client_id===clientId).map(p=><button key={p.id} className="program-picker-option" disabled={Boolean(programBusy)||p.is_active} onClick={()=>void assignProgram(p.id)}><span><strong>{p.name}</strong><small>{p.weekly_frequency}× в неделю{p.is_template?' · шаблон':` · v${p.version}`}</small></span><span>{p.is_active?'Текущая':'Назначить'}</span></button>)}</div>}
      {programs.length===0?<div className="library-empty">Программа пока не назначена. Создай её в Конструкторе и выбери этого клиента.</div>:<div className="trainer-program-list">
        {programs.map(program=><article className={'trainer-program-row '+(program.is_active?'is-active':'')} key={program.id}>
          <div><div className="chip-row">{program.is_active&&<span className="status-pill">Текущая</span>}<span className="soft-chip">v{program.version}</span></div><strong>{program.name}</strong><span>{program.weekly_frequency}× в неделю</span></div>
          <div className="program-row-actions">{program.is_active?<><span className="program-row-status"><CheckCircle2 size={14}/>Назначена</span><Link className="ghost-button compact" to={'/builder/programs/'+program.id+'/edit'}>Редактировать</Link></>:program.status!=='archived'?<><button className="ghost-button compact" disabled={Boolean(programBusy)} onClick={()=>void makeProgramCurrent(program.id)}>Назначить</button><Link className="ghost-button compact" to={'/builder/programs/'+program.id+'/edit'}>Продолжить</Link></>:<span className="program-row-status">Предыдущая версия</span>}</div>
        </article>)}
      </div>}
    </section>

    <section className="settings-section">
      <div className="settings-section-head"><div><span className="eyebrow">Питание</span><h3>Режим питания клиента</h3><p>Meal Plan можно временно выключить без удаления. При возврате клиент получает последнюю сохранённую версию.</p></div><button className="primary-button compact" disabled={nutritionPlanBusy} onClick={()=>void editNutritionPlan()}><Apple size={16}/>{nutritionPlanBusy?'Готовлю версию…':nutritionDraft?'Продолжить черновик':activeNutritionPlan?'Изменить Meal Plan':'Создать Meal Plan'}</button></div>

      <div className="trainer-nutrition-mode-card">
        <div>
          <span>Сейчас используется</span>
          <strong>{nutritionMode==='meal_plan'?'Meal Plan':'Подсчёт калорий'}</strong>
          <small>{nutritionMode==='meal_plan'?'Клиент видит структуру приёмов пищи и может отмечать соблюдение плана.':'Клиент вводит фактические калории; сохранённый Meal Plan остаётся нетронутым.'}</small>
        </div>
        <div className="trainer-nutrition-mode-actions">
          {nutritionMode==='meal_plan'
            ? <button className="ghost-button compact" disabled={nutritionModeBusy||!nutritionPlans.some(plan=>plan.status==='active')} onClick={()=>void switchClientNutritionMode('calorie_tracking')}>{nutritionModeBusy?'Переключаю…':'Перевести на подсчёт калорий'}</button>
            : <button className="primary-button compact" disabled={nutritionModeBusy||!nutritionPlans.some(plan=>plan.status==='active')} onClick={()=>void switchClientNutritionMode('meal_plan')}>{nutritionModeBusy?'Возвращаю…':'Вернуть Meal Plan'}</button>}
        </div>
      </div>

      {nutritionPlans.length===0
        ? <div className="library-empty">Meal Plan клиенту ещё не опубликован. Создай план и нажми «Опубликовать клиенту».</div>
        : <div className="trainer-program-list">{nutritionPlans.map(plan=><article className={'trainer-program-row '+(plan.status==='active'?'is-active':'')} key={plan.id}><div><div className="chip-row">{plan.status==='active'&&<span className="status-pill">{nutritionMode==='meal_plan'?'Используется':'Сохранён для возврата'}</span>}<span className="soft-chip">v{plan.version}</span></div><strong>{plan.name}</strong><span>{plan.daily_kcal_target} ккал{plan.protein_target_g!=null?' · '+plan.protein_target_g+' г белка':''}</span></div><div className="program-row-actions"><span className="program-row-status">{plan.status==='active'?(nutritionMode==='meal_plan'?<><CheckCircle2 size={14}/>Активен</>:<>Сохранён</>):plan.status==='draft'?'Черновик':'Предыдущая версия'}</span>{plan.status==='draft'&&<Link className="ghost-button compact" to={'/builder/nutrition/'+plan.id+'/edit'}>Продолжить</Link>}{plan.status==='active'&&!nutritionDraft&&<button className="ghost-button compact" disabled={nutritionPlanBusy} onClick={()=>void editNutritionPlan()}>Редактировать</button>}</div></article>)}</div>}
    </section>

    <section className="settings-section client-journal-section">
      <div className="settings-section-head"><div><span className="eyebrow">Контроль</span><h3>Цели и дневник клиента</h3><p>То, что раньше жило в таблице: питание, шаги, замеры и ежемесячная самооценка.</p></div></div>
      <div className="client-targets-card">
        <div className="client-targets-grid">
          <label>Ккал / день<input inputMode="numeric" value={targetForm.calories} onChange={e=>setTargetForm(v=>({...v,calories:e.target.value}))}/></label>
          <label>Допуск, ± ккал<input inputMode="numeric" value={targetForm.tolerance} onChange={e=>setTargetForm(v=>({...v,tolerance:e.target.value}))}/></label>
          <label>Белок, г<input inputMode="decimal" value={targetForm.protein} onChange={e=>setTargetForm(v=>({...v,protein:e.target.value}))}/></label>
          <label>Жиры от, г<input inputMode="decimal" value={targetForm.fatMin} onChange={e=>setTargetForm(v=>({...v,fatMin:e.target.value}))}/></label>
          <label>Жиры до, г<input inputMode="decimal" value={targetForm.fatMax} onChange={e=>setTargetForm(v=>({...v,fatMax:e.target.value}))}/></label>
          <label>Углеводы, г <small>необязательно</small><input inputMode="decimal" value={targetForm.carbs} onChange={e=>setTargetForm(v=>({...v,carbs:e.target.value}))} placeholder="без цели"/></label>
        </div>
        {workspaceEditable&&<button className="ghost-button compact" disabled={targetsBusy} onClick={()=>void saveTargets()}><Save size={15}/>{targetsBusy?'Сохраняю…':'Сохранить цели'}</button>}
      </div>

      {!journal?<div className="library-empty">История пока не загружена.</div>:<div className="client-journal-grid">
        <article className="client-journal-card">
          <div className="client-journal-card-head"><strong>Ежедневно</strong><span>последние {journal.daily.length} записей</span></div>
          {journal.daily.length===0?<p>Записей пока нет.</p>:<div className="client-journal-days">{journal.daily.map(day=><div key={day.checkin_date}>
            <strong>{new Date(day.checkin_date+'T00:00:00').toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})}</strong>
            <span>{day.calories??'—'} ккал · Б {day.protein_g??'—'} · Ж {day.fat_g??'—'} · У {day.carbs_g??'—'}</span>
            <small>{day.steps==null?'Шаги —':day.steps.toLocaleString('ru-RU')+' шагов'} · голод {day.hunger??'—'} · энергия {day.energy??'—'} · стресс {day.stress??'—'} · сон {day.sleep??'—'} · легко {day.ease??'—'}</small>
          </div>)}</div>}
        </article>
        <article className="client-journal-card">
          <div className="client-journal-card-head"><strong>Вес и замеры</strong><span>история</span></div>
          {journal.measurements.length===0?<p>Замеров пока нет.</p>:<div className="client-journal-days">{journal.measurements.map(row=><div key={row.measured_at}>
            <strong>{new Date(row.measured_at+'T00:00:00').toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})}</strong>
            <span>Вес {row.weight_kg??'—'} кг · талия {row.waist_cm??'—'} см</span>
            {(row.chest_cm!=null||row.hips_cm!=null||row.thigh_cm!=null||row.arm_relaxed_cm!=null||row.arm_flexed_cm!=null)&&<small>Грудь {row.chest_cm??'—'} · таз {row.hips_cm??'—'} · бедро {row.thigh_cm??'—'} · рука {row.arm_relaxed_cm??'—'}/{row.arm_flexed_cm??'—'} см</small>}
            {row.note&&<small>{row.note}</small>}
          </div>)}</div>}
        </article>
        <article className="client-journal-card client-journal-card--monthly">
          <div className="client-journal-card-head"><strong>Ежемесячно</strong><span>{journal.monthly[0]?new Date(journal.monthly[0].checkin_date+'T00:00:00').toLocaleDateString('ru-RU'):'нет данных'}</span></div>
          {journal.monthly[0]?<><div className="client-monthly-scores">
            <span>Внешний вид <b>{journal.monthly[0].appearance??'—'}</b></span><span>Форма <b>{journal.monthly[0].fitness??'—'}</b></span>
            <span>Комфорт <b>{journal.monthly[0].physical_comfort??'—'}</b></span><span>Энергия <b>{journal.monthly[0].energy??'—'}</b></span>
            <span>Сон <b>{journal.monthly[0].sleep_recovery??'—'}</b></span><span>Питание <b>{journal.monthly[0].nutrition??'—'}</b></span>
            <span>Отношение к еде <b>{journal.monthly[0].relationship_with_food??'—'}</b></span>
          </div>
          <div className="client-monthly-text"><p><b>Улучшить:</b> {journal.monthly[0].improve||'—'}</p><p><b>Следующий шаг:</b> {journal.monthly[0].next_step||'—'}</p><p><b>Сохранить:</b> {journal.monthly[0].keep||'—'}</p></div></>:<p>Ежемесячной самооценки пока нет.</p>}
        </article>
      </div>}
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
        <div><span className="eyebrow">03 · Уведомления</span><h3>Правила напоминаний</h3><p>Система может пропускать уведомление, если действие уже выполнено. В приложении уведомления работают сразу; Telegram подключится к тем же правилам после привязки бота и учитывает настройки клиента.</p></div>
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
            <span className="soft-chip">приложение + Telegram*</span>
          </div>
          <div className="reminder-copy-fields"><input value={rule.title_template??''} onChange={e=>patchRule(rule.id,{title_template:e.target.value})} placeholder="Заголовок уведомления"/><input value={rule.body_template??''} onChange={e=>patchRule(rule.id,{body_template:e.target.value})} placeholder="Текст уведомления"/></div>
        </article>)}
      </div>}
    </section>
    </fieldset>
  </div>
}
