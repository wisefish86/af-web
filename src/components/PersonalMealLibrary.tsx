import { useEffect, useMemo, useState } from 'react'
import { Edit3, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { FoodCombobox } from './FoodCombobox'
import {
  clearMyFoodOverride, createMyPersonalFood, loadMyFoodCatalog, loadSavedMeals,
  recordMyFoodUse, saveMealPreset, saveMyFoodOverride, setMyFoodPreference,
  setMyPersonalFoodFavorite
} from '../features/nutrition/service'
import type { NutritionFood, NutritionMealItemDraft, SavedMeal } from '../features/nutrition/types'

function uid(){
  return typeof crypto!=='undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()+Math.random())
}
function asItem(food:NutritionFood):NutritionMealItemDraft{
  return {
    local_id:uid(),
    food_id:food.source==='personal'?null:food.id,
    name:food.name,
    grams:food.default_portion_g??100,
    kcal_100:food.kcal_100,
    protein_100:food.protein_100,
    fat_100:food.fat_100,
    carbs_100:food.carbs_100,
    is_fixed:true,
    notes:'',
  }
}
function totals(items:NutritionMealItemDraft[]){
  return items.reduce((s,i)=>{
    const f=i.grams/100
    return {kcal:s.kcal+i.kcal_100*f,protein:s.protein+i.protein_100*f,fat:s.fat+i.fat_100*f,carbs:s.carbs+i.carbs_100*f}
  },{kcal:0,protein:0,fat:0,carbs:0})
}
function nextMealName(slot:string,saved:SavedMeal[]){
  const prefix=slot+' '
  const nums=saved
    .filter(m=>m.name.startsWith(prefix))
    .map(m=>Number(m.name.slice(prefix.length)))
    .filter(Number.isFinite)
  return slot+' '+(nums.length?Math.max(...nums)+1:1)
}
function toNumber(value:string,fallback=0){
  const n=Number(value.replace(',','.'))
  return Number.isFinite(n)?n:fallback
}

const previewFoods:NutritionFood[]=[
  {id:'cottage',name:'Творог 5%',kcal_100:145,protein_100:17,fat_100:5,carbs_100:3,default_portion_g:180,source:'global',favorite:true,usage_count:14,last_used_at:null},
  {id:'banana',name:'Банан',kcal_100:89,protein_100:1.1,fat_100:.3,carbs_100:22.8,default_portion_g:120,source:'global',favorite:true,usage_count:10,last_used_at:null},
  {id:'oats',name:'Овсяные хлопья',kcal_100:370,protein_100:13,fat_100:7,carbs_100:62,default_portion_g:70,source:'global',favorite:true,usage_count:8,last_used_at:null},
  {id:'eggs',name:'Яйца куриные',kcal_100:143,protein_100:12.6,fat_100:9.5,carbs_100:.7,default_portion_g:100,source:'global',favorite:false,usage_count:5,last_used_at:null},
]

type FoodForm={name:string;kcal:string;protein:string;fat:string;carbs:string;portion:string}
const emptyFoodForm:FoodForm={name:'',kcal:'',protein:'',fat:'',carbs:'',portion:''}

export function PersonalMealLibrary({preview}:{preview:boolean}){
  const [foods,setFoods]=useState<NutritionFood[]>(preview?previewFoods:[])
  const [saved,setSaved]=useState<SavedMeal[]>([])
  const [slot,setSlot]=useState('Завтрак')
  const [draftName,setDraftName]=useState('Завтрак 1')
  const [nameTouched,setNameTouched]=useState(false)
  const [items,setItems]=useState<NutritionMealItemDraft[]>(preview?[asItem(previewFoods[0]),asItem(previewFoods[1])]:[])
  const [notice,setNotice]=useState('')
  const [saving,setSaving]=useState(false)
  const [showCustom,setShowCustom]=useState(false)
  const [custom,setCustom]=useState<FoodForm>(emptyFoodForm)
  const [editing,setEditing]=useState<NutritionFood|null>(null)

  async function refreshCatalog(){
    if(preview)return
    setFoods(await loadMyFoodCatalog())
  }

  useEffect(()=>{
    if(preview)return
    Promise.all([loadMyFoodCatalog(),loadSavedMeals()])
      .then(([f,s])=>{
        setFoods(f)
        setSaved(s)
        setDraftName(nextMealName('Завтрак',s))
      })
      .catch(e=>setNotice(e instanceof Error?e.message:'Не удалось загрузить библиотеку питания'))
  },[preview])

  const t=useMemo(()=>totals(items),[items])

  async function toggleFavorite(food:NutritionFood){
    const next=!food.favorite
    setFoods(list=>list.map(x=>x.id===food.id&&x.source===food.source?{...x,favorite:next}:x))
    if(preview)return
    try{
      if(food.source==='personal')await setMyPersonalFoodFavorite(food.id,next)
      else await setMyFoodPreference(food.id,next?'preferred':'allowed')
    }catch(e){
      setFoods(list=>list.map(x=>x.id===food.id&&x.source===food.source?{...x,favorite:food.favorite}:x))
      setNotice(e instanceof Error?e.message:'Не удалось сохранить избранное')
    }
  }

  function add(food:NutritionFood){
    setItems(list=>[...list,asItem(food)])
    setFoods(list=>list.map(x=>x.id===food.id&&x.source===food.source?{...x,usage_count:(x.usage_count??0)+1,last_used_at:new Date().toISOString()}:x))
    if(!preview)void recordMyFoodUse(food).catch(()=>{})
  }

  function changeSlot(next:string){
    setSlot(next)
    if(!nameTouched)setDraftName(nextMealName(next,saved))
  }

  async function save(){
    const name=draftName.trim()||nextMealName(slot,saved)
    if(!items.length){setNotice('Добавь хотя бы один продукт.');return}
    setSaving(true);setNotice('')
    try{
      if(preview){
        const next={id:uid(),name,meal_type:slot==='Перекус'?'snack':'main' as const,notes:null,items:items.map(i=>({...i,local_id:uid()}))}
        setSaved(s=>[...s,next])
      }else{
        await saveMealPreset(name,slot==='Перекус'?'snack':'main',items)
        const nextSaved=await loadSavedMeals()
        setSaved(nextSaved)
        setDraftName(nextMealName(slot,nextSaved))
      }
      setNameTouched(false)
      setNotice('Приём пищи сохранён. Его можно восстановить целиком одним нажатием.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить приём пищи')}
    finally{setSaving(false)}
  }

  function restore(meal:SavedMeal){
    setDraftName(meal.name)
    setNameTouched(true)
    setItems(meal.items.map(i=>({...i,local_id:uid()})))
    setNotice('Приём восстановлен. Изменения сейчас не затронут сохранённую версию, пока не сохранишь новую.')
  }

  async function createCustom(){
    if(!custom.name.trim()){setNotice('Укажи название продукта.');return}
    const foodInput={
      name:custom.name.trim(),
      kcal_100:toNumber(custom.kcal),
      protein_100:toNumber(custom.protein),
      fat_100:toNumber(custom.fat),
      carbs_100:toNumber(custom.carbs),
      default_portion_g:custom.portion.trim()?Math.max(1,toNumber(custom.portion,100)):null,
    }
    setSaving(true);setNotice('')
    try{
      let food:NutritionFood
      if(preview){
        food={id:uid(),...foodInput,source:'personal',favorite:true,usage_count:0,last_used_at:null}
        setFoods(list=>[food,...list])
      }else{
        food=await createMyPersonalFood(foodInput)
        await refreshCatalog()
      }
      add(food)
      setCustom(emptyFoodForm)
      setShowCustom(false)
      setNotice('Личный продукт сохранён и добавлен в текущий приём.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось добавить личный продукт')}
    finally{setSaving(false)}
  }

  async function saveEditing(){
    if(!editing)return
    setSaving(true);setNotice('')
    try{
      if(!preview){
        await saveMyFoodOverride(editing)
        await refreshCatalog()
      }else{
        setFoods(list=>list.map(x=>x.id===editing.id&&x.source===editing.source?{...editing,overridden:editing.source!=='personal'}:x))
      }
      setEditing(null)
      setNotice('Твои КБЖУ сохранены. Общий справочник для других пользователей не изменился.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить КБЖУ')}
    finally{setSaving(false)}
  }

  async function resetOverride(){
    if(!editing||editing.source==='personal')return
    setSaving(true)
    try{
      if(!preview){await clearMyFoodOverride(editing.id);await refreshCatalog()}
      setEditing(null)
      setNotice('Вернул значения из общего справочника.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось вернуть значения')}
    finally{setSaving(false)}
  }

  return <section className="panel personal-meal-library">
    <div className="panel-head">
      <div><span className="eyebrow">Личная библиотека</span><h3>Любимые продукты и мои приёмы пищи</h3></div>
    </div>
    <p className="panel-description">Избранное и часто используемое автоматически поднимаются вверх. КБЖУ всегда показываются на 100 г для сверки с упаковкой.</p>

    <div className="personal-food-picker-row">
      <FoodCombobox foods={foods} onSelect={add} onFavorite={food=>void toggleFavorite(food)} onEdit={setEditing}/>
      <button className="ghost-button" onClick={()=>setShowCustom(v=>!v)}><Plus size={14}/>Свой продукт</button>
    </div>

    {showCustom&&<div className="personal-food-form">
      <div className="personal-food-form-head"><div><strong>Добавить свой продукт</strong><span>Например, конкретный соус или творог по этикетке.</span></div><button className="icon-button" onClick={()=>setShowCustom(false)}><X size={14}/></button></div>
      <div className="personal-food-form-grid">
        <label className="wide">Название<input value={custom.name} onChange={e=>setCustom(v=>({...v,name:e.target.value}))} placeholder="Соус такой-то"/></label>
        <label>ккал / 100 г<input inputMode="decimal" value={custom.kcal} onChange={e=>setCustom(v=>({...v,kcal:e.target.value}))}/></label>
        <label>Белок<input inputMode="decimal" value={custom.protein} onChange={e=>setCustom(v=>({...v,protein:e.target.value}))}/></label>
        <label>Жиры<input inputMode="decimal" value={custom.fat} onChange={e=>setCustom(v=>({...v,fat:e.target.value}))}/></label>
        <label>Углеводы<input inputMode="decimal" value={custom.carbs} onChange={e=>setCustom(v=>({...v,carbs:e.target.value}))}/></label>
        <label>Обычная порция, г<input inputMode="decimal" value={custom.portion} onChange={e=>setCustom(v=>({...v,portion:e.target.value}))} placeholder="необязательно"/></label>
      </div>
      <button className="primary-button compact" disabled={saving} onClick={()=>void createCustom()}><Save size={14}/>Сохранить и добавить</button>
    </div>}

    {editing&&<div className="personal-food-form is-editing">
      <div className="personal-food-form-head"><div><strong>{editing.name}</strong><span>{editing.source==='personal'?'Личный продукт':'Твои значения поверх общего справочника'}</span></div><button className="icon-button" onClick={()=>setEditing(null)}><X size={14}/></button></div>
      <div className="personal-food-form-grid">
        {editing.source==='personal'&&<label className="wide">Название<input value={editing.name} onChange={e=>setEditing(v=>v?{...v,name:e.target.value}:v)}/></label>}
        <label>ккал / 100 г<input type="number" step="0.1" value={editing.kcal_100} onChange={e=>setEditing(v=>v?{...v,kcal_100:Number(e.target.value)}:v)}/></label>
        <label>Белок<input type="number" step="0.1" value={editing.protein_100} onChange={e=>setEditing(v=>v?{...v,protein_100:Number(e.target.value)}:v)}/></label>
        <label>Жиры<input type="number" step="0.1" value={editing.fat_100} onChange={e=>setEditing(v=>v?{...v,fat_100:Number(e.target.value)}:v)}/></label>
        <label>Углеводы<input type="number" step="0.1" value={editing.carbs_100} onChange={e=>setEditing(v=>v?{...v,carbs_100:Number(e.target.value)}:v)}/></label>
        <label>Обычная порция, г<input type="number" step="1" value={editing.default_portion_g??''} onChange={e=>setEditing(v=>v?{...v,default_portion_g:e.target.value===''?null:Number(e.target.value)}:v)}/></label>
      </div>
      <div className="personal-food-form-actions">
        {editing.source!=='personal'&&editing.overridden&&<button className="ghost-button" onClick={()=>void resetOverride()}>Вернуть справочник</button>}
        <button className="primary-button compact" disabled={saving} onClick={()=>void saveEditing()}><Save size={14}/>Сохранить мои КБЖУ</button>
      </div>
    </div>}

    <div className="personal-meal-editor">
      <div className="personal-meal-name-row">
        <select value={slot} onChange={e=>changeSlot(e.target.value)}>
          <option>Завтрак</option><option>Обед</option><option>Ужин</option><option>Перекус</option>
        </select>
        <input value={draftName} onChange={e=>{setDraftName(e.target.value);setNameTouched(true)}} placeholder={nextMealName(slot,saved)}/>
        <div><strong>{Math.round(t.kcal)} ккал</strong><span>{Math.round(t.protein)} Б · {Math.round(t.fat)} Ж · {Math.round(t.carbs)} У</span></div>
      </div>

      {items.length===0?<div className="meal-items-empty">Найди продукт выше и добавь его в приём.</div>:<div className="personal-meal-items">
        {items.map(item=><div key={item.local_id}>
          <div><strong>{item.name}</strong><span>{Math.round(item.kcal_100)} ккал / 100 г · в порции ≈ {Math.round(item.grams*item.kcal_100/100)} ккал</span></div>
          <label><input type="number" min="1" step="5" value={Math.round(item.grams)} onChange={e=>setItems(list=>list.map(i=>i.local_id===item.local_id?{...i,grams:Math.max(1,Number(e.target.value)||1)}:i))}/><span>г</span></label>
          <button className="icon-button danger" onClick={()=>setItems(list=>list.filter(i=>i.local_id!==item.local_id))}><Trash2 size={14}/></button>
        </div>)}
      </div>}

      <div className="personal-meal-actions">
        <button className="ghost-button" onClick={()=>{setItems([]);setNameTouched(false);setDraftName(nextMealName(slot,saved))}}><RotateCcw size={14}/>Очистить</button>
        <button className="primary-button compact" disabled={saving||!items.length} onClick={()=>void save()}><Save size={14}/>{saving?'Сохраняю…':'Сохранить приём'}</button>
      </div>
    </div>

    {saved.length>0&&<div className="saved-personal-meals">
      <strong>Сохранённые приёмы</strong>
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
