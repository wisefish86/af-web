import { useEffect, useState } from 'react'
import { MessageCircle, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { loadTrainerContactChannels, type TrainerContactChannel } from '../features/contacts/service'
import { isMobileDevice, telegramAppLink } from '../features/contacts/telegramLink'

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

  function openTelegram(event:React.MouseEvent<HTMLAnchorElement>){
    const appUrl=telegramAppLink(telegramContact!.url)
    if(!appUrl||!isMobileDevice(navigator.userAgent))return
    event.preventDefault()
    let fallback:number|undefined
    const stopFallback=()=>{
      if(document.visibilityState!=='visible'&&fallback!==undefined)window.clearTimeout(fallback)
      document.removeEventListener('visibilitychange',stopFallback)
    }
    document.addEventListener('visibilitychange',stopFallback)
    fallback=window.setTimeout(()=>{
      document.removeEventListener('visibilitychange',stopFallback)
      window.location.assign(telegramContact!.url)
    },900)
    window.location.href=appUrl
  }

  return <a className="trainer-chat-button" href={telegramContact.url} target="_blank" rel="noreferrer" aria-label="Чат с тренером" onClick={openTelegram}>
    <MessageCircle size={18}/><span>Чат с тренером</span>
  </a>
}
