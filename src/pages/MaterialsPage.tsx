import { useEffect, useState } from 'react'
import { ArrowLeft, BookOpen, CheckSquare, ChevronRight } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Material={id:string;slug:string;title:string;summary:string|null;category:string;material_type:string;content_markdown:string|null}
const cats=[['all','Все'],['nutrition','Питание'],['training','Тренировки'],['progress','Прогресс'],['preparation','Чек-листы'],['app','Приложение']] as const

function MaterialBody({content}:{content:string}){
  return <div className="material-article-body">{content.split('\n').map((raw,i)=>{
    const line=raw.trim()
    if(!line)return <div className="material-spacer" key={i}/>
    if(line.startsWith('### '))return <h3 key={i}>{line.slice(4)}</h3>
    if(line.startsWith('## '))return <h2 key={i}>{line.slice(3)}</h2>
    if(line.startsWith('# '))return <h2 key={i}>{line.slice(2)}</h2>
    if(/^[-*] /.test(line))return <div className="material-bullet" key={i}><span>•</span><p>{line.slice(2)}</p></div>
    if(/^\d+\. /.test(line))return <div className="material-bullet" key={i}><span>{line.match(/^\d+/)?.[0]}.</span><p>{line.replace(/^\d+\. /,'')}</p></div>
    return <p key={i}>{line.replace(/\*\*/g,'')}</p>
  })}</div>
}

export function MaterialsPage(){
  const {slug}=useParams()
  const navigate=useNavigate()
  const [items,setItems]=useState<Material[]>([]),[cat,setCat]=useState('all'),[loading,setLoading]=useState(true),[error,setError]=useState('')
  useEffect(()=>{if(!supabase){setLoading(false);setError('Не удалось подключиться к базе материалов.');return}
    supabase.from('learning_materials').select('id,slug,title,summary,category,material_type,content_markdown').eq('published',true).order('sort_order')
      .then(({data,error})=>{if(error)setError('Не удалось загрузить материалы. Попробуй обновить страницу.');else setItems((data??[]) as Material[]);setLoading(false)})
  },[])
  const selected=slug?items.find(x=>x.slug===slug):null
  if(slug&&!loading&&!selected)return <div className="page-stack materials-page"><button className="text-button" onClick={()=>navigate('/materials')}><ArrowLeft size={16}/>Все материалы</button><div className="library-empty">{error||'Материал не найден.'}</div></div>
  if(selected)return <div className="page-stack materials-page material-detail">
    <button className="text-button material-back" onClick={()=>navigate('/materials')}><ArrowLeft size={16}/>Все материалы</button>
    <article className="panel material-article"><span className="eyebrow">База знаний</span><h1>{selected.title}</h1>{selected.summary&&<p className="material-lead">{selected.summary}</p>}<MaterialBody content={selected.content_markdown||''}/></article>
  </div>
  const visible=cat==='all'?items:items.filter(x=>x.category===cat)
  return <div className="page-stack materials-page"><section className="section-intro"><div><span className="eyebrow">База знаний</span><h2>Материалы</h2><p>Инструкции, памятки и полезные чек-листы — в одном месте.</p></div></section>
    <div className="materials-filters">{cats.map(([v,l])=><button key={v} className={cat===v?'is-active':''} onClick={()=>setCat(v)}>{l}</button>)}</div>
    {loading?<div className="library-empty">Загружаю…</div>:error?<div className="drawer-notice">{error}</div>:visible.length===0?<div className="library-empty">В этой категории материалы скоро появятся.</div>:<div className="materials-grid">{visible.map(x=><button className="material-card material-card-button" key={x.id} onClick={()=>navigate('/materials/'+x.slug)}><div className="material-card-icon">{x.material_type==='checklist'?<CheckSquare size={20}/>:<BookOpen size={20}/>}</div><div className="material-card-copy"><h3>{x.title}</h3>{x.summary&&<p>{x.summary}</p>}</div><ChevronRight size={18}/></button>)}</div>}
  </div>
}
