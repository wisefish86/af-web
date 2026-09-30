import { useEffect, useState } from 'react'
import { Bell, CheckCheck, ChevronRight, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { dismissNotification, loadNotifications, markAllNotificationsRead, markNotificationRead, type NotificationItem } from '../features/notifications/service'

const previewItems:NotificationItem[]=[
  {id:'p1',client_id:'preview',recipient_id:'preview',channel:'in_app',title:'Пора записать питание',body:'Если придерживался Meal Plan, достаточно отметить соблюдение.',action_path:'/nutrition',status:'delivered',scheduled_for:new Date().toISOString(),delivered_at:new Date().toISOString(),read_at:null,dismissed_at:null,created_at:new Date().toISOString()},
  {id:'p2',client_id:'preview',recipient_id:'preview',channel:'in_app',title:'Взвешивание',body:'Запиши утренний вес. Если уже записал — напоминание не появится.',action_path:'/progress',status:'delivered',scheduled_for:new Date(Date.now()-86400000).toISOString(),delivered_at:new Date(Date.now()-86400000).toISOString(),read_at:new Date().toISOString(),dismissed_at:null,created_at:new Date(Date.now()-86400000).toISOString()},
]

export function NotificationsPage({preview}:{preview:boolean}){
  const [items,setItems]=useState<NotificationItem[]>(preview?previewItems:[])
  const [loading,setLoading]=useState(!preview)
  const [notice,setNotice]=useState('')

  async function refresh(){
    if(preview)return
    const data=await loadNotifications()
    setItems(data)
  }

  useEffect(()=>{
    refresh().catch(e=>setNotice(e instanceof Error?e.message:'Не удалось загрузить уведомления')).finally(()=>setLoading(false))
  },[preview])

  async function open(item:NotificationItem){
    if(item.read_at||preview)return
    try{await markNotificationRead(item.id);setItems(list=>list.map(x=>x.id===item.id?{...x,read_at:new Date().toISOString()}:x))}
    catch(e){setNotice(e instanceof Error?e.message:'Не удалось отметить уведомление прочитанным')}
  }
  async function markAll(){
    if(preview){setItems(list=>list.map(x=>({...x,read_at:x.read_at??new Date().toISOString()})));return}
    try{await markAllNotificationsRead();await refresh()}catch(e){setNotice(e instanceof Error?e.message:'Не удалось отметить')}
  }
  async function dismiss(id:string){
    if(preview){setItems(list=>list.filter(x=>x.id!==id));return}
    try{await dismissNotification(id);setItems(list=>list.filter(x=>x.id!==id))}
    catch(e){setNotice(e instanceof Error?e.message:'Не удалось скрыть')}
  }

  const unread=items.filter(x=>!x.read_at).length

  return <div className="page-stack notifications-page">
    <section className="section-intro notifications-intro">
      <div><span className="eyebrow">Центр уведомлений</span><h2>Уведомления</h2><p>Напоминания не должны спамить: если действие уже выполнено, правило может автоматически пропустить отправку.</p></div>
      {unread>0&&<button className="ghost-button" onClick={()=>void markAll()}><CheckCheck size={15}/>Прочитать все</button>}
    </section>
    {notice&&<div className="drawer-notice">{notice}</div>}
    <section className="panel notification-list-panel">
      {loading?<div className="library-empty">Загружаю уведомления…</div>:items.length===0?<div className="library-empty"><Bell size={22}/><strong>Всё спокойно</strong><span>Новых уведомлений нет.</span></div>:<div className="notification-list">
        {items.map(item=><article className={'notification-item '+(!item.read_at?'is-unread':'')} key={item.id}>
          <div className="notification-dot"/>
          <div className="notification-copy"><strong>{item.title||'Уведомление'}</strong>{item.body&&<p>{item.body}</p>}<small>{new Date(item.created_at).toLocaleString('ru-RU')} · {item.channel==='in_app'?'в приложении':item.channel}</small></div>
          <div className="notification-actions">
            {item.action_path&&<Link to={item.action_path} onClick={()=>void open(item)} className="icon-button" title="Открыть"><ChevronRight size={16}/></Link>}
            <button className="icon-button" onClick={()=>void dismiss(item.id)} title="Скрыть"><X size={15}/></button>
          </div>
        </article>)}
      </div>}
    </section>
  </div>
}
