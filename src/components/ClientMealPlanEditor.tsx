import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Lock, Plus, Save, Trash2, Unlock, X } from 'lucide-react'
import { FoodCombobox } from './FoodCombobox'
import { FoodPersonalizationSheet } from './FoodPersonalizationSheet'
import { UnsavedChangesGuard } from './UnsavedChangesGuard'
import { showAppToast } from '../lib/toast'
import { loadMyFoodCatalog, loadSavedMeals, saveMealPreset, saveMyMealPlanVersion } from '../features/nutrition/service'
import type {
  ActiveNutritionPlan, NutritionFood, NutritionMealDraft, NutritionMealItemDraft,
  NutritionMealVariantDraft, SavedMeal,
} from '../features/nutrition/types'

function uid(){return typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():String(Date.now()+Math.random())}
function kcal(item:NutritionMealItemDraft){return item.grams*item.kcal_100/100}
function variantKcal(v:NutritionMealVariantDraft){return v.items.reduce((s,i)=>s+kcal(i),0)}
function scaleVariant(v:NutritionMealVariantDraft,target:number):NutritionMealVariantDraft{
  const fixed=v.items.filter(i=>i.is_fixed).reduce((s,i)=>s+kcal(i),0)
  const flex=v.items.filter(i=>!i.is_fixed).reduce((s,i)=>s+kcal(i),0)
  if(flex<=0)return v
  const factor=Math.max(.01,(target-fixed)/flex)
  return {...v,items:v.items.map(i=>i.is_fixed||i.grams<=0?i:{...i,grams:Math.min(10000,Math.max(1,Math.round(i.grams*factor)))})}
}
function scaleMeal(meal:NutritionMealDraft,target:number):NutritionMealDraft{
  return {...meal,kcal_target:target,variants:meal.variants.map(v=>scaleVariant(v,target))}
}
function redistribute(meals:NutritionMealDraft[],budget:number,changedId?:string,changedTarget?:number){
  const base=meals.map(m=>changedId===m.local_id?{...m,kcal_target:Math.max(0,Math.round(changedTarget??m.kcal_target))}:m)
  const fixed=base.filter(m=>m.target_locked||m.local_id===changedId)
  const flex=base.filter(m=>!fixed.includes(m))
  const fixedTotal=fixed.reduce((s,m)=>s+m.kcal_target,0)
  const remaining=Math.max(0,budget-fixedTotal)
  if(!flex.length)return base.map(m=>scaleMeal(m,m.kcal_target))
  const weight=flex.reduce((s,m)=>s+Math.max(1,m.kcal_target),0)
  let assigned=0
  return base.map(m=>{
    if(fixed.includes(m))return scaleMeal(m,m.kcal_target)
    const idx=flex.indexOf(m)
    const target=idx===flex.length-1?remaining-assigned:Math.round(remaining*Math.max(1,m.kcal_target)/weight)
    assigned+=Math.max(0,target)
    return scaleMeal(m,Math.max(0,target))
  })
}
function itemFromFood(food:NutritionFood):NutritionMealItemDraft{
  return {local_id:uid(),food_id:food.source==='personal'?null:food.id,client_food_id:food.source==='personal'?food.id:null,name:food.name,
    grams:food.default_portion_g??100,kcal_100:food.kcal_100,protein_100:food.protein_100,
    fat_100:food.fat_100,carbs_100:food.carbs_100,is_fixed:false,notes:''}
}
function variantFromSaved(meal:SavedMeal):NutritionMealVariantDraft{
  return {local_id:uid(),name:meal.name,is_default:false,notes:meal.notes??'',
    items:meal.items.map(i=>({...i,local_id:uid()}))}
}
function draftFromPlan(plan:ActiveNutritionPlan,free:number):NutritionMealDraft[]{
  const meals=plan.meals.map(meal=>({
    local_id:meal.id,name:meal.name,meal_type:meal.meal_type,kcal_target:meal.kcal_target,
    target_locked:meal.target_locked,notes:meal.notes??'',
    variants:meal.variants.map(v=>({
      local_id:v.id,name:v.name,is_default:v.is_default,notes:v.notes??'',
      items:v.items.map(i=>({...i,local_id:i.id,food_id:i.food_id??null,client_food_id:i.client_food_id??null,notes:i.notes??''})),
    })),
  }))
  const budget=plan.daily_kcal_target-free
  const current=meals.reduce((s,m)=>s+m.kcal_target,0)
  return current===budget?meals:redistribute(meals,budget)
}
function snapshot(free:number,meals:NutritionMealDraft[]){return JSON.stringify({free,meals})}
function nextMealName(type:'main'|'snack',meals:NutritionMealDraft[]){
  if(type==='snack'){
    const snackCount=meals.filter(m=>m.name.toLowerCase().startsWith('перекус')).length
    return snackCount===0?'Перекус':'Перекус '+(snackCount+1)
  }
  const used=new Set(meals.map(m=>m.name.toLowerCase()))
  if(!used.has('завтрак'))return 'Завтрак'
  if(!used.has('обед'))return 'Обед'
  if(!used.has('ужин'))return 'Ужин'
  return 'Приём '+(meals.length+1)
}
function emptyVariant(name:string):NutritionMealVariantDraft{
  return {local_id:uid(),name,is_default:true,notes:'',items:[]}
}

type Props={
  plan:ActiveNutritionPlan
  preview:boolean
  onClose:()=>void
  onSaved:(plan:ActiveNutritionPlan)=>void
  reloadPlan:()=>Promise<ActiveNutritionPlan|null>
}

export function ClientMealPlanEditor({plan,preview,onClose,onSaved,reloadPlan}:Props){
  const initialFree=plan.free_kcal_target>=200&&plan.free_kcal_target<=300?plan.free_kcal_target:250
  const initialMeals=useMemo(()=>draftFromPlan(plan,initialFree),[plan.id])
  const [free,setFree]=useState(initialFree)
  const [meals,setMeals]=useState<NutritionMealDraft[]>(initialMeals)
  const [foods,setFoods]=useState<NutritionFood[]>([])
  const [saved,setSaved]=useState<SavedMeal[]>([])
  const [selected,setSelected]=useState<Record<string,string>>(()=>Object.fromEntries(initialMeals.map(m=>[m.local_id,m.variants.find(v=>v.is_default)?.local_id??m.variants[0]?.local_id??''])))
  const [baseline,setBaseline]=useState(()=>snapshot(initialFree,initialMeals))
  const [saving,setSaving]=useState(false)
  const [libraryBusy,setLibraryBusy]=useState(false)
  const [closeConfirm,setCloseConfirm]=useState(false)
  const [openMealId,setOpenMealId]=useState(initialMeals[0]?.local_id??'')
  const [addMealOpen,setAddMealOpen]=useState(false)
  const [deleteMealId,setDeleteMealId]=useState<string|null>(null)
  const [editingFood,setEditingFood]=useState<NutritionFood|null>(null)
  const [notice,setNotice]=useState('')

  useEffect(()=>{
    if(preview)return
    Promise.allSettled([loadMyFoodCatalog(),loadSavedMeals()]).then(([foodsResult,savedResult])=>{
      const failed:string[]=[]
      if(foodsResult.status==='fulfilled')setFoods(foodsResult.value);else failed.push('продукты')
      if(savedResult.status==='fulfilled')setSaved(savedResult.value);else failed.push('сохранённые наборы')
      if(failed.length)setNotice('Не удалось загрузить: '+failed.join(', ')+'. Основной редактор доступен.')
    })
  },[preview])

  const budget=plan.daily_kcal_target-free
  const allocated=meals.reduce((s,m)=>s+m.kcal_target,0)
  const dirty=snapshot(free,meals)!==baseline

  function requestClose(){
    if(dirty){setCloseConfirm(true);return}
    onClose()
  }

  function setFreeTarget(next:number){
    const value=Math.min(300,Math.max(200,Math.round(next/10)*10))
    setFree(value)
    setMeals(list=>redistribute(list,plan.daily_kcal_target-value))
  }
  function setMealTarget(id:string,value:number){setMeals(list=>redistribute(list,budget,id,value))}
  function addMeal(type:'main'|'snack'){
    if(meals.length>=5){showAppToast('В текущей модели можно использовать до 5 приёмов пищи.','warning');return}
    const name=nextMealName(type,meals)
    const target=Math.max(100,Math.round((budget/Math.max(2,meals.length+1))/10)*10)
    const variant=emptyVariant(name+' 1')
    const meal:NutritionMealDraft={
      local_id:uid(),name,meal_type:type==='snack'?'snack':'main',
      kcal_target:target,target_locked:false,notes:'',variants:[variant],
    }
    setSelected(current=>({...current,[meal.local_id]:variant.local_id}))
    setMeals(list=>{
      let next=[...list,meal]
      if(type==='snack'){
        const dinnerIndex=list.findIndex(m=>m.name.toLowerCase().startsWith('ужин'))
        if(dinnerIndex>=0)next=[...list.slice(0,dinnerIndex),meal,...list.slice(dinnerIndex)]
      }
      return redistribute(next,budget)
    })
    setOpenMealId(meal.local_id)
    setAddMealOpen(false)
    showAppToast(name+' добавлен. Добавь продукты или выбери сохранённый набор.','info')
  }
  function confirmDeleteMeal(){
    if(!deleteMealId)return
    if(meals.length<=2){setDeleteMealId(null);showAppToast('В Meal Plan должно остаться минимум 2 приёма пищи.','warning');return}
    const removed=meals.find(m=>m.local_id===deleteMealId)
    const next=redistribute(meals.filter(m=>m.local_id!==deleteMealId),budget)
    setMeals(next)
    setSelected(current=>{
      const copy={...current};delete copy[deleteMealId];return copy
    })
    if(openMealId===deleteMealId)setOpenMealId(next[0]?.local_id??'')
    setDeleteMealId(null)
    showAppToast((removed?.name??'Приём пищи')+' удалён из новой версии плана.','info')
  }
  function patchMeal(id:string,patch:Partial<NutritionMealDraft>){setMeals(list=>list.map(m=>m.local_id===id?{...m,...patch}:m))}
  function patchVariant(mealId:string,variantId:string,patch:Partial<NutritionMealVariantDraft>){
    setMeals(list=>list.map(m=>m.local_id===mealId?{...m,variants:m.variants.map(v=>v.local_id===variantId?{...v,...patch}:v)}:m))
  }
  function patchItem(mealId:string,variantId:string,itemId:string,patch:Partial<NutritionMealItemDraft>){
    setMeals(list=>list.map(m=>m.local_id!==mealId?m:{...m,variants:m.variants.map(v=>v.local_id!==variantId?v:{...v,items:v.items.map(i=>i.local_id===itemId?{...i,...patch}:i)})}))
  }
  function removeItem(mealId:string,variantId:string,itemId:string){
    setMeals(list=>list.map(m=>m.local_id!==mealId?m:{...m,variants:m.variants.map(v=>v.local_id!==variantId?v:{...v,items:v.items.filter(i=>i.local_id!==itemId)})}))
  }
  function addFood(mealId:string,variantId:string,food:NutritionFood){
    const isSame=(item:NutritionMealItemDraft)=>food.source==='personal'
      ? item.client_food_id===food.id
      : item.food_id===food.id
    const alreadyExists=meals.some(m=>m.local_id===mealId&&m.variants.some(v=>v.local_id===variantId&&v.items.some(isSame)))
    if(alreadyExists){
      showAppToast('Этот продукт уже есть в наборе — измени его граммовку.','info')
      return
    }
    setMeals(list=>list.map(m=>m.local_id!==mealId?m:{...m,variants:m.variants.map(v=>{
      if(v.local_id!==variantId)return v
      if(v.items.some(isSame))return v
      return {...v,items:[...v.items,itemFromFood(food)]}
    })}))
  }
  function catalogFoodForItem(item:NutritionMealItemDraft){
    if(item.food_id)return foods.find(f=>f.source!=='personal'&&f.id===item.food_id)??null
    if(item.client_food_id)return foods.find(f=>f.source==='personal'&&f.id===item.client_food_id)??null
    const matches=foods.filter(f=>f.name===item.name||f.base_name===item.name)
    return matches.length===1?matches[0]:null
  }
  function openFoodEditor(item:NutritionMealItemDraft){
    const food=catalogFoodForItem(item)
    if(!food){showAppToast('Для этого старого снимка продукта нет связанной карточки справочника.','info');return}
    setEditingFood(food)
  }
  function applyFoodChange(updated:NutritionFood){
    const current=foods.find(food=>food.id===updated.id&&food.source===updated.source)
    const detailsChanged=!current
      || current.name!==updated.name
      || current.kcal_100!==updated.kcal_100
      || current.protein_100!==updated.protein_100
      || current.fat_100!==updated.fat_100
      || current.carbs_100!==updated.carbs_100
      || current.default_portion_g!==updated.default_portion_g

    setFoods(list=>list.map(food=>food.id===updated.id&&food.source===updated.source?updated:food))
    if(!detailsChanged)return

    setMeals(list=>list.map(meal=>({...meal,variants:meal.variants.map(variant=>({...variant,items:variant.items.map(item=>{
      const same=updated.source==='personal'
        ? item.client_food_id===updated.id
        : item.food_id===updated.id
      return same?{...item,name:updated.name,kcal_100:updated.kcal_100,protein_100:updated.protein_100,fat_100:updated.fat_100,carbs_100:updated.carbs_100}:item
    })}))})))
  }
  function addSavedVariant(mealId:string,savedId:string){
    const preset=saved.find(x=>x.id===savedId)
    if(!preset)return
    const variant=variantFromSaved(preset)
    setMeals(list=>list.map(m=>m.local_id===mealId?{...m,variants:[...m.variants,variant]}:m))
    setSelected(s=>({...s,[mealId]:variant.local_id}))
  }
  async function saveVariantPreset(meal:NutritionMealDraft,variant:NutritionMealVariantDraft){
    if(libraryBusy||!variant.items.length)return
    setLibraryBusy(true);setNotice('')
    try{
      if(!preview){
        const name=variant.name.trim()||meal.name
        const id=await saveMealPreset(name,meal.meal_type,variant.items)
        const preset:SavedMeal={id,name,meal_type:meal.meal_type,notes:null,items:variant.items.map(item=>({...item,local_id:item.local_id||uid()}))}
        setSaved(current=>[...current.filter(item=>item.id!==id),preset])
      }
      setNotice('Набор сохранён в личную библиотеку.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить набор')}
    finally{setLibraryBusy(false)}
  }
  async function save(){
    if(saving)return
    const zeroGramItem=meals.flatMap(m=>m.variants.flatMap(v=>v.items)).find(item=>item.grams<=0)
    if(zeroGramItem){setNotice('У продукта «'+zeroGramItem.name+'» указано 0 г. Укажи граммовку или удали продукт из набора.');return}
    if(allocated!==budget){setNotice('Распредели ровно '+budget+' ккал по приёмам. Сейчас '+allocated+'.');return}
    if(meals.some(m=>!m.variants.length||m.variants.some(v=>!v.items.length))){setNotice('В каждом наборе должен быть хотя бы один продукт.');return}
    setSaving(true);setNotice('')
    try{
      if(preview){
        const next={...plan,free_kcal_target:free,meals:meals.map(m=>({
          id:m.local_id,name:m.name,meal_type:m.meal_type,kcal_target:m.kcal_target,target_locked:m.target_locked,notes:m.notes,
          variants:m.variants.map(v=>({id:v.local_id,name:v.name,is_default:v.is_default,notes:v.notes,items:v.items.map(i=>({id:i.local_id,...i}))}))
        }))}
        onSaved(next as ActiveNutritionPlan);onClose();return
      }
      await saveMyMealPlanVersion(plan.id,free,meals)
      setBaseline(snapshot(free,meals))
      try{
        const fresh=await reloadPlan()
        if(fresh){
          onSaved(fresh)
          onClose()
          return
        }
      }catch{}
      setNotice('Новая версия Meal Plan сохранена, но экран не удалось обновить. Повторно сохранять не нужно — закрой редактор и обнови страницу.')
    }catch(e){
      if(!preview){
        try{
          const fresh=await reloadPlan()
          if(fresh&&fresh.id!==plan.id&&fresh.version>plan.version){
            setBaseline(snapshot(free,meals))
            onSaved(fresh)
            showAppToast('Новая версия уже была сохранена на сервере.','info')
            onClose()
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось сохранить Meal Plan')
    }
    finally{setSaving(false)}
  }

  return <section className="panel client-meal-plan-editor">
    <UnsavedChangesGuard when={!preview&&dirty}/>
    <div className="panel-head">
      <div><span className="eyebrow">Редактор Meal Plan</span><h3>Настрой план под себя</h3></div>
      <button className="icon-button" onClick={requestClose}><X size={17}/></button>
    </div>

    <div className="free-kcal-editor">
      <div><strong>Свободный приём</strong><span>Оставляем место для еды вне основных наборов.</span></div>
      <strong>{free} ккал</strong>
      <input type="range" min="200" max="300" step="10" value={free} onChange={e=>setFreeTarget(Number(e.target.value))}/>
      <small>Можно менять от 200 до 300 ккал. В основные приёмы сейчас распределяется {budget} ккал.</small>
    </div>

    <div className="client-meal-edit-list">
      {meals.map(meal=>{
        const variant=meal.variants.find(v=>v.local_id===selected[meal.local_id])??meal.variants[0]
        const actual=variant?Math.round(variantKcal(variant)):0
        const fixedKcal=variant?Math.round(variant.items.filter(i=>i.is_fixed).reduce((s,i)=>s+kcal(i),0)):0
        const expanded=openMealId===meal.local_id
        return <article className={'client-meal-edit-card '+(expanded?'is-open':'is-collapsed')} key={meal.local_id}>
          <button type="button" className="meal-accordion-toggle" aria-expanded={expanded} onClick={()=>setOpenMealId(expanded?'':meal.local_id)}>
            <div>
              <strong>{meal.name}</strong>
              <small>{meal.kcal_target} ккал{variant?' · '+variant.name:''}{meal.target_locked?' · закреплено':''}</small>
            </div>
            <ChevronDown size={18}/>
          </button>

          {expanded&&<div className="meal-accordion-body">
          <div className="client-meal-edit-head">
            <div><input className="meal-title-input" value={meal.name} onChange={e=>patchMeal(meal.local_id,{name:e.target.value})}/><small>≈ {actual} ккал по продуктам</small></div>
            <div className="meal-head-actions">
              <button className={'icon-button '+(meal.target_locked?'is-active':'')} title={meal.target_locked?'Калорийность закреплена':'Закрепить калорийность'} onClick={()=>patchMeal(meal.local_id,{target_locked:!meal.target_locked})}>{meal.target_locked?<Lock size={15}/>:<Unlock size={15}/>}</button>
              <button className="icon-button danger" disabled={meals.length<=2} title={meals.length<=2?'Минимум 2 приёма пищи':'Удалить приём'} onClick={()=>setDeleteMealId(meal.local_id)}><Trash2 size={15}/></button>
            </div>
          </div>

          <div className="meal-target-control">
            <input type="range" min="100" max={Math.max(300,budget)} step="10" value={meal.kcal_target} onChange={e=>setMealTarget(meal.local_id,Number(e.target.value))}/>
            <label><input type="number" min="0" step="10" value={meal.kcal_target} onChange={e=>setMealTarget(meal.local_id,Number(e.target.value)||0)}/><span>ккал</span></label>
          </div>

          {meal.target_locked&&<small className="locked-hint">Этот приём не меняется, когда перераспределяешь калории в других.</small>}

          <div className="meal-variant-controls">
            <label><span>Набор</span><select value={variant?.local_id??''} onChange={e=>setSelected(s=>({...s,[meal.local_id]:e.target.value}))}>{meal.variants.map(v=><option value={v.local_id} key={v.local_id}>{v.name}</option>)}</select></label>
            {saved.length>0&&<label><span>Добавить сохранённый</span><select defaultValue="" onChange={e=>{if(e.target.value){addSavedVariant(meal.local_id,e.target.value);e.target.value=''}}}><option value="">Выбрать набор…</option>{saved.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>}
          </div>

          {variant&&<>
            <div className="variant-name-row">
              <input value={variant.name} onChange={e=>patchVariant(meal.local_id,variant.local_id,{name:e.target.value})} placeholder="Например: Завтрак 1"/>
              <button className="text-button" disabled={libraryBusy||!variant.items.length} onClick={()=>void saveVariantPreset(meal,variant)}><Save size={13}/>Сохранить как набор</button>
            </div>

            <div className="client-meal-item-editor">
              {variant.items.map(item=><div key={item.local_id}>
                <button type="button" className="meal-item-food-button" onClick={()=>openFoodEditor(item)}><strong>{item.name}</strong><small>{Math.round(item.kcal_100)} ккал / 100 г</small></button>
                <label><input type="number" min="0" max="10000" step="5" value={item.grams>0?Math.round(item.grams):''} onChange={e=>patchItem(meal.local_id,variant.local_id,item.local_id,{grams:e.target.value===''?0:Math.max(0,Number(e.target.value)||0)})}/><span>г</span></label>
                <button className={'icon-button '+(item.is_fixed?'is-active':'')} title={item.is_fixed?'Порция закреплена':'Закрепить порцию'} onClick={()=>patchItem(meal.local_id,variant.local_id,item.local_id,{is_fixed:!item.is_fixed})}>{item.is_fixed?<Lock size={15}/>:<Unlock size={15}/>}</button>
                <button className="icon-button danger" title="Убрать продукт" onClick={()=>removeItem(meal.local_id,variant.local_id,item.local_id)}><Trash2 size={14}/></button>
              </div>)}
            </div>
            {fixedKcal>meal.kcal_target&&<div className="settings-inline-notice">Закреплённые продукты уже дают ≈ {fixedKcal} ккал — больше цели этого приёма.</div>}
            {foods.length>0&&<FoodCombobox foods={foods} onSelect={food=>addFood(meal.local_id,variant.local_id,food)} placeholder="Добавить продукт в этот набор…"/>}
          </>}
          </div>}
        </article>
      })}
      <button className="add-meal-button" disabled={meals.length>=5} onClick={()=>setAddMealOpen(true)}><Plus size={16}/>{meals.length>=5?'Максимум 5 приёмов':'Добавить приём пищи'}</button>
    </div>

    <div className="client-meal-editor-summary">
      <span>Основные приёмы: <strong>{allocated} / {budget} ккал</strong></span>
      <span>Свободно: <strong>{free} ккал</strong></span>
      <span>Всего: <strong>{allocated+free} / {plan.daily_kcal_target} ккал</strong></span>
    </div>

    {notice&&<div className="settings-inline-notice">{notice}</div>}
    <div className="client-meal-editor-actions">
      <button className="ghost-button" disabled={saving} onClick={requestClose}>Отмена</button>
      <button className="primary-button compact" disabled={saving||allocated!==budget} onClick={()=>void save()}><Save size={15}/>{saving?'Сохраняю…':'Сохранить новую версию'}</button>
    </div>

    {editingFood&&<FoodPersonalizationSheet
      food={editingFood}
      preview={preview}
      onClose={()=>setEditingFood(null)}
      onChanged={applyFoodChange}
    />}

    {addMealOpen&&<div className="drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setAddMealOpen(false)}}>
      <aside className="exercise-drawer workout-sheet finish-workout-sheet">
        <div className="drawer-head"><div><span className="eyebrow">Meal Plan</span><h3>Добавить приём пищи</h3></div><button className="icon-button" onClick={()=>setAddMealOpen(false)}><X size={17}/></button></div>
        <div className="drawer-body">
          <p className="sheet-description">Выбери тип. Калории перераспределятся по незакреплённым приёмам автоматически.</p>
          <div className="meal-add-options">
            <button className="choice-card" onClick={()=>addMeal('main')}><strong>Основной приём</strong><span>Завтрак, обед или ужин</span></button>
            <button className="choice-card" onClick={()=>addMeal('snack')}><strong>Перекус</strong><span>Небольшой дополнительный приём</span></button>
          </div>
        </div>
      </aside>
    </div>}

    {deleteMealId&&<div className="drawer-backdrop">
      <aside className="exercise-drawer workout-sheet finish-workout-sheet">
        <div className="drawer-head"><div><span className="eyebrow">Meal Plan</span><h3>Удалить приём пищи?</h3></div></div>
        <div className="drawer-body">
          <p className="sheet-description">После сохранения новой версии вернуть удалённый приём одной кнопкой не получится — его нужно будет добавить заново.</p>
          <div className="finish-workout-actions">
            <button className="ghost-button" onClick={()=>setDeleteMealId(null)}>Оставить</button>
            <button className="primary-button" onClick={confirmDeleteMeal}>Удалить приём</button>
          </div>
        </div>
      </aside>
    </div>}

    {closeConfirm&&<div className="drawer-backdrop">
      <aside className="exercise-drawer workout-sheet finish-workout-sheet">
        <div className="drawer-head"><div><span className="eyebrow">Meal Plan</span><h3>Отменить несохранённые изменения?</h3></div></div>
        <div className="drawer-body">
          <p className="sheet-description">Изменения калорийности, наборов и порций ещё не сохранены.</p>
          <div className="finish-workout-actions">
            <button className="ghost-button" onClick={()=>setCloseConfirm(false)}>Остаться</button>
            <button className="primary-button" onClick={onClose}>Уйти без сохранения</button>
          </div>
        </div>
      </aside>
    </div>}
  </section>
}
