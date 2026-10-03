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
