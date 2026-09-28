
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, Save, Utensils } from 'lucide-react'
import { loadActiveNutritionPlan, loadTodayNutritionCheckin, saveTodayNutritionCheckin, loadMyNutritionSetup, saveMyNutritionSetup } from '../features/nutrition/service'
import type { ActiveNutritionPlan, NutritionDailyCheckin } from '../features/nutrition/types'
import { PersonalMealLibrary } from '../components/PersonalMealLibrary'
import { CoachHint } from '../components/CoachHint'
import { supabase } from '../lib/supabase'

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
  const [dayMode,setDayMode]=useState<'plan'|'deviation'|'manual'|null>(null)
  const [deviation,setDeviation]=useState<NutritionDailyCheckin['nutrition_deviation']>(null)
  const [actualCalories,setActualCalories]=useState('')
  const [actualProtein,setActualProtein]=useState('')
  const [showActual,setShowActual]=useState(false)
  const [savingCheckin,setSavingCheckin]=useState(false)
  const [setup,setSetup]=useState<any>(null)
  const [setupOpen,setSetupOpen]=useState(false)
  const [setupForm,setSetupForm]=useState({sex:'male' as 'male'|'female',height:'',steps:'',trainingDays:'3',goal:'maintain' as 'lose'|'maintain'|'gain'})
  const [builderOpen,setBuilderOpen]=useState(false)
  const [mealCount,setMealCount]=useState(3)
  const [foods,setFoods]=useState<any[]>([])
  const [chosenFoods,setChosenFoods]=useState<string[]>([])

  useEffect(()=>{
    if(preview)return
    Promise.all([loadActiveNutritionPlan(),loadTodayNutritionCheckin(),loadMyNutritionSetup()])
      .then(([activePlan,today,nutritionSetup])=>{
        setSetup(nutritionSetup)
        if(nutritionSetup)setSetupForm({sex:nutritionSetup.sex_for_calculation,height:String(nutritionSetup.height_cm),steps:String(nutritionSetup.average_steps),trainingDays:String(nutritionSetup.training_days_per_week),goal:nutritionSetup.goal})
        setPlan(activePlan)
        setCheckin(today)
        if(today){
          setAdherence(today.nutrition_adherence)
          setDayMode(today.nutrition_mode==='manual'?'manual':today.nutrition_adherence==='followed'?'plan':'deviation')
          setDeviation(today.nutrition_deviation)
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
    const mode: 'meal_plan'|'manual'=(!plan || dayMode==='manual')?'manual':'meal_plan'
    if(plan && !dayMode){setNotice('Выбери, как сегодня питался.');return}
    if(!plan && actualCalories.trim()===''){setNotice('Пока Meal Plan не назначен, укажи калории за день.');return}
    const effectiveAdherence:NutritionDailyCheckin['nutrition_adherence']=dayMode==='plan'?'followed':dayMode==='deviation'?'partial':null
    if(dayMode==='deviation' && !deviation){setNotice('Укажи, как получилось относительно цели.');return}
    const calories=actualCalories.trim()===''?null:Number(actualCalories)
    const protein=actualProtein.trim()===''?null:Number(actualProtein)
    setSavingCheckin(true);setNotice('')
    try{
      if(!preview) await saveTodayNutritionCheckin({
        mode,adherence:mode==='meal_plan'?effectiveAdherence:null,
        deviation,
        calories:Number.isFinite(calories as number)?calories:null,
        protein_g:Number.isFinite(protein as number)?protein:null,
        plan_id:plan?.id??null,
      })
      setCheckin({
        id:checkin?.id??'preview',checkin_date:new Date().toISOString().slice(0,10),
        nutrition_mode:mode,nutrition_adherence:mode==='meal_plan'?effectiveAdherence:null,
        nutrition_deviation:deviation,
        calories:Number.isFinite(calories as number)?calories:null,
        protein_g:Number.isFinite(protein as number)?protein:null,
        nutrition_plan_id:plan?.id??null,
      })
      setNotice('Питание за сегодня сохранено.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить')}
    finally{setSavingCheckin(false)}
  }

  async function calculateTarget(){
    const height=Number(setupForm.height),steps=Number(setupForm.steps),trainingDays=Number(setupForm.trainingDays)
    if(!height||setupForm.steps.trim()===''){setNotice('Заполни рост и среднее число шагов.');return}
    setSavingCheckin(true);setNotice('')
    try{
      const result=await saveMyNutritionSetup({sex:setupForm.sex,height,steps,trainingDays,goal:setupForm.goal})
      if(result){setSetup({...setupForm,height_cm:height,average_steps:steps,training_days_per_week:trainingDays,estimated_maintenance_kcal:result.maintenance_kcal,target_kcal:result.target_kcal});setSetupOpen(false);setNotice('Стартовая калорийность рассчитана. Её будем уточнять по динамике веса.')}
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось рассчитать калорийность')}
    finally{setSavingCheckin(false)}
  }

  async function openSelfBuilder(){
    setBuilderOpen(true)
    if(foods.length||preview||!supabase)return
    const {data,error}=await supabase.from('foods').select('id,name,kcal_100,protein_100,fat_100,carbs_100,weighing_method,food_group,popularity_rank').eq('is_active',true).order('popularity_rank').order('name')
    if(error){setNotice('Не удалось загрузить продукты.');return}
    const list=data??[];setFoods(list)
    const {data:prefs}=await supabase.from('client_food_preferences').select('food_id').eq('selected',true)
    setChosenFoods((prefs??[]).map((x:any)=>x.food_id))
  }
  async function toggleFood(foodId:string){
    const on=!chosenFoods.includes(foodId)
    setChosenFoods(v=>on?[...v,foodId]:v.filter(id=>id!==foodId))
    if(!preview&&supabase){
      if(on)await supabase.from('client_food_preferences').upsert({client_id:(await supabase.auth.getUser()).data.user?.id,food_id:foodId,selected:true,updated_at:new Date().toISOString()})
      else await supabase.from('client_food_preferences').delete().eq('food_id',foodId).eq('client_id',(await supabase.auth.getUser()).data.user?.id)
    }
  }

  if(loading)return <div className="library-empty">Загружаю питание…</div>

  return <div className="page-stack client-nutrition-page">
    <section className="nutrition-checkin-card">
      <div className="nutrition-checkin-copy">
        <span className="eyebrow">Сегодня</span>
        <h3>{plan?'Как сегодня питался?':'Что получилось по питанию?'}</h3>
        <p>{plan?'План остаётся ориентиром. Выбери способ отчёта за сегодня — пересчитывать рацион каждый день не нужно.':'Если считаешь питание самостоятельно, достаточно указать ккал и белок.'}</p>
      </div>

      {plan ? <div className="adherence-buttons nutrition-mode-buttons">
        {[
          ['plan','По плану'],
          ['deviation','С отклонениями'],
          ['manual','Считал калории'],
        ].map(([value,label])=><button key={value} className={dayMode===value?'is-active':''} onClick={()=>{
          const next=value as 'plan'|'deviation'|'manual'
          setDayMode(next)
          if(next==='plan'){setAdherence('followed');setDeviation('about_target');setShowActual(false)}
          else if(next==='deviation'){setAdherence('partial');setDeviation(null);setShowActual(false)}
          else {setAdherence(null);setDeviation(null);setShowActual(true)}
        }}>{label}</button>)}
      </div> : null}

      {plan && dayMode==='deviation' && <div className="nutrition-deviation-block">
        <span>По калориям получилось</span>
        <div className="nutrition-deviation-buttons">
          {[
            ['about_target','Примерно в цель'],
            ['over','Больше цели'],
            ['under','Меньше цели'],
            ['unknown','Не знаю'],
          ].map(([value,label])=><button key={value} className={deviation===value?'is-active':''} onClick={()=>{
            setDeviation(value as NutritionDailyCheckin['nutrition_deviation'])
          }}>{label}</button>)}
        </div>
        {!showActual && <button className="text-button" onClick={()=>setShowActual(true)}>Знаю цифры — указать ккал и белок</button>}
      </div>}

      {(!plan || dayMode==='manual' || showActual) && <div className="nutrition-actual-fields">
        <label><span>Ккал{!plan?' *':''}</span><input className={!plan?'is-required':''} type="number" min="0" step="10" value={actualCalories} onChange={e=>setActualCalories(e.target.value)} placeholder={plan?'необязательно':'обязательно'}/></label>
        <label><span>Белок, г</span><input type="number" min="0" step="1" value={actualProtein} onChange={e=>setActualProtein(e.target.value)} placeholder="необязательно"/></label>
      </div>}

      <div className="nutrition-checkin-actions">

        <button className="primary-button compact" disabled={savingCheckin} onClick={()=>void saveCheckin()}><Save size={14}/>{checkin?'Обновить':'Сохранить'}</button>
      </div>
    </section>

    {!plan ? <>
      <section className="panel nutrition-self-start">
        <div className="panel-head"><div><span className="eyebrow">Meal Plan</span><h3>{setup?'Твоя стартовая цель — '+setup.target_kcal+' ккал':'Сначала рассчитаем стартовую калорийность'}</h3></div></div>
        <p className="panel-description">{setup?'Это стартовый ориентир, а не вечная цифра. Дальше её можно корректировать по динамике веса.':'Нужны последний вес из «Прогресса», возраст, рост и обычная активность. После расчёта сможешь собрать Meal Plan из привычных продуктов.'}</p>
        {!setupOpen&&<button className="primary-button compact" onClick={()=>setSetupOpen(true)}>{setup?'Изменить расчёт':'Рассчитать мою норму'}</button>}
        {setupOpen&&<div className="nutrition-setup-form">
          <label>Пол для расчёта<select value={setupForm.sex} onChange={e=>setSetupForm(v=>({...v,sex:e.target.value as 'male'|'female'}))}><option value="male">Мужской</option><option value="female">Женский</option></select></label>
          <label>Рост, см<input inputMode="decimal" value={setupForm.height} onChange={e=>setSetupForm(v=>({...v,height:e.target.value}))} placeholder="Например, 175"/></label>
          <label>Шагов в среднем / день<input inputMode="numeric" value={setupForm.steps} onChange={e=>setSetupForm(v=>({...v,steps:e.target.value}))} placeholder="Например, 7000"/></label>
          <label>Тренировок / неделю<input type="number" min="0" max="14" value={setupForm.trainingDays} onChange={e=>setSetupForm(v=>({...v,trainingDays:e.target.value}))}/></label>
          <label>Цель<select value={setupForm.goal} onChange={e=>setSetupForm(v=>({...v,goal:e.target.value as 'lose'|'maintain'|'gain'}))}><option value="lose">Снижение веса</option><option value="maintain">Поддержание</option><option value="gain">Набор</option></select></label>
          <div className="nutrition-setup-actions"><button className="ghost-button" onClick={()=>setSetupOpen(false)}>Отмена</button><button className="primary-button compact" disabled={savingCheckin} onClick={()=>void calculateTarget()}>Рассчитать</button></div>
        </div>}
        {setup&&<div className="nutrition-start-actions"><button className="primary-button compact" onClick={()=>void openSelfBuilder()}>Собрать свой Meal Plan</button></div>}
      </section>
{setup&&builderOpen&&<section className="panel self-meal-builder">
        <span className="eyebrow">Шаг 1</span><h3>Как тебе удобно питаться?</h3>
        <p className="panel-description">Выбери число приёмов пищи. Дальше распределим между ними твою цель {setup.target_kcal} ккал.</p>
        <div className="meal-count-picker">{[2,3,4,5].map(n=><button key={n} className={mealCount===n?'is-active':''} onClick={()=>setMealCount(n)}>{n}</button>)}</div>
        <span className="eyebrow self-food-step">Шаг 2</span><h3>Что ты обычно ешь?</h3>
        <p className="panel-description">Отметь привычные продукты. Они будут первыми в твоём конструкторе. Позже можно добавить любой другой.</p>
        {[
          ['protein','Белок'],['carb','Гарниры'],['vegetable','Овощи'],['fruit','Фрукты'],['fat','Жиры'],['other','Другое']
        ].map(([key,label])=>{const group=foods.filter(f=>f.food_group===key);if(!group.length)return null;return <div className="self-food-group" key={key}><strong>{label}</strong><div className="self-food-chips">{group.map(f=><button key={f.id} className={chosenFoods.includes(f.id)?'is-selected':''} onClick={()=>void toggleFood(f.id)}><span>{f.name}</span><small>{Math.round(Number(f.kcal_100))} ккал</small></button>)}</div></div>})}
        <div className="self-builder-summary"><span>{mealCount} приёма пищи · выбрано продуктов: {chosenFoods.length}</span><button className="primary-button compact" disabled={!chosenFoods.length} onClick={()=>setNotice('Продукты сохранены. Следующим шагом соберём первый вариант приёма и автоматически рассчитаем граммовки.')}>Продолжить</button></div>
      </section>}
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
      {plan.notes&&<CoachHint storageKey={'nutrition:'+plan.id} text={plan.notes} title="Комментарий тренера"/>}
      <PersonalMealLibrary preview={preview}/>
      {notice&&<div className="drawer-notice">{notice}</div>}
    </>}
  </div>
}
