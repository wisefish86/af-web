import { useEffect, useMemo, useState } from 'react'
import { BookOpen, ChevronRight, CircleCheck, Inbox, Layers3, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { loadTrainerClients, type TrainerClient } from '../features/clients/service'
import { demoClients } from '../data/demo'

type Props={preview:boolean}

function clientLabel(client:TrainerClient){
  const marker=client.nickname?.trim()?\` (\${client.nickname.trim()})\`:''
  const age=client.age?\`, \${client.age} лет\`:''
  return client.display_name+marker+age
}

function activityLabel(client:TrainerClient){
  if(!client.last_activity_at)return 'Пока нет активности'
  const date=new Date(client.last_activity_at)
  return 'Последняя активность · '+date.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})
}

export function TrainerHomePage({preview}:Props) {
  const previewClients:TrainerClient[]=demoClients.map((item,index)=>({
    id:index===0?'sergey':'vlada',
    display_name:item.name,
    login_alias:index===0?'sergey-r8m3':'vlada-k4p7',
    nickname:null,
    age:index===0?37:29,
    city:null,
    avatar_key:null,
    timezone:'Europe/Moscow',
    status:index===0?'active':'paused',
    started_at:'2026-01-01',
    ended_at:null,
    last_activity_at:index===0?'2026-10-01T18:20:00+03:00':'2026-09-28T00:00:00+03:00',
    last_activity_kind:index===0?'workout':'measurement',
  }))
  const [clients,setClients]=useState<TrainerClient[]>(preview?previewClients:[])
  const [loadFailed,setLoadFailed]=useState(false)

  useEffect(()=>{
    if(preview){setClients(previewClients);return}
    let cancelled=false
    void loadTrainerClients()
      .then(rows=>{if(!cancelled){setClients(rows);setLoadFailed(false)}})
      .catch(()=>{if(!cancelled)setLoadFailed(true)})
    return()=>{cancelled=true}
  },[preview])

  const active=useMemo(()=>clients.filter(client=>client.status==='active'),[clients])

  return (
    <div className="page-stack">
      <section className="hero-card trainer-hero">
        <div>
          <span className="eyebrow light">Сегодня</span>
          <h2>Кабинет тренера</h2>
          <p>Всё важное — клиенты, программы, питание и контроль — в одном месте. Без лишних таблиц.</p>
        </div>
        <div className="hero-score"><strong>{active.length}</strong><span>{active.length===1?'активный клиент':'активных клиента'}</span></div>
      </section>

      <div className="trainer-quick-grid">
        <Link to="/clients" className="quick-action-card">
          <div className="quick-icon"><UsersRound size={22}/></div>
          <div><strong>Клиенты</strong><span>Настроить сопровождение и посмотреть прогресс</span></div>
          <ChevronRight size={18}/>
        </Link>
        <Link to="/inbox" className="quick-action-card">
          <div className="quick-icon"><Inbox size={22}/></div>
          <div><strong>Входящие</strong><span>Комментарии клиентов и вопросы по тренировкам</span></div>
          <ChevronRight size={18}/>
        </Link>
        <Link to="/builder" className="quick-action-card">
          <div className="quick-icon"><Layers3 size={22}/></div>
          <div><strong>Конструктор</strong><span>Программы тренировок и планы питания</span></div>
          <ChevronRight size={18}/>
        </Link>
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Клиенты</span><h3>Активные</h3></div></div>
          {loadFailed&&!preview?<p className="muted-text">Не удалось загрузить клиентов. Открой раздел «Клиенты» и повтори.</p>:active.length===0?<p className="muted-text">Активных клиентов пока нет.</p>:(
            <ul className="activity-list">
              {active.slice(0,3).map(client=><li key={client.id}><span className="activity-dot good"/><div><strong>{clientLabel(client)}</strong><span>{activityLabel(client)}</span></div></li>)}
            </ul>
          )}
        </section>
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Система</span><h3>Готово к работе</h3></div><BookOpen size={20}/></div>
          <ul className="check-list compact-list">
            <li><CircleCheck/>Модульное подключение услуг</li>
            <li><CircleCheck/>Настраиваемые поля клиента</li>
            <li><CircleCheck/>Шаблоны тренировок и питания</li>
            <li><CircleCheck/>Контур Telegram-напоминаний</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
