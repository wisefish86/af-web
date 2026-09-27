import { MessageCircle, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type Props={
  storageKey:string
  text:string
  title?:string
}

function textHash(value:string){
  let hash=0
  for(let i=0;i<value.length;i++) hash=((hash<<5)-hash+value.charCodeAt(i))|0
  return Math.abs(hash).toString(36)
}

export function CoachHint({storageKey,text,title='Подсказка тренера'}:Props){
  const stateKey=useMemo(()=>`andrey-fit-coach-hint:${storageKey}:${textHash(text)}`,[storageKey,text])
  const [collapsed,setCollapsed]=useState(()=>{
    try{return localStorage.getItem(stateKey)==='collapsed'}catch{return false}
  })

  useEffect(()=>{
    try{setCollapsed(localStorage.getItem(stateKey)==='collapsed')}catch{setCollapsed(false)}
  },[stateKey])

  function collapse(){
    setCollapsed(true)
    try{localStorage.setItem(stateKey,'collapsed')}catch{}
  }

  function expand(){
    setCollapsed(false)
    try{localStorage.removeItem(stateKey)}catch{}
  }

  if(collapsed){
    return <button className="coach-hint-collapsed" onClick={expand} aria-label={'Показать: '+title} title={'Показать: '+title}>
      <MessageCircle size={17}/>
      <span>{title}</span>
    </button>
  }

  return <div className="coach-note coach-hint">
    <div className="coach-hint-copy">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
    <button className="coach-hint-close" onClick={collapse} aria-label="Свернуть подсказку" title="Свернуть">
      <X size={15}/>
    </button>
  </div>
}
