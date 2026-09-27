
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, Save, Utensils } from 'lucide-react'
import { loadActiveNutritionPlan, loadTodayNutritionCheckin, saveTodayNutritionCheckin } from '../features/nutrition/service'
import type { ActiveNutritionPlan, NutritionDailyCheckin } from '../features/nutrition/types'
import { PersonalMealLibrary } from '../components/PersonalMealLibrary'

type Props={preview:boolean}

const previewPlan:ActiveNutritionPlan={
  id:'preview',name:'Базовый рацион',description:'Два плотных основных приёма пищи и лёгкий ужин.',
  daily_kcal_target:2300,protein_target_g:150,fat_target_g:null,carbs_target_g:null,notes:null,version:1,
  meals:[
    {id:'m1',name:'Завтрак',meal_type:'main',kcal_target:650,notes:'Можно чередовать два привычных варианта.',variants:[
      {id:'v1',name:'Яйца + овсянка + творог',is_default:true,notes:null,items:[
        {id:'i1',name:'Яйца куриные',grams:150,kcal_100:143,protein_100:12.6,fat_100:9.5,carbs_100:.7,is_fixed:true},
        {id:'i2',name:'Овсяные хлопья',grams:75,kcal_100:370,protein_100:13,fat_100:7,carbs_100:62,is_fixed:false},
        {id:'i3',name:'Творог 5%',grams:100,kcal_100:145,protein_100:17,fat_100:5,carbs_100:3,is_fixed:false},
      ]},
      {id:'v2',name:'Овсянка + творог + банан',is_default:false,notes:null,items:[
        {id:'i4',name:'Овсяные хлопья',grams:90,kcal_100:370,protein_100:13,fat_100:7,carbs_100:62,is_fixed:false},
        {id:'i5',name:'Творог 5%',grams:200,kcal_100:145,protein_100:17,fat_100:5,carbs_100:3,is_fixed:false},
        {id:'i6',name:'Банан',grams:120,kcal_100:89,protein_100:1.1,fat_100:.3,carbs_100:23,is_fixed:false},
      ]},
    ]},
    {id:'m2',name:'Обед',meal_type:'main',kcal_target:1100,notes:null,variants:[
      {id:'v3',name:'Курица + гречка + овощи',is_default:true,notes:null,items:[
        {id:'i7',name:'Куриное филе',grams:250,kcal_100:165,protein_100:31,fat_100:3.6,carbs_100:0,is_fixed:true},
        {id:'i8',name:'Гречка сухая',grams:120,kcal_100:343,protein_100:13,fat_100:3.4,carbs_100:72,is_fixed:false},
        {id:'i9',name:'Овощи / салат',grams:300,kcal_100:25,protein_100:1.2,fat_100:.2,carbs_100:4.5,is_fixed:true},
        {id:'i10',name:'Оливковое масло',grams:15,kcal_100:900,protein_100:0,fat_100:100,carbs_100:0,is_fixed:false},
      ]},
    ]},
    {id:'m3',name:'Лёгкий ужин',meal_type:'light',kcal_target:550,notes:'Лёгкий объёмный приём пищи.',variants:[
      {id:'v4',name:'Салат + творог',is_default:true,notes:null,items:[
        {id:'i11',name:'Овощи / салат',grams:350,kcal_100:25,protein_100:1.2,fat_100:.2,carbs_100:4.5,is_fixed:true},
        {id:'i12',name:'Творог 5%',grams:260,kcal_100:145,protein_100:17,fat_100:5,carbs_100:3,is_fixed:false},
        {id:'i13',name:'Оливковое масло',grams:10,kcal_100:900,protein_100:0,fat_100:100,carbs_100:0,is_fixed:false},
      ]},
    ]},
  ],
}

function totals(items:ActiveNutritionPlan['meals'][number]['variants'][number]['items']){
  return items.reduce((s,i)=>{
    const f=i.grams/100
    return {kcal:s.kcal+i.kcal_100*f,protein:s.protein+i.protein_100*f,fat:s.fat+i.fat_100*f,carbs:s.carbs+i.carbs_100*f}
  },{kcal:0,protein:0,fat:0,carbs:0})
}

export function NutritionPage({preview}:Props){
  const [plan,setPlan]=useState<ActiveNutritionPlan|null>(preview?previewPlan:null)
  const [loading,setLoading]=useState(!preview)
  const [notice,setNotice]=useState('')
  const [selected,setSelected]=useState<Record<string,string>>({})
  const [checkin,setCheckin]=useState<NutritionDailyCheckin|null>(null)
  const [adherence,setAdherence]=useState<NutritionDailyCheckin['nutrition_adherence']>(null)
  const [actualCalories,setActualCalories]=useState('')
  const [actualProtein,setActualProtein]=useState('')
  const [showActual,setShowActual]=useState(false)
  const [savingCheckin,setSavingCheckin]=useState(false)

  useEffect(()=>{
    if(preview)return
    Promise.all([loadActiveNutritionPlan(),loadTodayNutritionCheckin()])
      .then(([activePlan,today])=>{
        setPlan(activePlan)
        setCheckin(today)
        if(today){
          setAdherence(today.nutrition_adherence)
          setActualCalories(today.calories==null?'':String(today.calories))
          setActualProtein(today.protein_g==null?'':String(today.protein_g))
          setShowActual(today.calories!=null || today.protein_g!=null)
        }
      })
      .catch(e=>setNotice(e instanceof Error?e.message:'Не удалось загрузить питание'))
      .finally(()=>setLoading(false))
  },[preview])

  const day=useMemo(()=>{
    if(!plan)return {kcal:0,protein:0,fat:0,carbs:0}
    return plan.meals.reduce((sum,meal)=>{
      const chosen=meal.variants.find(v=>v.id===selected[meal.id]) ?? meal.variants.find(v=>v.is_default) ?? meal.variants[0]
      if(!chosen)return sum
      const t=totals(chosen.items)
      return {kcal:sum.kcal+t.kcal,protein:sum.protein+t.protein,fat:sum.fat+t.fat,carbs:sum.carbs+t.carbs}
    },{kcal:0,protein:0,fat:0,carbs:0})
  },[plan,selected])

  async function saveCheckin(){
    const mode: 'meal_plan'|'manual'=plan?'meal_plan':'manual'
    if(mode==='meal_plan' && !adherence){setNotice('Выбери, насколько сегодня соблюдён план.');return}
    const calories=actualCalories.trim()===''?null:Number(actualCalories)
    const protein=actualProtein.trim()===''?null:Number(actualProtein)
    setSavingCheckin(true);setNotice('')
    try{
      if(!preview) await saveTodayNutritionCheckin({
        mode,adherence:mode==='meal_plan'?adherence:null,
        calories:Number.isFinite(calories as number)?calories:null,
        protein_g:Number.isFinite(protein as number)?protein:null,
        plan_id:plan?.id??null,
      })
      setCheckin({
        id:checkin?.id??'preview',checkin_date:new Date().toISOString().slice(0,10),
        nutrition_mode:mode,nutrition_adherence:mode==='meal_plan'?adherence:null,
        calories:Number.isFinite(calories as number)?calories:null,
        protein_g:Number.isFinite(protein as number)?protein:null,
        nutrition_plan_id:plan?.id??null,
      })
      setNotice('Питание за сегодня сохранено.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить')}
    finally{setSavingCheckin(false)}
  }

  if(loading)return <div className="library-empty">Загружаю питание…</div>

  return <div className="page-stack client-nutrition-page">
    <section className="nutrition-checkin-card">
      <div className="nutrition-checkin-copy">
        <span className="eyebrow">Сегодня</span>
        <h3>{plan?'Удалось придерживаться плана питания?':'Что получилось по питанию?'}</h3>
        <p>{plan?'Не нужно пересчитывать рацион заново. Просто отметь соблюдение; фактические ккал и белок добавляй только если считал.':'Если считаешь питание самостоятельно, достаточно указать ккал и белок.'}</p>
      </div>

      {plan ? <div className="adherence-buttons">
        {[
          ['followed','Соблюдён'],
          ['partial','Частично'],
          ['not_followed','Не соблюдён'],
        ].map(([value,label])=><button key={value} className={adherence===value?'is-active':''} onClick={()=>{
          setAdherence(value as NutritionDailyCheckin['nutrition_adherence'])
          if(value!=='followed')setShowActual(true)
        }}>{label}</button>)}
      </div> : null}

      {(!plan || showActual) && <div className="nutrition-actual-fields">
        <label><span>Ккал</span><input type="number" min="0" step="10" value={actualCalories} onChange={e=>setActualCalories(e.target.value)} placeholder="необязательно"/></label>
        <label><span>Белок, г</span><input type="number" min="0" step="1" value={actualProtein} onChange={e=>setActualProtein(e.target.value)} placeholder="необязательно"/></label>
      </div>}

      <div className="nutrition-checkin-actions">
        {plan && !showActual && <button className="text-button" onClick={()=>setShowActual(true)}>+ Указать фактические ккал и белок</button>}
        <button className="primary-button compact" disabled={savingCheckin} onClick={()=>void saveCheckin()}><Save size={14}/>{checkin?'Обновить':'Сохранить'}</button>
      </div>
    </section>

    {!plan ? <>
      <section className="section-intro"><div><span className="eyebrow">Меню-план</span><h2>План пока не назначен</h2><p>Можно вести только фактические ккал и белок. Когда тренер опубликует рацион, он появится здесь.</p></div></section>
      {notice&&<div className="drawer-notice">{notice}</div>}
    </> : <>
      <section className="nutrition-client-hero">
        <div><span className="eyebrow light">Меню-план · версия {plan.version}</span><h2>{plan.name}</h2><p>{plan.description||'Ориентир на день — выбирай удобный вариант каждого приёма.'}</p></div>
        <div className="nutrition-client-target"><strong>{plan.daily_kcal_target}</strong><span>ккал / день</span></div>
      </section>

      <section className="nutrition-client-macros">
        <div><span>По выбранным вариантам</span><strong>≈ {Math.round(day.kcal)} ккал</strong></div>
        <div><span>Белок</span><strong>{Math.round(day.protein)}{plan.protein_target_g?' / '+plan.protein_target_g:''} г</strong></div>
        <div><span>Жиры</span><strong>{Math.round(day.fat)} г</strong></div>
        <div><span>Углеводы</span><strong>{Math.round(day.carbs)} г</strong></div>
      </section>

      <div className="client-meal-list">
        {plan.meals.map((meal,index)=>{
          const chosen=meal.variants.find(v=>v.id===selected[meal.id]) ?? meal.variants.find(v=>v.is_default) ?? meal.variants[0]
          const t=chosen?totals(chosen.items):{kcal:0,protein:0,fat:0,carbs:0}
          return <article className="client-meal-card" key={meal.id}>
            <div className="client-meal-head">
              <div className="client-meal-number">{index+1}</div>
              <div><span>{meal.meal_type==='light'?'Лёгкий приём':meal.meal_type==='snack'?'Перекус':'Основной приём'}</span><h3>{meal.name}</h3></div>
              <div className="client-meal-target"><strong>{meal.kcal_target}</strong><small>ккал цель</small></div>
            </div>

            {meal.variants.length>1 && <label className="client-variant-select"><span>Вариант</span><div><select value={chosen?.id??''} onChange={e=>setSelected(s=>({...s,[meal.id]:e.target.value}))}>{meal.variants.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select><ChevronDown size={14}/></div></label>}

            {chosen && <div className="client-meal-body">
              <div className="client-meal-title"><Utensils size={16}/><div><strong>{chosen.name}</strong><span>≈ {Math.round(t.kcal)} ккал · {Math.round(t.protein)} Б / {Math.round(t.fat)} Ж / {Math.round(t.carbs)} У</span></div></div>
              <div className="client-meal-items">{chosen.items.map(i=><div key={i.id}><span>{i.name}</span><strong>{Math.round(i.grams)} г</strong></div>)}</div>
              {(chosen.notes||meal.notes) && <div className="client-meal-note">{chosen.notes||meal.notes}</div>}
            </div>}
            <div className="client-meal-check"><CheckCircle2 size={15}/><span>Это ориентир, а не отчётность: выбирай один вариант приёма.</span></div>
          </article>
        })}
      </div>
      {plan.notes&&<div className="coach-note"><strong>Комментарий тренера</strong><span>{plan.notes}</span></div>}
      <PersonalMealLibrary preview={preview}/>
      {notice&&<div className="drawer-notice">{notice}</div>}
    </>}
  </div>
}
