import { useEffect, useMemo, useState } from 'react'
import { MessageCircle, Send, UserRound, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { loadTrainerContactChannels, type TrainerContactChannel } from '../features/contacts/service'

const previewContacts:TrainerContactChannel[]=[
  {id:'preview-tg',trainer_id:'preview-trainer',channel:'telegram',url:'#',label:'Telegram',enabled:true,sort_order:10},
  {id:'preview-wa',trainer_id:'preview-trainer',channel:'whatsapp',url:'#',label:'WhatsApp',enabled:true,sort_order:20},
  {id:'preview-max',trainer_id:'preview-trainer',channel:'max',url:'#',label:'MAX',enabled:true,sort_order:30},
]

const labels:Record<TrainerContactChannel['channel'],string>={telegram:'Telegram',whatsapp:'WhatsApp',max:'MAX'}

export function TrainerChatButton({preview=false}:{preview?:boolean}){
  const [contacts,setContacts]=useState<TrainerContactChannel[]>(preview?previewContacts:[])
  const [open,setOpen]=useState(false)

  useEffect(()=>{
    if(preview){setContacts(previewContacts);return}
    let cancelled=false
    loadTrainerContactChannels().then(items=>{if(!cancelled)setContacts(items)}).catch(()=>{if(!cancelled)setContacts([])})
    return()=>{cancelled=true}
  },[preview])

  const messengerContacts=useMemo(()=>contacts.filter(item=>['telegram','whatsapp','max'].includes(item.channel)),[contacts])

  if(!messengerContacts.length)return <Link className="trainer-chat-button" to="/trainer"><UserRound size={18}/><span>О тренере</span></Link>

  return <>
    <button type="button" className="trainer-chat-button" onClick={()=>setOpen(true)}>
      <MessageCircle size={18}/><span>Чат с тренером</span>
    </button>
    {open&&<div className="drawer-backdrop trainer-chat-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <aside className="exercise-drawer workout-sheet trainer-chat-sheet">
        <div className="drawer-head">
          <div><span className="eyebrow">Связаться</span><h3>Чат с тренером</h3></div>
          <button type="button" className="icon-button" aria-label="Закрыть" onClick={()=>setOpen(false)}><X size={18}/></button>
        </div>
        <div className="drawer-body">
          <p className="sheet-description trainer-chat-guidance">Если чувствуешь, что хочется сорваться, появляется сопротивление к программе, что-то перестало получаться или план стал неудобным — напиши мне. Не нужно ждать отчёта: разберём, что происходит, и при необходимости скорректируем план.</p>
          <p className="sheet-description">Выбери привычный мессенджер. Переписка откроется в его приложении или веб-версии.</p>
          <div className="trainer-chat-options">
            <Link className="trainer-chat-profile-link" to="/trainer" onClick={()=>setOpen(false)}><UserRound size={17}/><span>О тренере</span></Link>
            {messengerContacts.map(item=>preview
              ? <button type="button" key={item.id} onClick={()=>setOpen(false)}><Send size={17}/><span>{item.label||labels[item.channel as keyof typeof labels]||item.channel}</span></button>
              : <a key={item.id} href={item.url} target="_blank" rel="noreferrer"><Send size={17}/><span>{item.label||labels[item.channel as keyof typeof labels]||item.channel}</span></a>
            )}
          </div>
        </div>
      </aside>
    </div>}
  </>
}
