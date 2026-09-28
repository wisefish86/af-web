import { useEffect, useState } from 'react'
import { BookOpen, CheckSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
type Material={id:string;title:string;summary:string|null;category:string;material_type:string}
const cats=[['all','Все'],['nutrition','Питание'],['training','Тренировки'],['progress','Прогресс'],['preparation','Чек-листы'],['app','Приложение']] as const
export function MaterialsPage(){const [items,setItems]=useState<Material[]>([]),[cat,setCat]=useState('all'),[loading,setLoading]=useState(true)
useEffect(()=>{if(!supabase){setLoading(false);return}supabase.from('learning_materials').select('id,title,summary,category,material_type').eq('published',true).order('sort_order').then(({data})=>{setItems((data??[]) as Material[]);setLoading(false)})},[])
const visible=cat==='all'?items:items.filter(x=>x.category===cat)
return <div className="page-stack materials-page"><section className="section-intro"><div><span className="eyebrow">База знаний</span><h2>Материалы</h2><p>Инструкции, памятки и полезные чек-листы — в одном месте.</p></div></section><div className="materials-filters">{cats.map(([v,l])=><button key={v} className={cat===v?'is-active':''} onClick={()=>setCat(v)}>{l}</button>)}</div>{loading?<div className="library-empty">Загружаю…</div>:visible.length===0?<div className="library-empty">В этой категории материалы скоро появятся.</div>:<div className="materials-grid">{visible.map(x=><article className="material-card" key={x.id}><div className="material-card-icon">{x.material_type==='checklist'?<CheckSquare size={20}/>:<BookOpen size={20}/>}</div><div><h3>{x.title}</h3>{x.summary&&<p>{x.summary}</p>}</div></article>)}</div>}</div>}
