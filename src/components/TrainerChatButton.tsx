import { useEffect, useState } from 'react'
import { MessageCircle, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { loadTrainerContactChannels, type TrainerContactChannel } from '../features/contacts/service'
import { telegramExternalLink } from '../features/contacts/telegramLink'

const previewContacts:TrainerContactChannel[]=[
  {id:'preview-tg',trainer_id:'preview-trainer',channel:'telegram',url:'https://t.me/example',label:'Telegram',enabled:true,sort_order:10},
]

export function TrainerChatButton({preview=false}:{preview?:boolean}){
  const [contacts,setContacts]=useState<TrainerContactChannel[]>(preview?previewContacts:[])

  useEffect(()=>{
    if(preview){setContacts(previewContacts);return}
    let cancelled=false
    loadTrainerContactChannels().then(items=>{if(!cancelled)setContacts(items)}).catch(()=>{if(!cancelled)setContacts([])})
    return()=>{cancelled=true}
  },[preview])

  const telegramContact=contacts.find(item=>item.channel==='telegram')

  if(!telegramContact)return <Link className="trainer-chat-button" to="/trainer"><UserRound size={18}/><span>О тренере</span></Link>

  const chatHref=typeof navigator==='undefined'
    ?telegramContact.url
    :telegramExternalLink(telegramContact.url,navigator.userAgent)


  return <a className="trainer-chat-button" href={chatHref} target="_blank" rel="noreferrer" aria-label="Чат с тренером">
    <MessageCircle size={18}/><span>Чат с тренером</span>
  </a>
}
