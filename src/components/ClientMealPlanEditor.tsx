import { useEffect, useMemo, useState } from 'react'
import { Lock, Plus, Save, Trash2, Unlock, X } from 'lucide-react'
import { FoodCombobox } from './FoodCombobox'
import { UnsavedChangesGuard } from './UnsavedChangesGuard'
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
  return {...v,items:v.items.map(i=>i.is_fixed?i:{...i,grams:Math.min(10000,Math.max(1,Math.round(i.grams*factor)))})}
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
  return {local_id:uid(),food_id:food.source==='personal'?null:food.id,name:food.name,
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
      items:v.items.map(i=>({...i,local_id:i.id,food_id:i.food_id??null,notes:i.notes??''})),
    })),
  }))
  const budget=plan.daily_kcal_target-free
  const current=meals.reduce((s,m)=>s+m.kcal_target,0)
  return current===budget?meals:redistribute(meals,budget)
}
function snapshot(free:number,meals:NutritionMealDraft[]){return JSON.stringify({free,meals})}

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
    setMeals(list=>list.map(m=>m.local_id!==mealId?m:{...m,variants:m.variants.map(v=>v.local_id!==variantId?v:{...v,items:[...v.items,itemFromFood(food)]})}))
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
        await saveMealPreset(variant.name.trim()||meal.name,meal.meal_type,variant.items)
        setSaved(await loadSavedMeals())
      }
      setNotice('Набор сохранён в личную библиотеку.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить набор')}
    finally{setLibraryBusy(false)}
  }
  async function save(){
    if(saving)return
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
      const fresh=await reloadPlan()
      if(!fresh)throw new Error('Новая версия сохранена, но не удалось загрузить её.')
      setBaseline(snapshot(free,meals))
      onSaved(fresh)
      onClose()
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить Meal Plan')}
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
        return <article className="client-meal-edit-card" key={meal.local_id}>
          <div className="client-meal-edit-head">
            <div><input className="meal-title-input" value={meal.name} onChange={e=>patchMeal(meal.local_id,{name:e.target.value})}/><small>≈ {actual} ккал по продуктам</small></div>
            <button className={'icon-button '+(meal.target_locked?'is-active':'')} title={meal.target_locked?'Калорийность закреплена':'Закрепить калорийность'} onClick={()=>patchMeal(meal.local_id,{target_locked:!meal.target_locked})}>{meal.target_locked?<Lock size={15}/>:<Unlock size={15}/>}</button>
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
                <div><strong>{item.name}</strong><small>{Math.round(item.kcal_100)} ккал / 100 г</small></div>
                <label><input type="number" min="1" max="10000" step="5" value={Math.round(item.grams)} onChange={e=>patchItem(meal.local_id,variant.local_id,item.local_id,{grams:Math.max(1,Number(e.target.value)||1)})}/><span>г</span></label>
                <button className={'icon-button '+(item.is_fixed?'is-active':'')} title={item.is_fixed?'Порция закреплена':'Закрепить порцию'} onClick={()=>patchItem(meal.local_id,variant.local_id,item.local_id,{is_fixed:!item.is_fixed})}>{item.is_fixed?<Lock size={15}/>:<Unlock size={15}/>}</button>
                <button className="icon-button danger" title="Убрать продукт" onClick={()=>removeItem(meal.local_id,variant.local_id,item.local_id)}><Trash2 size={14}/></button>
              </div>)}
            </div>
            {fixedKcal>meal.kcal_target&&<div className="settings-inline-notice">Закреплённые продукты уже дают ≈ {fixedKcal} ккал — больше цели этого приёма.</div>}
            {foods.length>0&&<FoodCombobox foods={foods} onSelect={food=>addFood(meal.local_id,variant.local_id,food)} placeholder="Добавить продукт в этот набор…"/>}
          </>}
        </article>
      })}
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
