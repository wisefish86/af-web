import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Link2, Search, UserPlus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { createClientInvite, loadClientInvites, loadTrainerClients, revokeClientInvite, type ClientInviteRow, type TrainerClient } from '../features/clients/service'
import { demoClients } from '../data/demo'
import { getAppBaseUrl } from '../lib/appUrl'

type Props={preview:boolean}

const avatarEmoji:Record<string,string>={fox:'🦊',bear:'🐻',owl:'🦉',panda:'🐼',tiger:'🐯',dog:'🐶'}

export function AdminPage({preview}:Props) {
  const [clients,setClients]=useState<TrainerClient[]>([])
  const [invites,setInvites]=useState<ClientInviteRow[]>([])
  const [query,setQuery]=useState('')
  const [loading,setLoading]=useState(!preview)
  const [clientsLoaded,setClientsLoaded]=useState(preview)
  const [invitesLoaded,setInvitesLoaded]=useState(preview)
  const [creating,setCreating]=useState(false)
  const [revokingId,setRevokingId]=useState<string|null>(null)
  const [inviteUrl,setInviteUrl]=useState('')
  const [notice,setNotice]=useState('')
  const [copied,setCopied]=useState(false)

  async function refresh(){
    if(preview)return
    const [clientsResult,invitesResult]=await Promise.allSettled([loadTrainerClients(),loadClientInvites()])
    const failed:string[]=[]
    if(clientsResult.status==='fulfilled'){setClients(clientsResult.value);setClientsLoaded(true)}
    else {setClientsLoaded(false);failed.push('клиенты')}
    if(invitesResult.status==='fulfilled'){setInvites(invitesResult.value);setInvitesLoaded(true)}
    else {setInvitesLoaded(false);failed.push('приглашения')}
    if(failed.length)setNotice('Часть данных не загрузилась: '+failed.join(', ')+'.')
  }

  useEffect(()=>{
    if(preview){setLoading(false);return}
    refresh().finally(()=>setLoading(false))
  },[preview])

  const shown=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase('ru')
    return clients.filter(c=>!q||[c.display_name,c.nickname??'',c.city??''].join(' ').toLocaleLowerCase('ru').includes(q))
  },[clients,query])

  async function createInvite(){
    if(preview){
      const fake='preview-invite'
      setInviteUrl(getAppBaseUrl()+'#/join?invite='+fake)
      return
    }
    setCreating(true);setNotice('')
    try{
      const token=await createClientInvite()
      setInviteUrl(getAppBaseUrl()+'#/join?invite='+encodeURIComponent(token))
      try{
        const freshInvites=await loadClientInvites()
        setInvites(freshInvites);setInvitesLoaded(true)
      }catch{
        setNotice('Приглашение создано, но список активных приглашений не удалось обновить. Сама ссылка рабочая.')
      }
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось создать приглашение')}
    finally{setCreating(false)}
  }

  async function copyInvite(){
    if(!inviteUrl)return
    try{await navigator.clipboard.writeText(inviteUrl);setCopied(true);setTimeout(()=>setCopied(false),1500)}
    catch{setNotice('Не удалось скопировать автоматически — выдели ссылку вручную.')}
  }

  async function revoke(id:string){
    if(revokingId)return
    setRevokingId(id);setNotice('')
    try{
      await revokeClientInvite(id)
      setInvites(list=>list.map(item=>item.id===id?{...item,revoked_at:new Date().toISOString()}:item))
      setNotice('Приглашение отозвано.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось отменить приглашение')}
    finally{setRevokingId(null)}
  }

  if(preview)return <div className="page-stack">
    <section className="admin-toolbar">
      <div className="search-box"><Search size={18}/><input placeholder="Найти клиента"/></div>
      <button className="primary-button compact" onClick={()=>void createInvite()}><UserPlus size={17}/>Добавить клиента</button>
    </section>
    {inviteUrl&&<section className="panel invite-created-card"><div><span className="eyebrow">Приглашение</span><h3>Ссылка для клиента</h3><p>Код приглашения уже встроен в ссылку. Клиент заполнит имя, обязательную метку, возраст, email и пароль — после подтверждения автоматически появится у тебя.</p></div><div className="invite-url-row"><input value={inviteUrl} readOnly/><button className="primary-button compact" onClick={()=>void copyInvite()}>{copied?<Check size={15}/>:<Copy size={15}/>}Копировать</button></div></section>}
    <section className="panel clients-panel">
      <div className="client-table header"><span>Клиент</span><span>Цель</span><span>Последняя активность</span><span>Следование плану</span><span></span></div>
      {demoClients.map((c,index)=><div className="client-table" key={c.name}>
        <div className="client-name"><div className="avatar small">{c.name[0]}</div><div><strong>{c.name}</strong><small>{c.status}</small></div></div>
        <span>{c.goal}</span><span>{c.last}</span><strong>{c.adherence}</strong>
        <Link className="ghost-button small" to={'/clients/'+(index===0?'sergey':'vlada')}>Открыть</Link>
      </div>)}
    </section>
  </div>

  return <div className="page-stack">
    <section className="admin-toolbar">
      <div className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти клиента"/></div>
      <button className="primary-button compact" disabled={creating} onClick={()=>void createInvite()}><UserPlus size={17}/>{creating?'Создаю…':'Добавить клиента'}</button>
    </section>

    {inviteUrl&&<section className="panel invite-created-card">
      <div className="invite-created-head"><div><span className="eyebrow">Новое приглашение</span><h3>Отправь эту ссылку клиенту</h3><p>Код уже встроен в ссылку: клиенту ничего копировать отдельно не нужно. Ссылка действует 7 дней и используется один раз. Пароль клиента тебе не показывается.</p></div><button className="icon-button" onClick={()=>setInviteUrl('')}><X size={15}/></button></div>
      <div className="invite-url-row"><Link2 size={16}/><input value={inviteUrl} readOnly/><button className="primary-button compact" onClick={()=>void copyInvite()}>{copied?<Check size={15}/>:<Copy size={15}/>}Копировать</button></div>
    </section>}

    {notice&&<div className="drawer-notice">{notice}</div>}

    <section className="panel clients-panel">
      <div className="panel-head"><div><span className="eyebrow">Подопечные</span><h3>{clients.length} клиентов</h3></div></div>
      {loading?<div className="library-empty">Загружаю клиентов…</div>:!clientsLoaded?<div className="library-empty">Не удалось загрузить список клиентов.</div>:shown.length===0?<div className="library-empty">Пока нет клиентов. Создай приглашение и отправь ссылку первому человеку.</div>:<>
        <div className="client-table live header"><span>Клиент</span><span>Возраст</span><span>Город</span><span>С нами с</span><span></span></div>
        {shown.map(c=><div className="client-table live" key={c.id}>
          <div className="client-name"><div className="avatar small">{avatarEmoji[c.avatar_key??'']??c.display_name[0]}</div><div><strong>{c.display_name}</strong><small>{c.nickname||'без метки'}</small></div></div>
          <span>{c.age??'—'}</span><span>{c.city??'—'}</span><span>{new Date(c.started_at+'T00:00:00').toLocaleDateString('ru-RU')}</span>
          <Link className="ghost-button small" to={'/clients/'+c.id}>Открыть</Link>
        </div>)}
      </>}
    </section>

    {!loading&&!invitesLoaded&&<section className="panel open-invites-panel"><div className="library-empty">Не удалось загрузить активные приглашения.</div></section>}
    {invitesLoaded&&invites.some(i=>!i.accepted_at&&!i.revoked_at&&new Date(i.expires_at)>new Date())&&<section className="panel open-invites-panel">
      <div className="panel-head"><div><span className="eyebrow">Ожидают регистрации</span><h3>Активные приглашения</h3></div></div>
      <div className="invite-list">{invites.filter(i=>!i.accepted_at&&!i.revoked_at&&new Date(i.expires_at)>new Date()).map(i=><div key={i.id}><span>Создано {new Date(i.created_at).toLocaleString('ru-RU')}</span><small>до {new Date(i.expires_at).toLocaleString('ru-RU')}</small><button className="text-button danger-text" disabled={Boolean(revokingId)} onClick={()=>void revoke(i.id)}>{revokingId===i.id?'Отменяю…':'Отменить'}</button></div>)}</div>
    </section>}
  </div>
}
