import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock3, Inbox, MessageCircle, Send, UserRound } from 'lucide-react'
import { loadTrainerInbox, replyToFeedback, updateFeedbackStatus } from '../features/feedback/service'
import type { FeedbackStatus, FeedbackThread } from '../features/feedback/types'

type Props = { preview: boolean }

const previewThreads:FeedbackThread[] = [
  {
    id:'thread-1',client_id:'sergey',client_name:'Сергей',workout_exercise_id:'we-press',
    exercise_name:'Жим гантелей на наклонной скамье',status:'new',
    created_at:new Date(Date.now()-15*60_000).toISOString(),updated_at:new Date(Date.now()-15*60_000).toISOString(),
    messages:[
      {id:'m1',author_id:'sergey',body:'На втором подходе немного тянуло правое плечо. Вес 30 кг.',created_at:new Date(Date.now()-15*60_000).toISOString()},
    ],
  },
  {
    id:'thread-2',client_id:'sergey',client_name:'Сергей',workout_exercise_id:'we-row',
    exercise_name:'Горизонтальная тяга в блочном тренажёре',status:'in_progress',
    created_at:new Date(Date.now()-86400_000).toISOString(),updated_at:new Date(Date.now()-21*60_000).toISOString(),
    messages:[
      {id:'m2',author_id:'sergey',body:'55 кг уже довольно легко, можно повышать?',created_at:new Date(Date.now()-86400_000).toISOString()},
      {id:'m3',author_id:'coach',body:'Да, на следующей тренировке попробуй 60 кг и оставь 1–2 повтора в запасе.',created_at:new Date(Date.now()-21*60_000).toISOString()},
    ],
  },
]

const labels:Record<FeedbackStatus,string> = {
  new:'Новое',
  in_progress:'В работе',
  resolved:'Решено',
}

function relativeTime(value:string) {
  const diff=Math.max(0,Date.now()-new Date(value).getTime())
  const minutes=Math.floor(diff/60000)
  if (minutes<1) return 'только что'
  if (minutes<60) return `${minutes} мин назад`
  const hours=Math.floor(minutes/60)
  if (hours<24) return `${hours} ч назад`
  const days=Math.floor(hours/24)
  return `${days} дн назад`
}

export function InboxPage({ preview }:Props) {
  const [searchParams]=useSearchParams()
  const targetThreadId=searchParams.get('thread')
  const [threads,setThreads]=useState<FeedbackThread[]>(preview?previewThreads:[])
  const [filter,setFilter]=useState<'all'|FeedbackStatus>('new')
  const [loading,setLoading]=useState(!preview)
  const [notice,setNotice]=useState('')
  const [replyDrafts,setReplyDrafts]=useState<Record<string,string>>({})
  const [busyId,setBusyId]=useState<string|null>(null)

  async function refresh() {
    if (preview) return
    setLoading(true)
    try {
      setThreads(await loadTrainerInbox())
    } catch (error) {
      setNotice(error instanceof Error?error.message:'Не удалось загрузить входящие')
    } finally {setLoading(false)}
  }

  useEffect(()=>{void refresh()},[preview])

  useEffect(()=>{
    if(!targetThreadId||loading)return
    setFilter('all')
    const timer=window.setTimeout(()=>{
      document.getElementById('feedback-thread-'+targetThreadId)?.scrollIntoView({behavior:'smooth',block:'center'})
    },80)
    return()=>window.clearTimeout(timer)
  },[targetThreadId,loading,threads.length])

  const counts=useMemo(()=>({
    all:threads.length,
    new:threads.filter(t=>t.status==='new').length,
    in_progress:threads.filter(t=>t.status==='in_progress').length,
    resolved:threads.filter(t=>t.status==='resolved').length,
  }),[threads])

  const visible=filter==='all'?threads:threads.filter(thread=>thread.status===filter)

  async function setStatus(thread:FeedbackThread,status:FeedbackStatus) {
    if(busyId)return
    setBusyId(thread.id);setNotice('')
    try {
      if (!preview) await updateFeedbackStatus(thread.id,status)
      setThreads(current=>current.map(item=>item.id===thread.id?{...item,status,updated_at:new Date().toISOString()}:item))
    } catch (error) {
      setNotice(error instanceof Error?error.message:'Не удалось изменить статус')
    } finally {setBusyId(null)}
  }

  async function reply(thread:FeedbackThread) {
    if(busyId)return
    const body=(replyDrafts[thread.id]??'').trim()
    if (!body) return
    setBusyId(thread.id);setNotice('')
    try {
      if (!preview) await replyToFeedback(thread.id,body)
      const message={id:`local-${Date.now()}`,author_id:'coach',body,created_at:new Date().toISOString()}
      setThreads(current=>current.map(item=>item.id===thread.id?{
        ...item,status:'in_progress',updated_at:message.created_at,messages:[...item.messages,message],
      }:item))
      setReplyDrafts(current=>({...current,[thread.id]:''}))
    } catch (error) {
      setNotice(error instanceof Error?error.message:'Не удалось отправить ответ')
    } finally {setBusyId(null)}
  }

  return <div className="page-stack inbox-page">
    <section className="inbox-head">
      <div>
        <span className="eyebrow">Обратная связь</span>
        <h2>Входящие</h2>
        <p>Комментарии клиентов по тренировкам собраны в одном месте: новое → в работе → решено.</p>
      </div>
      <div className="inbox-head-count"><Inbox size={19}/><strong>{counts.new}</strong><span>новых</span></div>
    </section>

    <div className="inbox-tabs">
      {([
        ['new',`Новые · ${counts.new}`],
        ['in_progress',`В работе · ${counts.in_progress}`],
        ['resolved',`Решено · ${counts.resolved}`],
        ['all',`Все · ${counts.all}`],
      ] as const).map(([value,label])=><button className={filter===value?'is-active':''} key={value} onClick={()=>setFilter(value)}>{label}</button>)}
    </div>

    {notice && <div className="drawer-notice">{notice}</div>}
    {loading ? <div className="library-empty">Загружаю входящие…</div> : (
      <div className="inbox-list">
        {visible.map(thread=>{
          const last=thread.messages[thread.messages.length-1]
          return <article id={'feedback-thread-'+thread.id} className={`inbox-thread ${thread.status} ${targetThreadId===thread.id?'is-target':''}`} key={thread.id}>
            <div className="inbox-thread-top">
              <div className="client-thread-identity">
                <div className="avatar small">{thread.client_name.slice(0,1)}</div>
                <div><strong>{thread.client_name}</strong><span>{thread.exercise_name ?? 'Общий вопрос'}</span></div>
              </div>
              <div className="thread-meta"><span className={`thread-status ${thread.status}`}>{labels[thread.status]}</span><small>{relativeTime(thread.updated_at)}</small></div>
            </div>

            <div className="thread-messages">
              {thread.messages.map((message,index)=><div className={`thread-message ${message.author_id===thread.client_id?'from-client':'from-coach'}`} key={message.id}>
                <div className="thread-message-author">{message.author_id===thread.client_id?<><UserRound size={13}/>{thread.client_name}</>:<><MessageCircle size={13}/>Тренер</>}</div>
                <p>{message.body}</p>
                <small>{relativeTime(message.created_at)}</small>
                {index===thread.messages.length-1 && last?.id===message.id ? null : null}
              </div>)}
            </div>

            {thread.status!=='resolved' && <div className="thread-reply">
              <input value={replyDrafts[thread.id]??''} onChange={e=>setReplyDrafts(current=>({...current,[thread.id]:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void reply(thread)}}} placeholder="Коротко ответить клиенту…"/>
              <button className="primary-button compact" disabled={busyId===thread.id||!(replyDrafts[thread.id]??'').trim()} onClick={()=>void reply(thread)}><Send size={14}/>Ответить</button>
            </div>}

            <div className="thread-actions">
              {thread.status==='new' && <button disabled={busyId===thread.id} className="ghost-button" onClick={()=>void setStatus(thread,'in_progress')}><Clock3 size={14}/>В работу</button>}
              {thread.status!=='resolved' && <button disabled={busyId===thread.id} className="ghost-button success" onClick={()=>void setStatus(thread,'resolved')}><CheckCircle2 size={14}/>Решено</button>}
              {thread.status==='resolved' && <button disabled={busyId===thread.id} className="ghost-button" onClick={()=>void setStatus(thread,'in_progress')}><Clock3 size={14}/>Вернуть в работу</button>}
            </div>
          </article>
        })}
        {!visible.length && <div className="library-empty">Здесь пока ничего нет.</div>}
      </div>
    )}
  </div>
}
