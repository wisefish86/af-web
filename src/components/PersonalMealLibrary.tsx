import { useEffect, useMemo, useState } from 'react'
import { Plus, RotateCcw, Save, Search, Star, Trash2 } from 'lucide-react'
import {
  loadMyFoodPreferences, loadNutritionFoods, loadSavedMeals, saveMealPreset, setMyFoodPreference
} from '../features/nutrition/service'
import type { NutritionFood, NutritionMealItemDraft, SavedMeal } from '../features/nutrition/types'

function uid(){
  return typeof crypto!=='undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()+Math.random())
}
function asItem(food:NutritionFood):NutritionMealItemDraft{
  return {
    local_id:uid(),food_id:food.id,name:food.name,grams:food.default_portion_g??100,
    kcal_100:food.kcal_100,protein_100:food.protein_100,fat_100:food.fat_100,carbs_100:food.carbs_100,
    is_fixed:true,notes:'',
  }
}
function totals(items:NutritionMealItemDraft[]){
  return items.reduce((s,i)=>{
    const f=i.grams/100
    return {kcal:s.kcal+i.kcal_100*f,protein:s.protein+i.protein_100*f,fat:s.fat+i.fat_100*f,carbs:s.carbs+i.carbs_100*f}
  },{kcal:0,protein:0,fat:0,carbs:0})
}

const previewFoods:NutritionFood[]=[
  {id:'cottage',name:'Творог 5%',kcal_100:145,protein_100:17,fat_100:5,carbs_100:3,default_portion_g:180},
  {id:'banana',name:'Банан',kcal_100:89,protein_100:1.1,fat_100:.3,carbs_100:22.8,default_portion_g:120},
  {id:'oats',name:'Овсяные хлопья',kcal_100:370,protein_100:13,fat_100:7,carbs_100:62,default_portion_g:70},
  {id:'eggs',name:'Яйца куриные',kcal_100:143,protein_100:12.6,fat_100:9.5,carbs_100:.7,default_portion_g:100},
]

export function PersonalMealLibrary({preview}:{preview:boolean}){
  const [foods,setFoods]=useState<NutritionFood[]>(preview?previewFoods:[])
  const [prefs,setPrefs]=useState<Record<string,'preferred'|'allowed'|'hidden'|'avoid'>>(preview?{cottage:'preferred',banana:'preferred'}:{})
  const [saved,setSaved]=useState<SavedMeal[]>([])
  const [query,setQuery]=useState('')
  const [draftName,setDraftName]=useState('Мой завтрак')
  const [items,setItems]=useState<NutritionMealItemDraft[]>(preview?[asItem(previewFoods[0]),asItem(previewFoods[1])]:[])
  const [notice,setNotice]=useState('')
  const [saving,setSaving]=useState(false)

  useEffect(()=>{
    if(preview)return
    Promise.all([loadNutritionFoods(),loadMyFoodPreferences(),loadSavedMeals()])
      .then(([f,p,s])=>{setFoods(f);setPrefs(p);setSaved(s)})
      .catch(e=>setNotice(e instanceof Error?e.message:'Не удалось загрузить библиотеку питания'))
  },[preview])

  const shown=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase('ru')
    return foods
      .filter(f=>prefs[f.id]!=='avoid' && (!q||f.name.toLocaleLowerCase('ru').includes(q)))
      .sort((a,b)=>{
        const pa=prefs[a.id]==='preferred'?0:1
        const pb=prefs[b.id]==='preferred'?0:1
        return pa-pb||a.name.localeCompare(b.name,'ru')
      })
      .slice(0,12)
  },[foods,prefs,query])

  const t=totals(items)

  async function toggleFavorite(food:NutritionFood){
    const next=prefs[food.id]==='preferred'?'allowed':'preferred'
    setPrefs(p=>({...p,[food.id]:next}))
    if(preview)return
    try{await setMyFoodPreference(food.id,next)}
    catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить избранное')}
  }

  function add(food:NutritionFood){
    setItems(list=>[...list,asItem(food)])
  }

  async function save(){
    if(!draftName.trim()){setNotice('Укажи название блюда.');return}
    if(!items.length){setNotice('Добавь хотя бы один продукт.');return}
    setSaving(true);setNotice('')
    try{
      if(preview){
        setSaved(s=>[...s,{id:uid(),name:draftName.trim(),meal_type:'main',notes:null,items:items.map(i=>({...i,local_id:uid()}))}])
      }else{
        await saveMealPreset(draftName.trim(),'main',items)
        setSaved(await loadSavedMeals())
      }
      setNotice('Блюдо сохранено. Его можно загрузить снова в любой момент.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить блюдо')}
    finally{setSaving(false)}
  }

  function restore(meal:SavedMeal){
    setDraftName(meal.name)
    setItems(meal.items.map(i=>({...i,local_id:uid()})))
    setNotice('Связка загружена в редактор — можно менять граммовки и сохранить новым вариантом.')
  }

  return <section className="panel personal-meal-library">
    <div className="panel-head">
      <div><span className="eyebrow">Личная библиотека</span><h3>Любимые продукты и мои блюда</h3></div>
    </div>
    <p className="panel-description">Звёздочка поднимает продукт наверх. Сохранённое блюдо хранит точные граммовки и КБЖУ на момент сохранения.</p>

    <div className="personal-food-search">
      <div className="search-box"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти продукт…"/></div>
      <small>Справочные КБЖУ усреднённые; для брендового продукта сверяй упаковку.</small>
    </div>

    <div className="personal-food-results">
      {shown.map(food=><div className="personal-food-row" key={food.id}>
        <button className={'favorite-food '+(prefs[food.id]==='preferred'?'is-active':'')} onClick={()=>void toggleFavorite(food)} title="Избранное"><Star size={15}/></button>
        <div><strong>{food.name}</strong><span>{Math.round(food.kcal_100)} ккал · {food.protein_100} Б / {food.fat_100} Ж / {food.carbs_100} У на 100 г</span></div>
        <button className="ghost-button compact" onClick={()=>add(food)}><Plus size={13}/>В блюдо</button>
      </div>)}
    </div>

    <div className="personal-meal-editor">
      <div className="personal-meal-editor-head">
        <input value={draftName} onChange={e=>setDraftName(e.target.value)} placeholder="Название, например: Завтрак с творогом"/>
        <div><strong>{Math.round(t.kcal)} ккал</strong><span>{Math.round(t.protein)} Б · {Math.round(t.fat)} Ж · {Math.round(t.carbs)} У</span></div>
      </div>
      {items.length===0?<div className="meal-items-empty">Добавь продукты из списка выше.</div>:<div className="personal-meal-items">
        {items.map(item=><div key={item.local_id}>
          <div><strong>{item.name}</strong><span>{Math.round(item.grams*item.kcal_100/100)} ккал</span></div>
          <label><input type="number" min="1" step="5" value={Math.round(item.grams)} onChange={e=>setItems(list=>list.map(i=>i.local_id===item.local_id?{...i,grams:Math.max(1,Number(e.target.value)||1)}:i))}/><span>г</span></label>
          <button className="icon-button danger" onClick={()=>setItems(list=>list.filter(i=>i.local_id!==item.local_id))}><Trash2 size={14}/></button>
        </div>)}
      </div>}
      <div className="personal-meal-actions">
        <button className="ghost-button" onClick={()=>{setItems([]);setDraftName('Новое блюдо')}}><RotateCcw size={14}/>Очистить</button>
        <button className="primary-button compact" disabled={saving||!items.length} onClick={()=>void save()}><Save size={14}/>{saving?'Сохраняю…':'Сохранить блюдо'}</button>
      </div>
    </div>

    {saved.length>0&&<div className="saved-personal-meals">
      <strong>Сохранённые блюда</strong>
      <div>{saved.map(meal=>{
        const mt=totals(meal.items)
        return <button key={meal.id} onClick={()=>restore(meal)}>
          <span><b>{meal.name}</b><small>{meal.items.map(i=>i.name).join(' · ')}</small></span>
          <em>{Math.round(mt.kcal)} ккал</em>
        </button>
      })}</div>
    </div>}
    {notice&&<div className="settings-inline-notice">{notice}</div>}
  </section>
}
