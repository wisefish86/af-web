import type { ReactNode } from 'react'

function safeUrl(raw:string){
  const value=raw.trim()
  if(/^https?:\/\//i.test(value))return value
  return null
}

function inline(text:string,keyPrefix:string):ReactNode[]{
  const pattern=/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g
  const out:ReactNode[]=[]
  let last=0
  let match:RegExpExecArray|null
  let index=0
  while((match=pattern.exec(text))){
    if(match.index>last)out.push(text.slice(last,match.index))
    const token=match[0]
    if(token.startsWith('**')){
      out.push(<strong key={keyPrefix+'-b-'+index}>{token.slice(2,-2)}</strong>)
    }else{
      const link=token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      const href=link?safeUrl(link[2]):null
      out.push(href
        ? <a key={keyPrefix+'-a-'+index} href={href} target="_blank" rel="noreferrer">{link?.[1]}</a>
        : <span key={keyPrefix+'-t-'+index}>{link?.[1]??token}</span>)
    }
    index+=1
    last=match.index+token.length
  }
  if(last<text.length)out.push(text.slice(last))
  return out
}

export function MarkdownText({text}:{text:string}){
  const lines=text.replace(/\r\n/g,'\n').split('\n')
  const blocks:ReactNode[]=[]
  let i=0

  while(i<lines.length){
    const line=lines[i].trimEnd()
    if(!line.trim()){i+=1;continue}

    if(/^####\s+/.test(line)){
      const value=line.replace(/^####\s+/,'')
      blocks.push(<h4 key={'h-'+i}>{inline(value,'h'+i)}</h4>)
      i+=1
      continue
    }

    if(/^[-*]\s+/.test(line)){
      const items:string[]=[]
      while(i<lines.length&&/^[-*]\s+/.test(lines[i].trim())){
        items.push(lines[i].trim().replace(/^[-*]\s+/,''))
        i+=1
      }
      blocks.push(<ul key={'ul-'+i}>{items.map((item,index)=><li key={index}>{inline(item,'ul'+i+'-'+index)}</li>)}</ul>)
      continue
    }

    if(/^\d+\.\s+/.test(line)){
      const items:string[]=[]
      while(i<lines.length&&/^\d+\.\s+/.test(lines[i].trim())){
        items.push(lines[i].trim().replace(/^\d+\.\s+/,''))
        i+=1
      }
      blocks.push(<ol key={'ol-'+i}>{items.map((item,index)=><li key={index}>{inline(item,'ol'+i+'-'+index)}</li>)}</ol>)
      continue
    }

    const paragraph:string[]=[line.trim()]
    i+=1
    while(i<lines.length){
      const next=lines[i].trim()
      if(!next||/^####\s+/.test(next)||/^[-*]\s+/.test(next)||/^\d+\.\s+/.test(next))break
      paragraph.push(next)
      i+=1
    }
    blocks.push(<p key={'p-'+i}>{inline(paragraph.join(' '),'p'+i)}</p>)
  }

  return <div className="rich-markdown">{blocks}</div>
}
