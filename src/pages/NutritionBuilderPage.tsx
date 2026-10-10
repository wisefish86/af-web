
import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronLeft, Copy, Lock, Plus, Save, Scale, Trash2, Unlock, X } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { FoodCombobox } from '../components/FoodCombobox'
import { UnsavedChangesGuard } from '../components/UnsavedChangesGuard'
import {
  createNutritionFood, loadClientFoodCatalog, loadNutritionBuilderReferences, loadNutritionPlanDraft, loadSavedMeals,
  loadTrainerClientNutritionPlans, loadTrainerNutritionTemplates, publishNutritionPlan,
  sameNutritionFoodDetails, savedMealMatchesInput, saveMealPreset, saveNutritionPlan
} from '../features/nutrition/service'
import type {
  NutritionBuilderReferences, NutritionFood, NutritionMealDraft, NutritionMealItemDraft,
  NutritionMealVariantDraft, NutritionPlanDraft, SavedMeal
} from '../features/nutrition/types'
import { showAppToast } from '../lib/toast'
import { distribute, kcal, macros, scaleMeal, scaleVariant, variantTotals } from '../features/nutrition/model'

type Props={preview:boolean}

const FOOD_GROUP_OPTIONS=[
  ['meat','Мясо, птица и яйца'],['fish','Рыба и морепродукты'],['dairy','Молочные продукты'],
  ['plant_protein','Бобовые и растительный белок'],['sports','Спортивное питание'],
  ['carb','Крупы, хлеб и гарниры'],['vegetable','Овощи'],['fruit','Фрукты и ягоды'],
  ['fat','Орехи, семена и жиры'],['treat','Сладости'],['drink','Напитки'],
] as const

function uid(){
  return typeof crypto!=='undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()+Math.random())
}
function n(value:string){const x=Number(value.replace(',','.'));return Number.isFinite(x)?x:0}
function blankVariant(name='Основной вариант'):NutritionMealVariantDraft{
  return {local_id:uid(),name,is_default:true,notes:'',items:[]}
}
function blankMeal(name:string,type:NutritionMealDraft['meal_type'],kcalTarget:number):NutritionMealDraft{
  return {local_id:uid(),name,meal_type:type,kcal_target:kcalTarget,target_locked:false,notes:'',variants:[blankVariant()]}
}
function foodItem(food:NutritionFood):NutritionMealItemDraft{
  return {
    local_id:uid(),food_id:food.source==='personal'?null:food.id,name:food.name,grams:food.default_portion_g??100,
    kcal_100:food.kcal_100,protein_100:food.protein_100,fat_100:food.fat_100,carbs_100:food.carbs_100,
    is_fixed:false,notes:'',
  }
}
const previewFoods:NutritionFood[]=[
  {id:'eggs',name:'Яйца куриные',kcal_100:143,protein_100:12.6,fat_100:9.5,carbs_100:.7,default_portion_g:150},
  {id:'oats',name:'Овсяные хлопья',kcal_100:370,protein_100:13,fat_100:7,carbs_100:62,default_portion_g:70},
  {id:'cottage',name:'Творог 5%',kcal_100:145,protein_100:17,fat_100:5,carbs_100:3,default_portion_g:150},
  {id:'chicken',name:'Куриное филе',kcal_100:165,protein_100:31,fat_100:3.6,carbs_100:0,default_portion_g:250},
  {id:'buckwheat',name:'Гречка сухая',kcal_100:343,protein_100:13,fat_100:3.4,carbs_100:72,default_portion_g:100},
  {id:'veg',name:'Овощи / салат',kcal_100:25,protein_100:1.2,fat_100:.2,carbs_100:4.5,default_portion_g:300},
  {id:'oil',name:'Оливковое масло',kcal_100:900,protein_100:0,fat_100:100,carbs_100:0,default_portion_g:10},
  {id:'banana',name:'Банан',kcal_100:89,protein_100:1.1,fat_100:.3,carbs_100:23,default_portion_g:120},
]
function itemBy(id:string,grams:number,fixed=false){
  const f=previewFoods.find(x=>x.id===id)!
  return {...foodItem(f),food_id:null,grams,is_fixed:fixed}
}
function previewDraft():NutritionPlanDraft{
  return {
    id:null,client_id:'sergey',name:'Базовый рацион',description:'Два плотных основных приёма пищи и лёгкий ужин.',
    daily_kcal_target:2300,protein_target_g:150,fat_target_g:null,carbs_target_g:null,notes:'',
    meals:[
      {...blankMeal('Завтрак','main',650),target_locked:true,variants:[
        {local_id:uid(),name:'Яйца + овсянка + творог',is_default:true,notes:'Стандартный завтрак',items:[itemBy('eggs',150,true),itemBy('oats',75),itemBy('cottage',100)]},
        {local_id:uid(),name:'Овсянка + творог + банан',is_default:false,notes:'Быстрый вариант',items:[itemBy('oats',90),itemBy('cottage',200),itemBy('banana',120)]},
      ]},
      {...blankMeal('Обед','main',1100),variants:[
        {local_id:uid(),name:'Курица + гречка + овощи',is_default:true,notes:'',items:[itemBy('chicken',250,true),itemBy('buckwheat',120),itemBy('veg',300,true),itemBy('oil',15)]},
      ]},
      {...blankMeal('Лёгкий ужин','light',550),variants:[
        {local_id:uid(),name:'Салат + творог',is_default:true,notes:'',items:[itemBy('veg',350,true),itemBy('cottage',260),itemBy('oil',10)]},
      ]},
    ],
  }
}
function liveDraft():NutritionPlanDraft{
  return {
    id:null,client_id:'',name:'План питания',description:'',daily_kcal_target:2300,
    protein_target_g:150,fat_target_g:null,carbs_target_g:null,notes:'',
    meals:[blankMeal('Завтрак','main',650),blankMeal('Обед','main',1100),blankMeal('Лёгкий ужин','light',550)],
  }
}

export function NutritionBuilderPage({preview}:Props){
  const navigate=useNavigate()
  const {planId}=useParams<{planId?:string}>()
  const [searchParams]=useSearchParams()
  const requestedClientId=searchParams.get('client')??''
  const previewInitialDraft=preview?{...previewDraft(),id:planId??null}:null
  const [refs,setRefs]=useState<NutritionBuilderReferences>({clients:preview?[{id:'sergey',name:'Сергей'}]:[],foods:preview?previewFoods:[]})
  const [draft,setDraft]=useState<NutritionPlanDraft>(previewInitialDraft??liveDraft())
  const [savedMeals,setSavedMeals]=useState<SavedMeal[]>([])
  const [loading,setLoading]=useState(!preview)
  const [refsLoadFailed,setRefsLoadFailed]=useState(false)
  const [reloadKey,setReloadKey]=useState(0)
  const [saving,setSaving]=useState(false)
  const [libraryBusy,setLibraryBusy]=useState<string|null>(null)
  const libraryBusyRef=useRef(false)
  const [notice,setNotice]=useState('')
  const [savedDraftSnapshot,setSavedDraftSnapshot]=useState<string|null>(null)
  const [baselineDraftSnapshot,setBaselineDraftSnapshot]=useState<string|null>(null)
  const [published,setPublished]=useState(false)
  const [builderFoods,setBuilderFoods]=useState<NutritionFood[]>(preview?previewFoods.map(f=>({...f,source:'global' as const})):[])
  const [newFoodOpen,setNewFoodOpen]=useState(false)
  const [newFood,setNewFood]=useState({name:'',food_group:'meat',kcal_100:0,protein_100:0,fat_100:0,carbs_100:0,default_portion_g:100})

  useEffect(()=>{
    if(preview){
      const source={...previewDraft(),id:planId??null}
      setDraft(source)
      if(planId){
        const snapshot=JSON.stringify(source)
        setSavedDraftSnapshot(snapshot)
        setBaselineDraftSnapshot(snapshot)
      }
      setLoading(false)
      return
    }
    let cancelled=false
    setLoading(true)
    setRefsLoadFailed(false)
    setNotice('')

    Promise.all([
      loadNutritionBuilderReferences(),
      planId?loadNutritionPlanDraft(planId):Promise.resolve(null),
    ])
      .then(([r,source])=>{
        if(cancelled)return
        setRefs(r)
        if(source){
          setDraft(source)
          const snapshot=JSON.stringify(source)
          setSavedDraftSnapshot(snapshot)
          setBaselineDraftSnapshot(snapshot)
          setPublished(false)
        }else if(requestedClientId && r.clients.some(client=>client.id===requestedClientId)){
          setDraft(current=>({...current,client_id:requestedClientId}))
        }
      })
      .catch(e=>{if(!cancelled){setRefsLoadFailed(true);setNotice((e instanceof Error?e.message:'Не удалось загрузить основные данные конструктора питания')+' Редактирование заблокировано, чтобы не сохранить неполный план.')}})
      .finally(()=>{if(!cancelled)setLoading(false)})

    // Saved meal presets are optional convenience data. Their outage must not
    // make the core nutrition builder unusable.
    void loadSavedMeals()
      .then(value=>{if(!cancelled)setSavedMeals(value)})
      .catch(()=>{if(!cancelled)setNotice(current=>current?current+' Библиотека сохранённых блюд временно недоступна.':'Библиотека сохранённых блюд временно недоступна.')})

    return()=>{cancelled=true}
  },[preview,requestedClientId,planId,reloadKey])

  useEffect(()=>{
    if(!loading&&baselineDraftSnapshot===null)setBaselineDraftSnapshot(JSON.stringify(draft))
  },[loading,baselineDraftSnapshot,draft])

  useEffect(()=>{
    if(preview){
      setBuilderFoods(previewFoods.map((f,index)=>({
        ...f,source:'global' as const,
        favorite:['oats','cottage','chicken'].includes(f.id),
        usage_count:[10,7,5,3,2][index]??0,
      })))
      return
    }
    if(!draft.client_id){
      setBuilderFoods(refs.foods.map(f=>({...f,source:'global' as const})))
      return
    }
    loadClientFoodCatalog(draft.client_id)
      .then(setBuilderFoods)
      .catch(()=>setBuilderFoods(refs.foods.map(f=>({...f,source:'global' as const}))))
  },[draft.client_id,preview,refs.foods])

  const allocated=useMemo(()=>draft.meals.reduce((s,m)=>s+m.kcal_target,0),[draft.meals])
  const remaining=draft.daily_kcal_target-allocated
  const dayTotals=useMemo(()=>draft.meals.reduce((sum,m)=>{
    const v=m.variants.find(x=>x.is_default)??m.variants[0]
    if(!v)return sum
    const t=variantTotals(v)
    return {kcal:sum.kcal+t.kcal,protein:sum.protein+t.protein,fat:sum.fat+t.fat,carbs:sum.carbs+t.carbs}
  },{kcal:0,protein:0,fat:0,carbs:0}),[draft.meals])

  function setDailyKcal(value:number){
    const daily=Math.max(500,Math.min(10000,Math.round(value||0)))
    setDraft(d=>({...d,daily_kcal_target:daily,meals:distribute(d.meals,daily)}))
  }
  function changeMealTarget(id:string,value:number){
    setDraft(d=>({...d,meals:distribute(d.meals,d.daily_kcal_target,id,value)}))
  }
  function patchMeal(id:string,patch:Partial<NutritionMealDraft>){
    setDraft(d=>({...d,meals:d.meals.map(m=>m.local_id===id?{...m,...patch}:m)}))
  }
  function removeMeal(id:string){
    setDraft(d=>({...d,meals:distribute(d.meals.filter(m=>m.local_id!==id),d.daily_kcal_target)}))
  }
  function addMeal(type:NutritionMealDraft['meal_type']){
    setDraft(d=>{
      const count=d.meals.filter(m=>m.meal_type===type).length+1
      const name=type==='main'?'Основной приём '+count:type==='light'?'Лёгкий приём':'Перекус'
      return {...d,meals:distribute([...d.meals,blankMeal(name,type,300)],d.daily_kcal_target)}
    })
  }
  function setMainCount(count:number){
    setDraft(d=>{
      const extras=d.meals.filter(m=>m.meal_type!=='main')
      const current=d.meals.filter(m=>m.meal_type==='main').slice(0,count)
      const names=['Завтрак','Обед','Ужин','Основной приём 4']
      while(current.length<count) current.push(blankMeal(names[current.length]??'Основной приём '+(current.length+1),'main',500))
      return {...d,meals:distribute([...current,...extras],d.daily_kcal_target)}
    })
  }
  function patchVariant(mealId:string,variantId:string,fn:(v:NutritionMealVariantDraft)=>NutritionMealVariantDraft){
    setDraft(d=>({...d,meals:d.meals.map(m=>m.local_id===mealId?{...m,variants:m.variants.map(v=>v.local_id===variantId?fn(v):v)}:m)}))
  }
  function addFood(meal:NutritionMealDraft,variant:NutritionMealVariantDraft,food:NutritionFood){
    patchVariant(meal.local_id,variant.local_id,v=>scaleVariant({...v,items:[...v.items,foodItem(food)]},meal.kcal_target))
  }
  function addVariant(meal:NutritionMealDraft){
    patchMeal(meal.local_id,{variants:[...meal.variants,{...blankVariant('Вариант '+(meal.variants.length+1)),is_default:false}]})
  }
  function removeVariant(mealId:string,variantId:string){
    setDraft(d=>({...d,meals:d.meals.map(m=>{
      if(m.local_id!==mealId)return m
      const left=m.variants.filter(v=>v.local_id!==variantId)
      if(left.length && !left.some(v=>v.is_default)) left[0]={...left[0],is_default:true}
      return {...m,variants:left}
    })}))
  }
  function setDefaultVariant(mealId:string,variantId:string){
    setDraft(d=>({...d,meals:d.meals.map(m=>m.local_id===mealId?{...m,variants:m.variants.map(v=>({...v,is_default:v.local_id===variantId}))}:m)}))
  }
  async function save(){
    if(refsLoadFailed){setNotice('Основные данные конструктора не загрузились. Повтори загрузку перед сохранением.');return}
    if(preview){setNotice('В preview изменения видны сразу. После создания аккаунта тренера этот план можно сохранить в базу.');return}
    const saveStartedAt=Date.now()
    setSaving(true);setNotice('')
    try{
      const wasNew=!draft.id
      const id=await saveNutritionPlan(draft)
      const savedDraft={...draft,id}
      setDraft(savedDraft)
      setSavedDraftSnapshot(JSON.stringify(savedDraft))
      setBaselineDraftSnapshot(JSON.stringify(savedDraft))
      if(wasNew)navigate('/builder/nutrition/'+encodeURIComponent(id)+'/edit',{replace:true})
      showAppToast('Черновик плана питания сохранён.')
    }catch(e){
      try{
        const rows=draft.client_id
          ? await loadTrainerClientNutritionPlans(draft.client_id)
          : await loadTrainerNutritionTemplates()
        const candidate=rows.find(plan=>{
          const sameId=draft.id?plan.id===draft.id:true
          const sameCore=plan.name===draft.name.trim()
            && Number(plan.daily_kcal_target)===Number(draft.daily_kcal_target)
            && (plan.protein_target_g==null?null:Number(plan.protein_target_g))===(draft.protein_target_g==null?null:Number(draft.protein_target_g))
          const recent=new Date(plan.updated_at).getTime()>=saveStartedAt-5000
          const draftStatus=!('status' in plan)||plan.status==='draft'
          return sameId&&sameCore&&recent&&draftStatus
        })
        if(candidate){
          const wasNew=!draft.id
          const savedDraft={...draft,id:candidate.id}
          setDraft(savedDraft)
          setSavedDraftSnapshot(JSON.stringify(savedDraft))
          setBaselineDraftSnapshot(JSON.stringify(savedDraft))
          if(wasNew)navigate('/builder/nutrition/'+encodeURIComponent(candidate.id)+'/edit',{replace:true})
          showAppToast('Черновик уже был сохранён на сервере.','info')
          return
        }
      }catch{}
      setNotice((e instanceof Error?e.message:'Не удалось сохранить план')+' Перед повтором приложение проверило сервер и не нашло подтверждённую версию.')
    }
    finally{setSaving(false)}
  }
  async function publish(){
    if(preview){setNotice('Публикация появится после назначения реального клиента.');return}
    if(!draft.id){setNotice('Сначала сохрани черновик.');return}
    if(savedDraftSnapshot!==JSON.stringify(draft)){setNotice('После сохранения план был изменён. Сначала сохрани текущую версию.');return}
    const emptyMeal=draft.meals.find(meal=>!meal.variants.length||meal.variants.some(variant=>variant.items.length===0))
    if(emptyMeal){setNotice('Нельзя опубликовать пустой Meal Plan. Добавь продукты во все варианты приёма «'+emptyMeal.name+'».');return}
    setSaving(true);setNotice('')
    try{await publishNutritionPlan(draft.id);setPublished(true);showAppToast('План опубликован клиенту. Эта версия теперь защищена от изменений.')}
    catch(e){
      if(draft.client_id){
        try{
          const plans=await loadTrainerClientNutritionPlans(draft.client_id)
          const actual=plans.find(plan=>plan.id===draft.id)
          if(actual?.status==='active'){
            setPublished(true)
            showAppToast('План уже был опубликован клиенту.','info')
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось опубликовать')
    }
    finally{setSaving(false)}
  }
  async function savePreset(meal:NutritionMealDraft){
    if(libraryBusyRef.current)return
    const v=meal.variants.find(x=>x.is_default)??meal.variants[0]
    if(!v?.items.length){setNotice('Сначала добавь продукты в приём пищи.');return}
    if(preview){
      setSavedMeals(s=>[...s,{id:uid(),name:meal.name,meal_type:meal.meal_type,notes:meal.notes||null,items:v.items}])
      showAppToast('Приём сохранён в локальную библиотеку preview.','info')
      return
    }
    const knownIds=new Set(savedMeals.map(item=>item.id))
    libraryBusyRef.current=true
    setLibraryBusy('meal:'+meal.local_id);setNotice('')
    try{
      const id=await saveMealPreset(meal.name,meal.meal_type,v.items)
      setSavedMeals(s=>[...s,{id,name:meal.name,meal_type:meal.meal_type,notes:meal.notes||null,items:v.items}])
      showAppToast('Приём пищи сохранён в библиотеку.')
    }catch(e){
      try{
        const actual=await loadSavedMeals()
        const recovered=actual.find(item=>!knownIds.has(item.id)&&savedMealMatchesInput(item,meal.name,meal.meal_type,v.items))
        if(recovered){
          setSavedMeals(actual)
          showAppToast('Приём уже был сохранён в библиотеку.','info')
          return
        }
      }catch{}
      setNotice(e instanceof Error?e.message:'Не удалось сохранить приём')
    }
    finally{libraryBusyRef.current=false;setLibraryBusy(null)}
  }
  async function createFood(){
    if(libraryBusyRef.current)return
    if(!newFood.name.trim()){setNotice('Укажи название продукта.');return}
    if([newFood.kcal_100,newFood.protein_100,newFood.fat_100,newFood.carbs_100].some(value=>value<0)||newFood.default_portion_g<=0){setNotice('Проверь КБЖУ и порцию: значения не могут быть отрицательными.');return}
    const knownIds=new Set(refs.foods.map(food=>food.id))
    libraryBusyRef.current=true
    const expected={id:'',name:newFood.name.trim(),kcal_100:newFood.kcal_100,protein_100:newFood.protein_100,fat_100:newFood.fat_100,carbs_100:newFood.carbs_100,default_portion_g:newFood.default_portion_g}
    const acceptFood=(food:NutritionFood,all?:NutritionBuilderReferences)=>{
      setRefs(current=>all??({...current,foods:[...current.foods.filter(item=>item.id!==food.id),food].sort((a,b)=>a.name.localeCompare(b.name,'ru'))}))
      setNewFood({name:'',food_group:'meat',kcal_100:0,protein_100:0,fat_100:0,carbs_100:0,default_portion_g:100})
      setNewFoodOpen(false)
      showAppToast('Продукт добавлен в библиотеку.')
    }
    setLibraryBusy('food');setNotice('')
    try{
      const food: NutritionFood = preview
        ? {id:uid(),...newFood,name:newFood.name.trim()}
        : await createNutritionFood({...newFood,name:newFood.name.trim()})
      acceptFood(food)
    }catch(e){
      if(!preview){
        try{
          const actual=await loadNutritionBuilderReferences()
          const recovered=actual.foods.find(food=>!knownIds.has(food.id)&&sameNutritionFoodDetails(food,{...expected,id:food.id}))
          if(recovered){
            acceptFood(recovered,actual)
            showAppToast('Продукт уже был добавлен на сервере.','info')
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось добавить продукт')
    }
    finally{libraryBusyRef.current=false;setLibraryBusy(null)}
  }

  function insertPreset(preset:SavedMeal){
    setDraft(d=>({...d,meals:distribute([...d.meals,{
      ...blankMeal(preset.name,preset.meal_type,Math.round(preset.items.reduce((s,i)=>s+kcal(i),0))),
      variants:[{local_id:uid(),name:'Основной вариант',is_default:true,notes:'',items:preset.items.map(i=>({...i,local_id:uid()}))}],
    }],d.daily_kcal_target)}))
  }

  const hasUnsavedNutritionChanges=Boolean(draft.id)&&savedDraftSnapshot!==JSON.stringify(draft)
  const hasAnyUnsavedNutritionChanges=draft.id
    ? savedDraftSnapshot!==JSON.stringify(draft)
    : baselineDraftSnapshot!==null&&baselineDraftSnapshot!==JSON.stringify(draft)

  if(loading)return <div className="library-empty">Загружаю конструктор питания…</div>
  if(refsLoadFailed)return <div className="page-stack nutrition-builder-page"><div className="workspace-back"><Link to="/builder"><ChevronLeft size={17}/>Конструктор</Link></div><div className="library-empty"><strong>Не удалось безопасно загрузить конструктор питания.</strong><span>{notice||'Редактирование не открыто, чтобы не сохранить неполные данные.'}</span><button className="primary-button compact" onClick={()=>setReloadKey(key=>key+1)}>Повторить загрузку</button></div></div>

  return <div className="page-stack nutrition-builder-page">
    <UnsavedChangesGuard when={!preview&&hasAnyUnsavedNutritionChanges}/>
    <div className="workspace-back"><Link to="/builder"><ChevronLeft size={17}/>Конструктор</Link></div>

    <section className="nutrition-builder-hero">
      <div>
        <span className="eyebrow light">Меню-план</span>
        <h2>Конструктор рациона</h2>
        <p>Сначала структура дня и привычные блюда. Калории перераспределяются автоматически, опубликованные версии не переписываются.</p>
      </div>
      <div className="nutrition-hero-summary">
        <strong>{draft.daily_kcal_target}</strong><span>ккал / день</span>
        <small className={remaining===0?'ok':Math.abs(remaining)>50?'warn':''}>{remaining===0?'распределено полностью':remaining>0?'осталось '+remaining:'перебор '+Math.abs(remaining)}</small>
      </div>
    </section>

    <section className="panel nutrition-plan-basics">
      <div className="form-grid-3">
        <label className="field-label">Название<input value={draft.name} onChange={e=>setDraft(d=>({...d,name:e.target.value}))}/></label>
        <label className="field-label">Для кого<select value={draft.client_id} onChange={e=>setDraft(d=>({...d,client_id:e.target.value}))}><option value="">Шаблон без клиента</option>{refs.clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="field-label">Калорийность<input type="number" min="500" max="10000" step="50" value={draft.daily_kcal_target} onChange={e=>setDailyKcal(n(e.target.value))}/></label>
      </div>
      <div className="macro-target-grid">
        <label>Белок, г<input type="number" min="0" value={draft.protein_target_g??''} onChange={e=>setDraft(d=>({...d,protein_target_g:e.target.value===''?null:n(e.target.value)}))}/></label>
        <label>Жиры, г<input type="number" min="0" value={draft.fat_target_g??''} onChange={e=>setDraft(d=>({...d,fat_target_g:e.target.value===''?null:n(e.target.value)}))}/></label>
        <label>Углеводы, г<input type="number" min="0" value={draft.carbs_target_g??''} onChange={e=>setDraft(d=>({...d,carbs_target_g:e.target.value===''?null:n(e.target.value)}))}/></label>
        <div className="macro-live"><span>По выбранным вариантам</span><strong>{Math.round(dayTotals.protein)} Б · {Math.round(dayTotals.fat)} Ж · {Math.round(dayTotals.carbs)} У</strong></div>
      </div>
      <label className="field-label">Комментарий<textarea rows={2} value={draft.description} onChange={e=>setDraft(d=>({...d,description:e.target.value}))} placeholder="Например: два плотных приёма пищи, вечером лёгкий салат + белок"/></label>
    </section>

    <section className="panel meal-structure-panel">
      <div className="panel-head">
        <div><span className="eyebrow">Структура дня</span><h3>Сколько основных приёмов?</h3></div>
        <div className="main-meal-count">{[2,3,4].map(c=><button key={c} className={draft.meals.filter(m=>m.meal_type==='main').length===c?'is-active':''} onClick={()=>setMainCount(c)}>{c}</button>)}</div>
      </div>
      <div className="meal-kcal-sliders">{draft.meals.map(meal=><label key={meal.local_id}><span><b>{meal.name}</b><em>{meal.kcal_target} ккал</em></span><input type="range" min="100" max={Math.max(200,draft.daily_kcal_target-100)} step="25" value={meal.kcal_target} onChange={e=>changeMealTarget(meal.local_id,n(e.target.value))}/></label>)}</div>
      <div className="meal-add-actions">
        <button className="ghost-button" onClick={()=>addMeal('light')}><Plus size={14}/>Лёгкий приём</button>
        <button className="ghost-button" onClick={()=>addMeal('snack')}><Plus size={14}/>Перекус</button>
        <button className="ghost-button" onClick={()=>setNewFoodOpen(v=>!v)}><Plus size={14}/>Новый продукт</button>
      </div>
      {newFoodOpen && <div className="new-food-panel">
        <label><span>Название</span><input value={newFood.name} onChange={e=>setNewFood(x=>({...x,name:e.target.value}))} placeholder="Например: Творог 5%"/></label>
        <label><span>Категория</span><select value={newFood.food_group} onChange={e=>setNewFood(x=>({...x,food_group:e.target.value}))}>{FOOD_GROUP_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>ккал / 100 г</span><input type="number" min="0" value={newFood.kcal_100} onChange={e=>setNewFood(x=>({...x,kcal_100:n(e.target.value)}))}/></label>
        <label><span>Белок</span><input type="number" min="0" step=".1" value={newFood.protein_100} onChange={e=>setNewFood(x=>({...x,protein_100:n(e.target.value)}))}/></label>
        <label><span>Жиры</span><input type="number" min="0" step=".1" value={newFood.fat_100} onChange={e=>setNewFood(x=>({...x,fat_100:n(e.target.value)}))}/></label>
        <label><span>Углеводы</span><input type="number" min="0" step=".1" value={newFood.carbs_100} onChange={e=>setNewFood(x=>({...x,carbs_100:n(e.target.value)}))}/></label>
        <label><span>Порция, г</span><input type="number" min="1" value={newFood.default_portion_g} onChange={e=>setNewFood(x=>({...x,default_portion_g:Math.max(1,n(e.target.value))}))}/></label>
        <button className="primary-button compact" disabled={Boolean(libraryBusy)} onClick={()=>void createFood()}><Plus size={13}/>{libraryBusy==='food'?'Добавляю…':'Добавить в библиотеку'}</button>
      </div>}
      {savedMeals.length>0 && <div className="saved-meal-strip"><span>Сохранённые:</span>{savedMeals.map(m=><button key={m.id} onClick={()=>insertPreset(m)}><Copy size={12}/>{m.name}</button>)}</div>}
    </section>

    <div className="nutrition-meal-list">
      {draft.meals.map((meal,mealIndex)=>{
        const defaultVariant=meal.variants.find(v=>v.is_default)??meal.variants[0]
        const actual=defaultVariant?variantTotals(defaultVariant):{kcal:0,protein:0,fat:0,carbs:0}
        return <article className="nutrition-meal-card" key={meal.local_id}>
          <div className="nutrition-meal-head">
            <div className="meal-order">{mealIndex+1}</div>
            <div className="meal-title-edit">
              <div className="meal-type-row">
                <select value={meal.meal_type} onChange={e=>patchMeal(meal.local_id,{meal_type:e.target.value as NutritionMealDraft['meal_type']})}>
                  <option value="main">Основной</option><option value="light">Лёгкий</option><option value="snack">Перекус</option>
                </select>
                <input value={meal.name} onChange={e=>patchMeal(meal.local_id,{name:e.target.value})}/>
              </div>
              <small>{Math.round(actual.kcal)} ккал фактически · {Math.round(actual.protein)} г белка</small>
            </div>
            <label className="meal-kcal-target"><span>Цель</span><input type="number" min="0" step="25" value={meal.kcal_target} onChange={e=>changeMealTarget(meal.local_id,n(e.target.value))}/><small>ккал</small></label>
            <button className={'meal-lock '+(meal.target_locked?'is-locked':'')} title={meal.target_locked?'Не перераспределять калории этого приёма':'Разрешить автоматическое перераспределение'} onClick={()=>patchMeal(meal.local_id,{target_locked:!meal.target_locked})}>{meal.target_locked?<Lock size={15}/>:<Unlock size={15}/>}</button>
            <button className="icon-button danger" onClick={()=>removeMeal(meal.local_id)}><Trash2 size={15}/></button>
          </div>

          <div className="meal-progress"><span style={{width:String(Math.min(100,meal.kcal_target?actual.kcal/meal.kcal_target*100:0))+'%'}}/></div>

          <div className="meal-variant-tabs">
            {meal.variants.map(v=><button key={v.local_id} className={v.is_default?'is-active':''} onClick={()=>setDefaultVariant(meal.local_id,v.local_id)}>{v.name}</button>)}
            <button className="add-variant" onClick={()=>addVariant(meal)}><Plus size={12}/>вариант</button>
          </div>

          {meal.variants.map(variant=>{
            const totals=variantTotals(variant)
            return <section className={'meal-variant-editor '+(variant.is_default?'is-default':'')} key={variant.local_id}>
              <div className="variant-head">
                <input value={variant.name} onChange={e=>patchVariant(meal.local_id,variant.local_id,v=>({...v,name:e.target.value}))}/>
                <div><strong>{Math.round(totals.kcal)} ккал</strong><span>{Math.round(totals.protein)} Б · {Math.round(totals.fat)} Ж · {Math.round(totals.carbs)} У</span></div>
                {meal.variants.length>1 && <button className="icon-button danger" onClick={()=>removeVariant(meal.local_id,variant.local_id)}><X size={14}/></button>}
              </div>

              <div className="meal-items">
                {variant.items.map(item=>{
                  const im=macros(item)
                  return <div className="meal-item-row" key={item.local_id}>
                    <div className="meal-item-name"><strong>{item.name}</strong><span>{Math.round(im.kcal)} ккал · {Math.round(im.protein)} Б / {Math.round(im.fat)} Ж / {Math.round(im.carbs)} У</span></div>
                    <label><input type="number" min="1" step="5" value={Math.round(item.grams)} onChange={e=>patchVariant(meal.local_id,variant.local_id,v=>({...v,items:v.items.map(i=>i.local_id===item.local_id?{...i,grams:Math.max(1,n(e.target.value))}:i)}))}/><span>г</span></label>
                    <button className={'ingredient-lock '+(item.is_fixed?'is-fixed':'')} title={item.is_fixed?'Граммовка закреплена':'Разрешить автоподгонку граммовки'} onClick={()=>patchVariant(meal.local_id,variant.local_id,v=>({...v,items:v.items.map(i=>i.local_id===item.local_id?{...i,is_fixed:!i.is_fixed}:i)}))}>{item.is_fixed?<Lock size={13}/>:<Unlock size={13}/>}</button>
                    <button className="icon-button danger" onClick={()=>patchVariant(meal.local_id,variant.local_id,v=>({...v,items:v.items.filter(i=>i.local_id!==item.local_id)}))}><Trash2 size={13}/></button>
                  </div>
                })}
                {!variant.items.length && <div className="meal-items-empty">Добавь продукты — граммовки можно будет автоматически подогнать под калорийность приёма.</div>}
              </div>

              <div className="meal-item-add smart-food-add">
                <FoodCombobox
                  foods={builderFoods}
                  placeholder={draft.client_id?'Найти продукт клиента…':'Найти продукт…'}
                  onSelect={food=>addFood(meal,variant,food)}
                />
                <button className="text-button" disabled={!variant.items.length} onClick={()=>patchVariant(meal.local_id,variant.local_id,v=>scaleVariant(v,meal.kcal_target))}><Scale size={13}/>Подогнать к {meal.kcal_target} ккал</button>
              </div>
            </section>
          })}

          <div className="meal-card-footer">
            <input value={meal.notes} onChange={e=>patchMeal(meal.local_id,{notes:e.target.value})} placeholder="Комментарий к приёму — необязательно"/>
            <button className="text-button" disabled={Boolean(libraryBusy)} onClick={()=>void savePreset(meal)}><Save size={13}/>{libraryBusy==='meal:'+meal.local_id?'Сохраняю…':'Сохранить приём в библиотеку'}</button>
          </div>
        </article>
      })}
    </div>

    <section className="nutrition-day-summary">
      <div><span>Распределено</span><strong>{allocated} / {draft.daily_kcal_target} ккал</strong></div>
      <div><span>По блюдам</span><strong>≈ {Math.round(dayTotals.kcal)} ккал</strong></div>
      <div><span>Белок</span><strong>{Math.round(dayTotals.protein)}{draft.protein_target_g?' / '+draft.protein_target_g:''} г</strong></div>
      <div className="nutrition-save-actions">
        <button className="ghost-button" disabled={saving||published} onClick={()=>void save()}><Save size={15}/>{draft.id?'Сохранить черновик':'Создать черновик'}</button>
        <button className="primary-button compact" disabled={saving||published||!draft.client_id||hasUnsavedNutritionChanges} onClick={()=>void publish()}><CheckCircle2 size={15}/>{published?'Опубликован':hasUnsavedNutritionChanges?'Сначала сохрани изменения':'Опубликовать клиенту'}</button>
      </div>
    </section>
    {notice && <div className="drawer-notice">{notice}</div>}
  </div>
}
