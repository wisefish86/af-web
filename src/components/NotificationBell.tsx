import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { loadUnreadNotificationCount } from '../features/notifications/service'

export function NotificationBell({preview}:{preview:boolean}){
  const [count,setCount]=useState(preview?2:0)

  useEffect(()=>{
    if(preview)return
    let active=true
    const refresh=()=>loadUnreadNotificationCount().then(value=>{if(active)setCount(value)}).catch(()=>{})
    void refresh()
    const timer=window.setInterval(refresh,60000)
    const onVisible=()=>{if(document.visibilityState==='visible')void refresh()}
    document.addEventListener('visibilitychange',onVisible)
    return ()=>{active=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisible)}
  },[preview])

  return <Link className="notification-bell" to="/notifications" aria-label="Уведомления">
    <Bell size={19}/>
    {count>0&&<span>{count>99?'99+':count}</span>}
  </Link>
}
