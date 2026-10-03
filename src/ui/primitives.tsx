import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

function join(...values:Array<string|undefined|false>){
  return values.filter(Boolean).join(' ')
}

export function UiCard({children,className,...props}:HTMLAttributes<HTMLDivElement>&{children:ReactNode}){
  return <div className={join('ui-card',className)} {...props}>{children}</div>
}

export function UiStack({children,className,small=false,...props}:HTMLAttributes<HTMLDivElement>&{children:ReactNode;small?:boolean}){
  return <div className={join('ui-stack',small&&'ui-stack--sm',className)} {...props}>{children}</div>
}

export function UiButton({children,className,variant='primary',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'}){
  return <button className={join('ui-button','ui-button--'+variant,className)} {...props}>{children}</button>
}

export function UiNotice({children,className,tone='success',...props}:HTMLAttributes<HTMLDivElement>&{children:ReactNode;tone?:'success'|'warning'}){
  return <div className={join('ui-notice','ui-notice--'+tone,className)} {...props}>{children}</div>
}

export function UiSectionHeader({kicker,title,icon,description,className}:{
  kicker?:string
  title:string
  icon?:ReactNode
  description?:ReactNode
  className?:string
}){
  return <div className={join('ui-section-head',className)}>
    <div className="ui-section-head__copy">
      {kicker&&<span className="ui-kicker">{kicker}</span>}
      <h3>{title}</h3>
      {description&&<div className="ui-section-head__description">{description}</div>}
    </div>
    {icon&&<div className="ui-section-head__icon">{icon}</div>}
  </div>
}
