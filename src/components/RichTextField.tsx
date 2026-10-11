import { useRef, useState } from 'react'
import { Bold, Eye, EyeOff, Heading4, Link2, List, ListOrdered } from 'lucide-react'
import { MarkdownText } from './MarkdownText'

type Props = {
  label: string
  value: string
  onChange: (value:string)=>void
  placeholder?: string
  rows?: number
  help?: string
}

type FormatKind = 'bold'|'heading'|'bullet'|'numbered'|'link'

export function RichTextField({label,value,onChange,placeholder,rows=7,help}:Props){
  const ref=useRef<HTMLTextAreaElement|null>(null)
  const [preview,setPreview]=useState(false)

  function apply(kind:FormatKind){
    const el=ref.current
    if(!el)return
    const start=el.selectionStart
    const end=el.selectionEnd
    const selected=value.slice(start,end)
    let inserted=''
    let selectStart:number|null=null
    let selectEnd:number|null=null

    if(kind==='bold'){
      const inner=selected||'важный текст'
      inserted=`**${inner}**`
      if(!selected){selectStart=start+2;selectEnd=selectStart+inner.length}
    }else if(kind==='heading'){
      const lineStart=value.lastIndexOf('\n',Math.max(0,start-1))+1
      const lineEnd=value.indexOf('\n',end)
      const actualEnd=lineEnd===-1?value.length:lineEnd
      const block=value.slice(lineStart,actualEnd)
      const next=block.split('\n').map(line=>line.startsWith('#### ')?line:`#### ${line}`).join('\n')
      onChange(value.slice(0,lineStart)+next+value.slice(actualEnd))
      requestAnimationFrame(()=>{el.focus();el.setSelectionRange(lineStart,lineStart+next.length)})
      return
    }else if(kind==='bullet'||kind==='numbered'){
      const lineStart=value.lastIndexOf('\n',Math.max(0,start-1))+1
      const lineEnd=value.indexOf('\n',end)
      const actualEnd=lineEnd===-1?value.length:lineEnd
      const lines=value.slice(lineStart,actualEnd).split('\n')
      const next=lines.map((line,index)=>{
        const clean=line.replace(/^\s*(?:[-*•]|\d+\.)\s+/,'')
        return kind==='bullet'?`- ${clean||'пункт'}`:`${index+1}. ${clean||'шаг'}`
      }).join('\n')
      onChange(value.slice(0,lineStart)+next+value.slice(actualEnd))
      requestAnimationFrame(()=>{el.focus();el.setSelectionRange(lineStart,lineStart+next.length)})
      return
    }else{
      const text=selected||'текст ссылки'
      inserted=`[${text}](https://)`
      selectStart=start+text.length+3
      selectEnd=selectStart+'https://'.length
    }

    onChange(value.slice(0,start)+inserted+value.slice(end))
    requestAnimationFrame(()=>{
      el.focus()
      const caret=start+inserted.length
      el.setSelectionRange(selectStart??caret,selectEnd??caret)
    })
  }

  return <div className="rich-text-field">
    <div className="rich-text-field-head">
      <span className="field-label-text">{label}</span>
      {help&&<small>{help}</small>}
    </div>
    <div className="rich-text-toolbar" role="toolbar" aria-label={`Форматирование: ${label}`}>
      <button type="button" onClick={()=>apply('heading')} title="Небольшой заголовок"><Heading4 size={16}/><span>Заголовок</span></button>
      <button type="button" onClick={()=>apply('bold')} title="Жирный текст"><Bold size={16}/><span>Жирный</span></button>
      <button type="button" onClick={()=>apply('bullet')} title="Маркированный список"><List size={16}/><span>Список</span></button>
      <button type="button" onClick={()=>apply('numbered')} title="Нумерованный список"><ListOrdered size={16}/><span>Шаги</span></button>
      <button type="button" onClick={()=>apply('link')} title="Ссылка"><Link2 size={16}/><span>Ссылка</span></button>
      <button type="button" className={preview?'active':''} onClick={()=>setPreview(current=>!current)} title="Предпросмотр">
        {preview?<EyeOff size={16}/>:<Eye size={16}/>}<span>{preview?'Редактировать':'Предпросмотр'}</span>
      </button>
    </div>
    {preview
      ? <div className="rich-text-preview"><MarkdownText text={value||'Здесь появится оформленный текст.'}/></div>
      : <textarea ref={ref} value={value} onChange={e=>onChange(e.target.value)} rows={rows} placeholder={placeholder}/>}
  </div>
}
