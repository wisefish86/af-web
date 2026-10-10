import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

type Props={
  to:string
  eyebrow?:string
  title:string
  description:string
  icon:ReactNode
}

export function HubLinkCard({to,eyebrow,title,description,icon}:Props){
  return <Link className="ui-card hub-link-card" to={to}>
    <div className="hub-link-icon">{icon}</div>
    <div className="hub-link-copy">
      {eyebrow&&<span className="eyebrow">{eyebrow}</span>}
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
    <ChevronRight className="hub-link-chevron" size={22}/>
  </Link>
}
