import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, ChevronRight, MessageCircle, Send, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { dismissNotification, loadNotifications, markAllNotificationsRead, markNotificationRead, subscribeToMyNotifications, type NotificationItem } from '../features/notifications/service'
import { loadMyFeedbackThread, replyToFeedback, subscribeToFeedbackThread } from '../features/feedback/service'
import type { FeedbackThread } from '../features/feedback/types'

const previewItems:NotificationItem[]=[
  {id:'p1',client_id:'preview',recipient_id:'preview',channel:'in_app',title:'Пора записать питание',body:'Если придерживался Meal Plan, достаточно отметить соблюдение.',action_path:'/nutrition',status:'sent',scheduled_for:new Date().toISOString(),delivered_at:new Date().toISOString(),read_at:null,dismissed_at:null,created_at:new Date().toISOString()},
  {id:'p2',client_id:'preview',recipient_id:'preview',channel:'in_app',title:'Взвешивание',body:'Запиши утренний вес. Если уже записал — напоминание не появится.',action_path:'/progress',status:'sent',scheduled_for:new Date(Date.now()-86400000).toISOString(),delivered_at:new Date(Date.now()-86400000).toISOString(),read_at:new Date().toISOString(),dismissed_at:null,created_at:new Date(Date.now()-86400000).toISOString()},
]

export function NotificationsPage({preview}:{preview:boolean}){
  const navigate=useNavigate()
  const [items,setItems]=useState<NotificationItem[]>(preview?previewItems:[])
  const [loading,setLoading]=useState(!preview)
  const [notice,setNotice]=useState('')
  const [feedbackThread,setFeedbackThread]=useState<FeedbackThread|null>(null)
  const [feedbackContextPath,setFeedbackContextPath]=useState<string|null>(null)
  const [feedbackLoading,setFeedbackLoading]=useState(false)
  const [feedbackReply,setFeedbackReply]=useState('')
  const [feedbackSending,setFeedbackSending]=useState(false)
  const feedbackRequestRef=useRef<{threadId:string;body:string;id:string}|null>(null)

  function feedbackDraftKey(threadId:string){return 'andrey-fit:client-feedback-draft:'+threadId}
  function readFeedbackDraft(threadId:string):{body:string;requestId:string}|null{
    if(preview)return null
    try{
      const raw=localStorage.getItem(feedbackDraftKey(threadId))
      if(!raw)return null
      const parsed=JSON.parse(raw) as {body?:unknown;requestId?:unknown}
      return typeof parsed.body==='string'&&typeof parsed.requestId==='string'?{body:parsed.body,requestId:parsed.requestId}:null
    }catch{return null}
  }
  function storeFeedbackDraft(threadId:string,body:string){
    if(preview)return null
    if(!body){try{localStorage.removeItem(feedbackDraftKey(threadId))}catch{};return null}
    const current=readFeedbackDraft(threadId)
    const draft=current?.body===body?current:{body,requestId:crypto.randomUUID()}
    try{localStorage.setItem(feedbackDraftKey(threadId),JSON.stringify(draft))}catch{}
    return draft
  }
  function clearFeedbackDraft(threadId:string){
    if(preview)return
    try{localStorage.removeItem(feedbackDraftKey(threadId))}catch{}
  }

  async function refresh(){
    if(preview)return
    const data=await loadNotifications()
    setItems(data)
  }

  useEffect(()=>{
    refresh().catch(e=>setNotice(e instanceof Error?e.message:'Не удалось загрузить уведомления')).finally(()=>setLoading(false))
  },[preview])

  useEffect(()=>{
    if(preview)return
    let active=true
    let stop=()=>{}
    const silentRefresh=()=>{if(active)void refresh().catch(()=>{})}
    void subscribeToMyNotifications(silentRefresh).then(cleanup=>{
      if(active)stop=cleanup
      else cleanup()
    }).catch(()=>{})
    const timer=window.setInterval(silentRefresh,60000)
    const onVisible=()=>{if(document.visibilityState==='visible')silentRefresh()}
    window.addEventListener('online',silentRefresh)
    document.addEventListener('visibilitychange',onVisible)
    return()=>{active=false;stop();window.clearInterval(timer);window.removeEventListener('online',silentRefresh);document.removeEventListener('visibilitychange',onVisible)}
  },[preview])

  useEffect(()=>{
    if(preview||!feedbackThread?.id)return
    let refreshTimer:number|null=null
    const stop=subscribeToFeedbackThread(feedbackThread.id,()=>{
      if(refreshTimer!==null)window.clearTimeout(refreshTimer)
      refreshTimer=window.setTimeout(()=>{
        void loadMyFeedbackThread(feedbackThread.id).then(thread=>{if(thread)setFeedbackThread(thread)}).catch(()=>{})
      },100)
    })
    return()=>{if(refreshTimer!==null)window.clearTimeout(refreshTimer);stop()}
  },[preview,feedbackThread?.id])

  function markReadAfterOpen(item:NotificationItem){
    if(item.read_at)return
    const readAt=new Date().toISOString()
    setItems(list=>list.map(x=>x.id===item.id?{...x,read_at:readAt}:x))
    if(preview)return
    void markNotificationRead(item.id).catch(()=>{
      setItems(list=>list.map(x=>x.id===item.id?{...x,read_at:null}:x))
      setNotice('Содержимое открылось, но уведомление не удалось отметить прочитанным.')
    })
  }

  async function open(item:NotificationItem){
    if(preview){if(item.action_path)navigate(item.action_path);return}
    setNotice('')
    try{
      const threadId=typeof item.payload?.thread_id==='string'?item.payload.thread_id:null
      const trainerInbox=Boolean(item.action_path?.startsWith('/inbox'))
      if(item.payload?.kind==='feedback'&&threadId&&!trainerInbox){
        setFeedbackLoading(true)
        try{
          const thread=await loadMyFeedbackThread(threadId)
          if(thread){
            setFeedbackThread(thread)
            setFeedbackContextPath(item.action_path)
            const stored=readFeedbackDraft(thread.id)
            setFeedbackReply(stored?.body??'')
            if(stored)feedbackRequestRef.current={threadId:thread.id,body:stored.body,id:stored.requestId}
            markReadAfterOpen(item)
            return
          }
        }finally{setFeedbackLoading(false)}
      }
      if(item.action_path){
        navigate(item.action_path)
        markReadAfterOpen(item)
        return
      }
      setNotice('У этого уведомления нет доступного действия. Оно оставлено непрочитанным.')
    }catch(e){
      setFeedbackLoading(false)
      setNotice(e instanceof Error?e.message:'Не удалось открыть уведомление')
    }
  }

  async function sendFeedbackReply(){
    if(!feedbackThread||!feedbackReply.trim()||feedbackSending)return
    const body=feedbackReply.trim()
    const stored=readFeedbackDraft(feedbackThread.id)
    const existing=feedbackRequestRef.current
    const request=stored?.body===body
      ? {threadId:feedbackThread.id,body,id:stored.requestId}
      : existing&&existing.threadId===feedbackThread.id&&existing.body===body
        ? existing
        : {threadId:feedbackThread.id,body,id:crypto.randomUUID()}
    try{localStorage.setItem(feedbackDraftKey(feedbackThread.id),JSON.stringify({body,requestId:request.id}))}catch{}
    feedbackRequestRef.current=request
    const localMessageId='local:'+request.id
    const now=new Date().toISOString()
    setFeedbackThread(current=>current?{
      ...current,
      updated_at:now,
      messages:[...current.messages,{id:localMessageId,author_id:current.client_id,body,created_at:now}],
    }:current)
    setFeedbackReply('')
    setFeedbackSending(true);setNotice('')
    try{
      await replyToFeedback(feedbackThread.id,body,request.id)
      feedbackRequestRef.current=null
      clearFeedbackDraft(feedbackThread.id)
    }catch(e){
      setFeedbackThread(current=>current?{...current,messages:current.messages.filter(message=>message.id!==localMessageId)}:current)
      setFeedbackReply(body)
      setNotice(e instanceof Error?e.message:'Не удалось отправить сообщение тренеру')
    }finally{setFeedbackSending(false)}
  }
  async function markAll(){
    const previous=items
    const readAt=new Date().toISOString()
    setItems(list=>list.map(x=>({...x,read_at:x.read_at??readAt})))
    if(preview)return
    try{await markAllNotificationsRead()}
    catch(e){setItems(previous);setNotice(e instanceof Error?e.message:'Не удалось отметить')}
  }
  async function dismiss(id:string){
    const previous=items
    setItems(list=>list.filter(x=>x.id!==id))
    if(preview)return
    try{await dismissNotification(id)}
    catch(e){setItems(previous);setNotice(e instanceof Error?e.message:'Не удалось скрыть')}
  }

  const unread=items.filter(x=>!x.read_at).length

  return <div className="page-stack notifications-page">
    {unread>0&&<div className="notifications-toolbar">
      <span>{unread} {unread===1?'непрочитанное':'непрочитанных'}</span>
      <button className="ghost-button compact" onClick={()=>void markAll()}><CheckCheck size={15}/>Прочитать все</button>
    </div>}
    {notice&&<div className="drawer-notice">{notice}</div>}
    <section className="panel notification-list-panel">
      {loading?<div className="library-empty">Загружаю уведомления…</div>:items.length===0?<div className="library-empty notification-empty-state"><Bell size={22}/><strong>Всё спокойно</strong><span>Новых уведомлений нет.</span></div>:<div className="notification-list">
        {items.map(item=><article className={'notification-item '+(!item.read_at?'is-unread':'')} key={item.id}>
          <div className="notification-dot"/>
          <div className="notification-copy"><strong>{item.title||'Уведомление'}</strong>{item.body&&<p>{item.body}</p>}<small>{new Date(item.created_at).toLocaleString('ru-RU')} · {item.channel==='in_app'?'в приложении':item.channel}</small></div>
          <div className="notification-actions">
            {(item.action_path||item.payload?.kind==='feedback')&&<button onClick={()=>void open(item)} className="icon-button" title="Открыть" disabled={feedbackLoading}><ChevronRight size={16}/></button>}
            <button className="icon-button" onClick={()=>void dismiss(item.id)} title="Скрыть"><X size={15}/></button>
          </div>
        </article>)}
      </div>}
    </section>
    {feedbackThread&&<div className="drawer-backdrop" onClick={()=>setFeedbackThread(null)}>
      <aside className="exercise-drawer feedback-client-drawer" onClick={e=>e.stopPropagation()}>
        <div className="drawer-head">
          <div><span className="eyebrow">Переписка с тренером</span><h3>{feedbackThread.context_label??'Комментарий'}</h3></div>
          <button className="icon-button" onClick={()=>setFeedbackThread(null)} aria-label="Закрыть"><X size={16}/></button>
        </div>
        <div className="feedback-client-thread">
          {feedbackThread.messages.map(message=>{
            const mine=message.author_id===feedbackThread.client_id
            return <div className={'feedback-client-message '+(mine?'is-mine':'is-coach')} key={message.id}>
              <div><strong>{mine?'Вы':'Тренер'}</strong><small>{new Date(message.created_at).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</small></div>
              <p>{message.body}</p>
            </div>
          })}
        </div>
        <div className="feedback-client-compose">
          <textarea rows={3} value={feedbackReply} onChange={e=>{setFeedbackReply(e.target.value);if(feedbackThread)storeFeedbackDraft(feedbackThread.id,e.target.value)}} maxLength={1500} placeholder="Ответить тренеру"/>
          <button className="primary-button" disabled={feedbackSending||!feedbackReply.trim()} onClick={()=>void sendFeedbackReply()}><Send size={15}/>{feedbackSending?'Отправляю…':'Отправить'}</button>
        </div>
        {feedbackContextPath&&<button className="ghost-button feedback-context-button" onClick={()=>{const path=feedbackContextPath;setFeedbackThread(null);navigate(path)}}><MessageCircle size={15}/>Открыть контекст</button>}
      </aside>
    </div>}
  </div>
}
