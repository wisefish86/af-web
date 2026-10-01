import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Star } from 'lucide-react'
import type { NutritionFood } from '../features/nutrition/types'

function normalize(value:string){
  return value
    .toLocaleLowerCase('ru')
    .replaceAll('ё','е')
    .replace(/[^a-zа-я0-9]+/gi,' ')
    .trim()
    .replace(/\s+/g,' ')
}

function searchRank(food:NutritionFood,query:string){
  const q=normalize(query)
  if(!q)return 0
  const name=normalize(food.name)
  const baseName=normalize(food.base_name??'')
  const names=baseName&&baseName!==name?[name,baseName]:[name]
  const tokens=q.split(' ').filter(Boolean)

  if(names.some(value=>value===q))return 0
  if(names.some(value=>value.startsWith(q)))return 1
  if(names.some(value=>tokens.every(token=>value.split(' ').some(word=>word.startsWith(token)))))return 2
  if(names.some(value=>value.includes(q)))return 3
  if(names.some(value=>tokens.every(token=>value.includes(token))))return 4
  return 999
}

function recency(value:string|null|undefined){
  if(!value)return 0
  const time=new Date(value).getTime()
  return Number.isFinite(time)?time:0
}

export function rankFoods(foods:NutritionFood[],query:string){
  return foods
    .map(food=>({food,rank:searchRank(food,query)}))
    .filter(x=>x.rank<999)
    .sort((a,b)=>{
      if(a.rank!==b.rank)return a.rank-b.rank
      const favA=a.food.favorite?1:0
      const favB=b.food.favorite?1:0
      if(favA!==favB)return favB-favA
      const useA=a.food.usage_count??0
      const useB=b.food.usage_count??0
      if(useA!==useB)return useB-useA
      const recentDiff=recency(b.food.last_used_at)-recency(a.food.last_used_at)
      if(recentDiff!==0)return recentDiff
      return a.food.name.localeCompare(b.food.name,'ru')
    })
    .map(x=>x.food)
}

type Props={
  foods:NutritionFood[]
  placeholder?:string
  onSelect:(food:NutritionFood)=>void
  onFavorite?:(food:NutritionFood)=>void
  onEdit?:(food:NutritionFood)=>void
}

export function FoodCombobox({foods,placeholder='Найти продукт…',onSelect,onFavorite,onEdit}:Props){
  const root=useRef<HTMLDivElement>(null)
  const input=useRef<HTMLInputElement>(null)
  const [open,setOpen]=useState(false)
  const [query,setQuery]=useState('')

  useEffect(()=>{
    const close=(event:PointerEvent)=>{
      if(root.current&&!root.current.contains(event.target as Node))setOpen(false)
    }
    document.addEventListener('pointerdown',close)
    return ()=>document.removeEventListener('pointerdown',close)
  },[])

  const results=useMemo(()=>rankFoods(foods,query),[foods,query])

  function choose(food:NutritionFood){
    onSelect(food)
    setQuery('')
    setOpen(false)
  }

  return <div className={'food-combobox '+(open?'is-open':'')} ref={root}>
    <div className="food-combobox-input">
      <Search size={16}/>
      <input
        ref={input}
        value={query}
        placeholder={placeholder}
        onFocus={()=>setOpen(true)}
        onChange={e=>{setQuery(e.target.value);setOpen(true)}}
        autoComplete="off"
      />
    </div>

    {open&&<div className="food-combobox-menu">
      <div className="food-combobox-caption">{query.trim()?`Найдено: ${results.length}`:'Сначала избранное, затем остальные продукты'}</div>
      {results.length===0?<div className="food-combobox-empty">Ничего не найдено</div>:results.map(food=><div className="food-combobox-row" key={(food.source??'global')+':'+food.id}>
        <button className="food-combobox-main" onClick={()=>choose(food)}>
          <span className="food-combobox-name">
            <strong>{food.favorite&&<Star size={12} className="food-inline-star"/>}{food.name}</strong>
            <small>{Math.round(food.kcal_100)} ккал · {food.protein_100} Б / {food.fat_100} Ж / {food.carbs_100} У на 100 г</small>
          </span>
          <span className="food-combobox-tags">
            {food.source==='personal'&&<em>мой</em>}
            {food.overridden&&<em>мои КБЖУ</em>}
            {(food.usage_count??0)>0&&<small>×{food.usage_count}</small>}
          </span>
        </button>
        {onEdit&&<button className="food-combobox-edit" onClick={()=>onEdit(food)} title="Изменить мои данные">КБЖУ</button>}
        {onFavorite&&<button className={'food-combobox-star '+(food.favorite?'is-active':'')} onClick={()=>onFavorite(food)} title={food.favorite?'Убрать из избранного':'В избранное'}><Star size={15}/></button>}
      </div>)}
    </div>}
  </div>
}
