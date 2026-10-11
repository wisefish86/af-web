import { useEffect, useMemo, useState } from 'react'
import { Archive, Check, Clock3, Copy, KeyRound, PauseCircle, PlayCircle, Search, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  createClientTelegramInvite, deleteManagedClient, loadTrainerClients, resetManagedClientPassword, setManagedClientStatus,
  type ClientAccessCredentials, type TrainerClient,
} from '../features/clients/service'
import { demoClients } from '../data/demo'
import { getAppBaseUrl } from '../lib/appUrl'
import { showAppToast } from '../lib/toast'
import { UiLoadError } from '../ui/primitives'

type Props={preview:boolean}
type ClientFilter='active'|'paused'|'finished'
type LifecycleAction='pause'|'archive'|'activate'

const avatarEmoji:Record<string,string>={fox:'🦊',bear:'🐻',owl:'🦉',panda:'🐼',tiger:'🐯',dog:'🐶'}
const activityLabels:Record<string,string>={
  measurement:'замеры',
  daily_checkin:'дневной отчёт',
  self_assessment:'самооценка',
  workout:'тренировка',
  task:'контрольная отметка',
  message:'сообщение',
}

function statusLabel(status:string){return status==='paused'?'Заморожен':status==='finished'?'Архив':'Активный'}
function clientDisplayLabel(client:TrainerClient){
  const marker=client.nickname?.trim()?` (${client.nickname.trim()})`:''
  const age=client.age?`, ${client.age} лет`:''
  return client.display_name+marker+age
}
function activityText(client:TrainerClient){
  if(!client.last_activity_at)return 'Пока нет активности'
  const date=new Date(client.last_activity_at)
  const dateOnly=['measurement','daily_checkin','self_assessment'].includes(client.last_activity_kind??'')
  const when=date.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'})+
    (dateOnly?'':' · '+date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}))
  const kind=client.last_activity_kind?activityLabels[client.last_activity_kind]??'активность':'активность'
  return when+' · '+kind
}

export function AdminPage({preview}:Props) {
  const [clients,setClients]=useState<TrainerClient[]>([])
  const [query,setQuery]=useState('')
  const [filter,setFilter]=useState<ClientFilter>('active')
  const [loading,setLoading]=useState(!preview)
  const [clientsLoaded,setClientsLoaded]=useState(preview)
  const [creating,setCreating]=useState(false)
  const [busyClientId,setBusyClientId]=useState<string|null>(null)
  const [newClientOpen,setNewClientOpen]=useState(false)
  const [resetClient,setResetClient]=useState<TrainerClient|null>(null)
  const [lifecycleConfirm,setLifecycleConfirm]=useState<{client:TrainerClient;action:LifecycleAction}|null>(null)
  const [deleteClient,setDeleteClient]=useState<TrainerClient|null>(null)
  const [deleteConfirm,setDeleteConfirm]=useState('')
  const [inviteUrl,setInviteUrl]=useState('')
  const [inviteExpiresAt,setInviteExpiresAt]=useState('')
  const [inviteCopied,setInviteCopied]=useState(false)
  const [credentials,setCredentials]=useState<ClientAccessCredentials|null>(null)
  const [notice,setNotice]=useState('')
  const [loadError,setLoadError]=useState('')
  const [copied,setCopied]=useState(false)

  const previewRows:TrainerClient[]=demoClients.map((item,index)=>({
    id:index===0?'sergey':'vlada',
    display_name:item.name,
    login_alias:index===0?'sergey-r8m3':'vlada-k4p7',
    nickname:null,age:index===0?37:29,city:null,avatar_key:null,timezone:'Europe/Moscow',
    status:index===0?'active':'paused',started_at:'2026-01-01',ended_at:null,
    last_activity_at:index===0?'2026-10-01T18:20:00+03:00':'2026-09-28T00:00:00+03:00',
    last_activity_kind:index===0?'workout':'measurement',
  }))

  async function refresh(initial=false){
    if(preview)return true
    try{
      setClients(await loadTrainerClients())
      setClientsLoaded(true)
      setLoadError('')
      return true
    }catch{
      if(initial)setClientsLoaded(false)
      setLoadError('Не удалось загрузить список клиентов.')
      return false
    }
  }

  function retryClients(initial=false){
    setLoading(true);setLoadError('')
    void refresh(initial).finally(()=>setLoading(false))
  }

  useEffect(()=>{
    if(preview){setClients(previewRows);setLoading(false);return}
    void refresh(true).finally(()=>setLoading(false))
  },[preview])

  const counts=useMemo(()=>({
    active:clients.filter(c=>c.status==='active').length,
    paused:clients.filter(c=>c.status==='paused').length,
    finished:clients.filter(c=>c.status==='finished').length,
  }),[clients])

  const shown=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase('ru')
    return clients.filter(c=>c.status===filter&&(!q||[c.display_name,c.login_alias??'',c.nickname??'',c.city??''].join(' ').toLocaleLowerCase('ru').includes(q)))
  },[clients,query,filter])

  function openCreate(){
    setInviteUrl('')
    setInviteExpiresAt('')
    setInviteCopied(false)
    setNotice('')
    setNewClientOpen(true)
  }

  async function createInvite(){
    if(creating)return
    setCreating(true);setNotice('')
    try{
      if(preview){
        setInviteUrl('https://t.me/andreyfit_bot?start=invite_demo')
        setInviteExpiresAt(new Date(Date.now()+7*24*60*60*1000).toISOString())
      }else{
        const result=await createClientTelegramInvite()
        setInviteUrl(result.invite_url)
        setInviteExpiresAt(result.expires_at)
      }
      showAppToast('Telegram-приглашение готово. Отправь ссылку клиенту.')
    }catch(e){
      setNotice(e instanceof Error?e.message:'Не удалось создать приглашение')
    }finally{
      setCreating(false)
    }
  }

  async function copyInvite(){
    if(!inviteUrl)return
    try{
      await navigator.clipboard.writeText(inviteUrl)
      setInviteCopied(true)
      window.setTimeout(()=>setInviteCopied(false),1500)
    }catch{
      setNotice('Не удалось скопировать ссылку автоматически.')
    }
  }

  async function resetPassword(){
    if(!resetClient||busyClientId)return
    setBusyClientId(resetClient.id);setNotice('')
    try{
      const result=preview
        ? {client_id:resetClient.id,login:resetClient.login_alias||'demo-client',password:'New-8RqT-5mK2'}
        : await resetManagedClientPassword(resetClient.id)
      setCredentials(result);setResetClient(null)
      if(!preview)await refresh()
      showAppToast('Новый временный пароль создан. Старый пароль больше не работает.')
    }catch(e){
      const message=e instanceof Error?e.message:'Не удалось сменить пароль'
      setNotice(message+' Если запрос успел выполниться, старый пароль уже может не работать. Повтори сброс — будет выдан новый временный пароль.')
    }
    finally{setBusyClientId(null)}
  }

  async function applyLifecycle(){
    if(!lifecycleConfirm||busyClientId)return
    const {client,action}=lifecycleConfirm
    const status=action==='pause'?'paused':action==='archive'?'finished':'active'
    setBusyClientId(client.id);setNotice('')
    try{
      if(!preview)await setManagedClientStatus(client.id,status)
      setClients(rows=>rows.map(row=>row.id===client.id?{...row,status,ended_at:status==='finished'?new Date().toISOString().slice(0,10):null}:row))
      setLifecycleConfirm(null)
      setFilter(status as ClientFilter)
      showAppToast(status==='paused'?'Доступ клиента заморожен.':status==='finished'?'Клиент перенесён в архив.':'Сопровождение возобновлено.')
    }catch(e){
      if(!preview){
        try{
          const rows=await loadTrainerClients()
          setClients(rows);setClientsLoaded(true);setLoadError('')
          const actual=rows.find(row=>row.id===client.id)
          if(actual?.status===status){
            setLifecycleConfirm(null)
            setFilter(status as ClientFilter)
            showAppToast(status==='paused'?'Доступ клиента уже заморожен.':status==='finished'?'Клиент уже перенесён в архив.':'Сопровождение уже возобновлено.')
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось изменить статус клиента')
    }
    finally{setBusyClientId(null)}
  }

  async function hardDelete(){
    if(!deleteClient||deleteConfirm!=='УДАЛИТЬ'||busyClientId)return
    setBusyClientId(deleteClient.id);setNotice('')
    try{
      if(!preview)await deleteManagedClient(deleteClient.id)
      setClients(rows=>rows.filter(row=>row.id!==deleteClient.id))
      setDeleteClient(null);setDeleteConfirm('')
      showAppToast('Аккаунт и данные клиента удалены.')
    }catch(e){
      if(!preview){
        try{
          const rows=await loadTrainerClients()
          setClients(rows);setClientsLoaded(true);setLoadError('')
          if(!rows.some(row=>row.id===deleteClient.id)){
            setDeleteClient(null);setDeleteConfirm('')
            showAppToast('Аккаунт и данные клиента уже удалены.')
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось удалить клиента')
    }
    finally{setBusyClientId(null)}
  }

  function accessText(value:ClientAccessCredentials){
    return ['ANDREWAY Fit','Вход: '+getAppBaseUrl(),'Логин: '+value.login,'Временный пароль: '+value.password,'После первого входа приложение попросит установить свой пароль.'].join('\n')
  }
  async function copyAccess(){
    if(!credentials)return
    try{await navigator.clipboard.writeText(accessText(credentials));setCopied(true);window.setTimeout(()=>setCopied(false),1500)}
    catch{setNotice('Не удалось скопировать автоматически. Выдели данные вручную.')}
  }

  return <div className="page-stack">
    <section className="admin-toolbar">
      <div className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти клиента или логин"/></div>
      <button className="primary-button compact" onClick={openCreate}><UserPlus size={17}/>Добавить клиента</button>
    </section>

    <section className="panel client-access-explainer">
      <div className="panel-head"><div><span className="eyebrow">Клиенты</span><h3>История сохраняется, доступ управляется отдельно</h3></div><ShieldCheck size={19}/></div>
      <p className="panel-description">«Заморозить» — временно закрыть вход. «Архив» — завершить сопровождение и убрать клиента из активных. Удаление навсегда доступно только из архива и стирает историю.</p>
    </section>

    {credentials&&<section className="panel access-credentials-card">
      <div className="invite-created-head">
        <div><span className="eyebrow">Доступ готов</span><h3>Отправь клиенту эти данные</h3><p>Пароль временный: при первом входе клиент выберет имя и установит свой пароль.</p></div>
        <button className="icon-button" aria-label="Закрыть" onClick={()=>setCredentials(null)}><X size={15}/></button>
      </div>
      <div className="access-credentials-grid">
        <label>Ссылка<input readOnly value={getAppBaseUrl()}/></label>
        <label>Логин<input readOnly value={credentials.login}/></label>
        <label>Временный пароль<input readOnly value={credentials.password}/></label>
      </div>
      <div className="access-credentials-actions"><button className="primary-button compact" onClick={()=>void copyAccess()}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Скопировано':'Скопировать всё'}</button></div>
    </section>}

    {notice&&<div className="drawer-notice">{notice}</div>}
    {loadError&&clientsLoaded&&<UiLoadError message={loadError} hint="Показываем последний загруженный список; можно повторить обновление." onRetry={()=>retryClients(false)} retryLabel="Повторить загрузку"/>}

    <section className="panel clients-panel">
      <div className="panel-head"><div><span className="eyebrow">Подопечные</span><h3>{clients.length} клиентов</h3></div></div>
      <div className="client-lifecycle-tabs">
        <button className={filter==='active'?'is-active':''} onClick={()=>setFilter('active')}>Активные <span>{counts.active}</span></button>
        <button className={filter==='paused'?'is-active':''} onClick={()=>setFilter('paused')}>Замороженные <span>{counts.paused}</span></button>
        <button className={filter==='finished'?'is-active':''} onClick={()=>setFilter('finished')}>Архив <span>{counts.finished}</span></button>
      </div>

      {loading?<div className="library-empty">Загружаю клиентов…</div>:!clientsLoaded?<UiLoadError message={loadError||'Не удалось загрузить список клиентов.'} onRetry={()=>retryClients(true)}/>:shown.length===0?<div className="library-empty">{query?'Поиск ничего не нашёл.':filter==='active'?'Активных клиентов пока нет.':filter==='paused'?'Замороженных клиентов нет.':'Архив пуст.'}</div>:<>
        <div className="client-table live lifecycle header"><span>Клиент</span><span>Последняя активность</span><span>Доступ</span><span></span></div>
        {shown.map(c=><div className={'client-table live lifecycle client-status-'+c.status} key={c.id}>
          <div className="client-name"><div className="avatar small">{avatarEmoji[c.avatar_key??'']??c.display_name[0]}</div><div><strong>{clientDisplayLabel(c)}</strong><small>{statusLabel(c.status)}</small></div></div>
          <div className="client-last-activity"><Clock3 size={14}/><span>{activityText(c)}</span></div>
          <span className={'client-status-badge '+c.status}>{statusLabel(c.status)}</span>
          <div className="client-access-actions">
            {c.status==='active'&&<>
              <button className="ghost-button small" onClick={()=>setResetClient(c)}><KeyRound size={14}/>{c.login_alias?'Доступ':'Перевести вход'}</button>
              <Link className="ghost-button small" to={'/clients/'+c.id}>Открыть</Link>
              <button className="ghost-button small" onClick={()=>setLifecycleConfirm({client:c,action:'pause'})}><PauseCircle size={14}/>Заморозить</button>
              <button className="ghost-button small" onClick={()=>setLifecycleConfirm({client:c,action:'archive'})}><Archive size={14}/>В архив</button>
            </>}
            {c.status==='paused'&&<>
              <button className="primary-button small" onClick={()=>setLifecycleConfirm({client:c,action:'activate'})}><PlayCircle size={14}/>Возобновить</button>
              <button className="ghost-button small" onClick={()=>setLifecycleConfirm({client:c,action:'archive'})}><Archive size={14}/>В архив</button>
            </>}
            {c.status==='finished'&&<>
              <button className="ghost-button small" onClick={()=>setLifecycleConfirm({client:c,action:'activate'})}><PlayCircle size={14}/>Вернуть</button>
              <button className="ghost-button small danger-text-button" onClick={()=>{setDeleteConfirm('');setDeleteClient(c)}}><Trash2 size={14}/>Удалить</button>
            </>}
          </div>
        </div>)}
      </>}
    </section>

    {newClientOpen&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!creating)setNewClientOpen(false)}}>
      <aside className="exercise-drawer workout-sheet managed-client-sheet">
        <div className="drawer-head"><div><span className="eyebrow">Новый клиент</span><h3>Пригласить через Telegram</h3></div><button className="icon-button" disabled={creating} onClick={()=>setNewClientOpen(false)}><X size={18}/></button></div>
        <div className="drawer-body managed-client-form">
          <p className="sheet-description">Ничего заполнять за клиента не нужно. Отправь ему одноразовую ссылку: после открытия в Telegram кабинет создастся автоматически, а имя, метку и возраст он укажет сам.</p>
          {!inviteUrl
            ? <div className="finish-workout-actions">
                <button type="button" className="ghost-button" disabled={creating} onClick={()=>setNewClientOpen(false)}>Отмена</button>
                <button type="button" className="primary-button" disabled={creating} onClick={()=>void createInvite()}><UserPlus size={16}/>{creating?'Создаю ссылку…':'Создать приглашение'}</button>
              </div>
            : <>
                <label>Ссылка приглашения<input readOnly value={inviteUrl}/></label>
                {inviteExpiresAt&&<small className="field-help">Ссылка действует 7 дней и создаёт клиента только после того, как он действительно откроет приглашение в Telegram.</small>}
                <div className="finish-workout-actions">
                  <button type="button" className="ghost-button" onClick={()=>{setInviteUrl('');setInviteExpiresAt('');setInviteCopied(false)}}>Новая ссылка</button>
                  <button type="button" className="primary-button" onClick={()=>void copyInvite()}>{inviteCopied?<Check size={16}/>:<Copy size={16}/>} {inviteCopied?'Скопировано':'Скопировать ссылку'}</button>
                </div>
              </>}
        </div>
      </aside>
    </div>}

    {resetClient&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busyClientId)setResetClient(null)}}>
      <aside className="exercise-drawer workout-sheet reset-access-sheet">
        <div className="drawer-head"><div><span className="eyebrow">Доступ клиента</span><h3>{resetClient.display_name}</h3></div><button className="icon-button" disabled={Boolean(busyClientId)} onClick={()=>setResetClient(null)}><X size={18}/></button></div>
        <div className="drawer-body">
          <div className="access-login-summary"><span>Логин</span><strong>{resetClient.login_alias||'Будет создан автоматически'}</strong></div>
          <p className="sheet-description">{resetClient.login_alias?'Свой пароль клиента посмотреть нельзя. При сбросе он получит временный и задаст новый после входа.':'Это старый email-аккаунт. Система сохранит весь профиль и историю, заменит вход на простой логин и выдаст временный пароль.'}</p>
          <div className="finish-workout-actions"><button className="ghost-button" disabled={Boolean(busyClientId)} onClick={()=>setResetClient(null)}>Отмена</button><button className="primary-button" disabled={Boolean(busyClientId)} onClick={()=>void resetPassword()}><KeyRound size={16}/>{busyClientId?'Создаю…':resetClient.login_alias?'Сбросить и выдать временный пароль':'Перевести на новый вход'}</button></div>
        </div>
      </aside>
    </div>}

    {lifecycleConfirm&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busyClientId)setLifecycleConfirm(null)}}>
      <aside className="exercise-drawer workout-sheet">
        <div className="drawer-head"><div><span className="eyebrow">Статус клиента</span><h3>{lifecycleConfirm.action==='pause'?'Заморозить доступ?':lifecycleConfirm.action==='archive'?'Перенести в архив?':'Возобновить сопровождение?'}</h3></div><button className="icon-button" disabled={Boolean(busyClientId)} onClick={()=>setLifecycleConfirm(null)}><X size={18}/></button></div>
        <div className="drawer-body">
          <p className="sheet-description">{lifecycleConfirm.action==='pause'
            ? 'Клиент временно не сможет войти. Все тренировки, питание, замеры и сообщения сохранятся.'
            : lifecycleConfirm.action==='archive'
              ? 'Сопровождение будет завершено, вход заблокирован, а вся история останется в архиве. Клиента можно вернуть позже.'
              : 'Доступ снова откроется, клиент вернётся в активный список со всей прежней историей.'}</p>
          <div className="finish-workout-actions"><button className="ghost-button" disabled={Boolean(busyClientId)} onClick={()=>setLifecycleConfirm(null)}>Отмена</button><button className="primary-button" disabled={Boolean(busyClientId)} onClick={()=>void applyLifecycle()}>{busyClientId?'Сохраняю…':lifecycleConfirm.action==='pause'?'Заморозить':lifecycleConfirm.action==='archive'?'В архив':'Возобновить'}</button></div>
        </div>
      </aside>
    </div>}

    {deleteClient&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busyClientId)setDeleteClient(null)}}>
      <aside className="exercise-drawer workout-sheet destructive-sheet">
        <div className="drawer-head"><div><span className="eyebrow">Необратимое действие</span><h3>Удалить {deleteClient.display_name} навсегда?</h3></div><button className="icon-button" disabled={Boolean(busyClientId)} onClick={()=>setDeleteClient(null)}><X size={18}/></button></div>
        <div className="drawer-body">
          <p className="sheet-description">Будут удалены аккаунт, тренировки, замеры, питание, самооценки, сообщения и остальные клиентские данные. Восстановить их будет нельзя.</p>
          <label className="field-label">Для подтверждения введи <strong>УДАЛИТЬ</strong><input value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value.toUpperCase())} autoComplete="off"/></label>
          <div className="finish-workout-actions"><button className="ghost-button" disabled={Boolean(busyClientId)} onClick={()=>setDeleteClient(null)}>Отмена</button><button className="danger-button" disabled={Boolean(busyClientId)||deleteConfirm!=='УДАЛИТЬ'} onClick={()=>void hardDelete()}><Trash2 size={16}/>{busyClientId?'Удаляю…':'Удалить навсегда'}</button></div>
        </div>
      </aside>
    </div>}
  </div>
}
