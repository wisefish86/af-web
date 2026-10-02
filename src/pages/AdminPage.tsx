import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, KeyRound, Search, ShieldCheck, UserPlus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  createManagedClient, loadTrainerClients, resetManagedClientPassword,
  type ClientAccessCredentials, type TrainerClient,
} from '../features/clients/service'
import { demoClients } from '../data/demo'
import { getAppBaseUrl } from '../lib/appUrl'
import { showAppToast } from '../lib/toast'

type Props={preview:boolean}
type NewClientForm={display_name:string;nickname:string;age:string;login:string}

const avatarEmoji:Record<string,string>={fox:'🦊',bear:'🐻',owl:'🦉',panda:'🐼',tiger:'🐯',dog:'🐶'}
const emptyForm:NewClientForm={display_name:'',nickname:'',age:'',login:''}

const ruMap:Record<string,string>={
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',
  н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',
  ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
}

function slugifyName(value:string){
  const latin=[...value.trim().toLocaleLowerCase('ru')].map(ch=>ruMap[ch]??ch).join('')
  return latin.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,18)
}

function suggestLogin(name:string){
  const base=slugifyName(name)||'client'
  return base+'-'+String(Math.floor(10+Math.random()*90))
}

export function AdminPage({preview}:Props) {
  const [clients,setClients]=useState<TrainerClient[]>([])
  const [query,setQuery]=useState('')
  const [loading,setLoading]=useState(!preview)
  const [clientsLoaded,setClientsLoaded]=useState(preview)
  const [creating,setCreating]=useState(false)
  const [resettingId,setResettingId]=useState<string|null>(null)
  const [newClientOpen,setNewClientOpen]=useState(false)
  const [resetClient,setResetClient]=useState<TrainerClient|null>(null)
  const [form,setForm]=useState<NewClientForm>(emptyForm)
  const [loginTouched,setLoginTouched]=useState(false)
  const [credentials,setCredentials]=useState<ClientAccessCredentials|null>(null)
  const [notice,setNotice]=useState('')
  const [copied,setCopied]=useState(false)

  async function refresh(){
    if(preview)return
    try{
      setClients(await loadTrainerClients())
      setClientsLoaded(true)
    }catch{
      setClientsLoaded(false)
      setNotice('Не удалось загрузить список клиентов.')
    }
  }

  useEffect(()=>{
    if(preview){setLoading(false);return}
    refresh().finally(()=>setLoading(false))
  },[preview])

  const shown=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase('ru')
    return clients.filter(c=>!q||[c.display_name,c.login_alias??'',c.nickname??'',c.city??''].join(' ').toLocaleLowerCase('ru').includes(q))
  },[clients,query])

  function openCreate(){
    setForm({...emptyForm,login:'client-'+String(Math.floor(10+Math.random()*90))})
    setLoginTouched(false)
    setNotice('')
    setNewClientOpen(true)
  }

  function updateName(value:string){
    setForm(current=>({
      ...current,
      display_name:value,
      login:loginTouched?current.login:suggestLogin(value),
    }))
  }

  async function createClient(e:React.FormEvent){
    e.preventDefault()
    if(creating)return
    if(!form.display_name.trim()){setNotice('Укажи имя клиента.');return}
    if(form.login.trim().length<3){setNotice('Логин должен быть не короче 3 символов.');return}
    const age=form.age.trim()===''?null:Number(form.age)
    if(age!=null&&(!Number.isInteger(age)||age<13||age>100)){setNotice('Возраст должен быть от 13 до 100 лет.');return}

    setCreating(true);setNotice('')
    try{
      const result=preview
        ? {client_id:'preview-'+Date.now(),login:form.login.trim().toLowerCase(),password:'Demo-7KpQ-4vN8'}
        : await createManagedClient({
            display_name:form.display_name.trim(),
            nickname:form.nickname.trim(),
            age,
            login:form.login.trim(),
          })
      setCredentials(result)
      setNewClientOpen(false)
      if(!preview)await refresh()
      showAppToast('Клиент создан. Сохрани или отправь ему данные для входа.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось создать клиента')}
    finally{setCreating(false)}
  }

  async function resetPassword(){
    if(!resetClient||resettingId)return
    setResettingId(resetClient.id);setNotice('')
    try{
      const result=preview
        ? {client_id:resetClient.id,login:resetClient.login_alias||'demo-client',password:'New-8RqT-5mK2'}
        : await resetManagedClientPassword(resetClient.id)
      setCredentials(result)
      setResetClient(null)
      showAppToast('Новый пароль создан. Старый пароль больше не работает.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сменить пароль')}
    finally{setResettingId(null)}
  }

  function accessText(value:ClientAccessCredentials){
    return [
      'Andrey Fit',
      'Вход: '+getAppBaseUrl(),
      'Логин: '+value.login,
      'Пароль: '+value.password,
    ].join('\n')
  }

  async function copyAccess(){
    if(!credentials)return
    try{
      await navigator.clipboard.writeText(accessText(credentials))
      setCopied(true)
      window.setTimeout(()=>setCopied(false),1500)
    }catch{setNotice('Не удалось скопировать автоматически. Выдели данные вручную.')}
  }

  return <div className="page-stack">
    <section className="admin-toolbar">
      <div className="search-box"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти клиента или логин"/></div>
      <button className="primary-button compact" onClick={openCreate}><UserPlus size={17}/>Добавить клиента</button>
    </section>

    <section className="panel client-access-explainer">
      <div className="panel-head"><div><span className="eyebrow">Простой доступ</span><h3>Без регистрации и подтверждения почты</h3></div><ShieldCheck size={19}/></div>
      <p className="panel-description">Ты создаёшь клиенту логин и получаешь случайный пароль. Пароль показывается только при создании или сбросе и не хранится открытым текстом. Если клиент его потеряет — за несколько секунд создаёшь новый.</p>
    </section>

    {credentials&&<section className="panel access-credentials-card">
      <div className="invite-created-head">
        <div><span className="eyebrow">Доступ готов</span><h3>Отправь клиенту эти данные</h3><p>После закрытия пароль повторно не показывается. Если понадобится — просто сгенерируй новый.</p></div>
        <button className="icon-button" aria-label="Закрыть" onClick={()=>setCredentials(null)}><X size={15}/></button>
      </div>
      <div className="access-credentials-grid">
        <label>Ссылка<input readOnly value={getAppBaseUrl()}/></label>
        <label>Логин<input readOnly value={credentials.login}/></label>
        <label>Пароль<input readOnly value={credentials.password}/></label>
      </div>
      <div className="access-credentials-actions">
        <button className="primary-button compact" onClick={()=>void copyAccess()}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Скопировано':'Скопировать всё'}</button>
      </div>
    </section>}

    {notice&&<div className="drawer-notice">{notice}</div>}

    <section className="panel clients-panel">
      <div className="panel-head"><div><span className="eyebrow">Подопечные</span><h3>{preview?demoClients.length:clients.length} клиентов</h3></div></div>

      {preview?<>
        <div className="client-table live access header"><span>Клиент</span><span>Логин</span><span>Возраст</span><span></span></div>
        {demoClients.map((c,index)=><div className="client-table live access" key={c.name}>
          <div className="client-name"><div className="avatar small">{c.name[0]}</div><div><strong>{c.name}</strong><small>{c.status}</small></div></div>
          <span>{index===0?'sergey-37':'vlada-29'}</span><span>{index===0?'37':'29'}</span>
          <div className="client-access-actions">
            <button className="ghost-button small" onClick={()=>setResetClient({id:index===0?'sergey':'vlada',display_name:c.name,login_alias:index===0?'sergey-37':'vlada-29',nickname:null,age:null,city:null,avatar_key:null,timezone:'Europe/Moscow',status:'active',started_at:'2026-01-01'})}><KeyRound size={14}/>Доступ</button>
            <Link className="ghost-button small" to={'/clients/'+(index===0?'sergey':'vlada')}>Открыть</Link>
          </div>
        </div>)}
      </>:loading?<div className="library-empty">Загружаю клиентов…</div>:!clientsLoaded?<div className="library-empty">Не удалось загрузить список клиентов.</div>:shown.length===0?<div className="library-empty">Пока нет клиентов. Нажми «Добавить клиента» — аккаунт будет готов сразу.</div>:<>
        <div className="client-table live access header"><span>Клиент</span><span>Логин</span><span>Возраст</span><span></span></div>
        {shown.map(c=><div className="client-table live access" key={c.id}>
          <div className="client-name"><div className="avatar small">{avatarEmoji[c.avatar_key??'']??c.display_name[0]}</div><div><strong>{c.display_name}</strong><small>{c.nickname||'без метки'}</small></div></div>
          <span>{c.login_alias||'старый вход'}</span><span>{c.age??'—'}</span>
          <div className="client-access-actions">
            <button className="ghost-button small" onClick={()=>setResetClient(c)}><KeyRound size={14}/>Доступ</button>
            <Link className="ghost-button small" to={'/clients/'+c.id}>Открыть</Link>
          </div>
        </div>)}
      </>}
    </section>

    {newClientOpen&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!creating)setNewClientOpen(false)}}>
      <aside className="exercise-drawer workout-sheet managed-client-sheet">
        <div className="drawer-head"><div><span className="eyebrow">Новый клиент</span><h3>Создать готовый доступ</h3></div><button className="icon-button" disabled={creating} onClick={()=>setNewClientOpen(false)}><X size={18}/></button></div>
        <form className="drawer-body managed-client-form" onSubmit={createClient}>
          <p className="sheet-description">Клиенту не понадобится email и регистрация. Ты отправишь ему готовые логин и пароль.</p>
          <label>Имя<input value={form.display_name} onChange={e=>updateName(e.target.value)} placeholder="Как обращаться" autoFocus maxLength={60}/></label>
          <label>Метка <small>необязательно</small><input value={form.nickname} onChange={e=>setForm(v=>({...v,nickname:e.target.value}))} placeholder="Например: Мария · Telegram" maxLength={40}/></label>
          <label>Возраст <small>необязательно</small><input type="number" min="13" max="100" inputMode="numeric" value={form.age} onChange={e=>setForm(v=>({...v,age:e.target.value}))} placeholder="32"/></label>
          <label>Логин
            <small>Можно изменить. Только латиница, цифры, точка, дефис или подчёркивание.</small>
            <input value={form.login} onChange={e=>{setLoginTouched(true);setForm(v=>({...v,login:e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g,'')}))}} placeholder="maria-27" minLength={3} maxLength={32}/>
          </label>
          <div className="managed-client-password-note"><KeyRound size={16}/><span>Пароль система сгенерирует автоматически после нажатия «Создать».</span></div>
          <div className="finish-workout-actions">
            <button type="button" className="ghost-button" disabled={creating} onClick={()=>setNewClientOpen(false)}>Отмена</button>
            <button className="primary-button" disabled={creating}><UserPlus size={16}/>{creating?'Создаю…':'Создать клиента'}</button>
          </div>
        </form>
      </aside>
    </div>}

    {resetClient&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!resettingId)setResetClient(null)}}>
      <aside className="exercise-drawer workout-sheet reset-access-sheet">
        <div className="drawer-head"><div><span className="eyebrow">Доступ клиента</span><h3>{resetClient.display_name}</h3></div><button className="icon-button" disabled={Boolean(resettingId)} onClick={()=>setResetClient(null)}><X size={18}/></button></div>
        <div className="drawer-body">
          <div className="access-login-summary"><span>Логин</span><strong>{resetClient.login_alias||'Будет создан автоматически'}</strong></div>
          <p className="sheet-description">{resetClient.login_alias?'Старый пароль посмотреть нельзя. Если клиент его потерял, создай новый — старый сразу перестанет работать.':'Это клиент со старой схемой входа. Система создаст ему простой логин, заменит старый способ входа и выдаст новый пароль.'}</p>
          <div className="finish-workout-actions">
            <button className="ghost-button" disabled={Boolean(resettingId)} onClick={()=>setResetClient(null)}>Отмена</button>
            <button className="primary-button" disabled={Boolean(resettingId)} onClick={()=>void resetPassword()}><KeyRound size={16}/>{resettingId?'Создаю…':resetClient.login_alias?'Сгенерировать новый пароль':'Создать простой доступ'}</button>
          </div>
        </div>
      </aside>
    </div>}
  </div>
}
