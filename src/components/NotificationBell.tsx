import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { loadUnreadNotificationCount, subscribeToMyNotifications } from '../features/notifications/service'

export function NotificationBell({preview}:{preview:boolean}){
  const [count,setCount]=useState(preview?2:0)

  useEffect(()=>{
    if(preview)return
    let active=true
    const refresh=()=>loadUnreadNotificationCount().then(value=>{if(active)setCount(value)}).catch(()=>{})
    void refresh()
    const timer=window.setInterval(refresh,60000)
    const onVisible=()=>{if(document.visibilityState==='visible')void refresh()}
    const onChanged=()=>void refresh()
    let stopRealtime=()=>{}
    void subscribeToMyNotifications(refresh).then(stop=>{
      if(active)stopRealtime=stop
      else stop()
    }).catch(()=>{})
    document.addEventListener('visibilitychange',onVisible)
    window.addEventListener('notifications:changed',onChanged)
    return ()=>{active=false;stopRealtime();window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('notifications:changed',onChanged)}
  },[preview])

  const badge=count>99?'99+':String(count)
  return <Link className="notification-bell" to="/notifications" aria-label={count>0?`Уведомления: ${count} непрочитанных`:'Уведомления'}>
    <Bell size={19}/>
    {count>0&&<span className="notification-badge" aria-hidden="true">{badge}</span>}
  </Link>
}
