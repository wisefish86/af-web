
import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ChevronDown, Save, SlidersHorizontal, Star, Utensils } from 'lucide-react'
import { createMyMealPlan, loadActiveNutritionPlan, loadTodayNutritionCheckin, saveTodayNutritionCheckin, loadMyNutritionSetup, loadLatestWeightForNutrition, loadMyNutritionTrend, saveMyNutritionSetup, setMyNutritionTrackingMode } from '../features/nutrition/service'
import type { CardioIntensity, DailyActivityLevel, NutritionGoal, NutritionTrendDay } from '../features/nutrition/service'
import type { ActiveNutritionPlan, NutritionDailyCheckin } from '../features/nutrition/types'
import { PersonalMealLibrary } from '../components/PersonalMealLibrary'
import { ClientMealPlanEditor } from '../components/ClientMealPlanEditor'
import { FoodCombobox } from '../components/FoodCombobox'
import { CoachHint } from '../components/CoachHint'
import { getVerifiedUser, supabase } from '../lib/supabase'
import { appDateKey } from '../lib/appDate'
import { showAppToast } from '../lib/toast'
import { UiLoadError, UiNotice, UiStack } from '../ui/primitives'
import { loadMyProfile, saveMyBodyProfile } from '../features/profile/service'
import { summarizeWeeklyWeights } from '../features/tracking/progressMetrics'

type Props={preview:boolean}
type NutritionLoadFailure='plan'|'checkin'|'setup'|'weight'
const nutritionLoadLabels:Record<NutritionLoadFailure,string>={
  plan:'Meal Plan',
  checkin:'отметка питания за сегодня',
  setup:'настройки расчёта',
  weight:'последний вес',
}

type NutritionSetupForm={
  sex:'male'|'female'
  height:string
  weight:string
  steps:string
  dailyActivity:DailyActivityLevel
  strengthSessions:string
  strengthMinutes:string
  cardioSessions:string
  cardioMinutes:string
  cardioIntensity:CardioIntensity
  goal:NutritionGoal
}
type NutritionCheckinRecovery={
  version:1
  date:string
  baseline:string
  dayMode:'plan'|'deviation'|'manual'|null
  adherence:NutritionDailyCheckin['nutrition_adherence']
  deviation:NutritionDailyCheckin['nutrition_deviation']
  actualCalories:string
  actualProtein:string
  actualFat:string
  actualCarbs:string
  showActual:boolean
}
type NutritionSetupRecovery={version:1;baseline:string;form:NutritionSetupForm}

function nutritionCheckinSignature(value:NutritionDailyCheckin|null){
  return JSON.stringify(value?{
    id:value.id,
    mode:value.nutrition_mode,
    adherence:value.nutrition_adherence,
    deviation:value.nutrition_deviation,
    calories:value.calories,
    protein:value.protein_g,
    fat:value.fat_g,
    carbs:value.carbs_g,
    plan:value.nutrition_plan_id,
  }:null)
}
function nutritionSetupSignature(value:any){
  return JSON.stringify(value?{
    sex:value.sex_for_calculation??null,
    height:value.height_cm==null?null:Number(value.height_cm),
    weight:value.weight_kg_used==null?null:Number(value.weight_kg_used),
    steps:value.average_steps==null?null:Number(value.average_steps),
    dailyActivity:value.daily_activity_level??null,
    strengthSessions:value.strength_sessions_per_week==null?null:Number(value.strength_sessions_per_week),
    strengthMinutes:value.strength_minutes_per_session==null?null:Number(value.strength_minutes_per_session),
    cardioSessions:value.cardio_sessions_per_week==null?null:Number(value.cardio_sessions_per_week),
    cardioMinutes:value.cardio_minutes_per_session==null?null:Number(value.cardio_minutes_per_session),
    cardioIntensity:value.cardio_intensity??null,
    goal:value.goal??null,
  }:null)
}

type FoodGroupKey=
  |'meat'|'fish'|'dairy'|'plant_protein'|'sports'
  |'carb'|'vegetable'|'fruit'|'fat'|'treat'|'drink'

const FOOD_GROUPS:{key:FoodGroupKey;label:string;order:number}[]=[
  {key:'meat',label:'Мясо, птица и яйца',order:10},
  {key:'fish',label:'Рыба и морепродукты',order:20},
  {key:'dairy',label:'Молочные продукты',order:30},
  {key:'plant_protein',label:'Бобовые и растительный белок',order:40},
  {key:'sports',label:'Протеин, порошок',order:50},
  {key:'carb',label:'Крупы, хлеб и гарниры',order:60},
  {key:'vegetable',label:'Овощи и грибы',order:70},
  {key:'fruit',label:'Фрукты и ягоды',order:80},
  {key:'fat',label:'Орехи, семена и жиры',order:90},
  {key:'treat',label:'Сладкое, десерты и протеиновые батончики',order:100},
  {key:'drink',label:'Напитки',order:110},
]
const DEFAULT_FOOD_GROUPS=FOOD_GROUPS.map(g=>g.key)

const ACTIVITY_OPTIONS:{value:DailyActivityLevel;label:string;hint:string}[]=[
  {value:'sedentary',label:'В основном сижу',hint:'Офис, машина, мало движения в течение дня'},
  {value:'mixed',label:'Сижу и хожу примерно поровну',hint:'Есть регулярные перемещения в течение дня'},
  {value:'on_feet',label:'Большую часть дня на ногах',hint:'Много стою и хожу по работе или в быту'},
  {value:'physical',label:'Физическая работа / очень подвижный день',hint:'Регулярная физическая нагрузка помимо тренировок'},
]

const GOAL_OPTIONS:{value:NutritionGoal;label:string;delta:string}[]=[
  {value:'lose_slow',label:'Снижение — плавно',delta:'−10%'},
  {value:'lose_standard',label:'Снижение — обычно',delta:'−15%'},
  {value:'lose_fast',label:'Снижение — быстро',delta:'−20%'},
  {value:'maintain',label:'Поддержание веса',delta:'0%'},
  {value:'gain_slow',label:'Набор — плавно',delta:'+5%'},
  {value:'gain_fast',label:'Набор — быстрее',delta:'+10%'},
]

const CARDIO_INTENSITY_OPTIONS:{value:CardioIntensity;label:string}[]=[
  {value:'light',label:'Лёгкое — можно спокойно разговаривать'},
  {value:'moderate',label:'Среднее — говорить уже заметно тяжелее'},
  {value:'vigorous',label:'Высокое — короткие фразы, тяжёлое дыхание'},
]

const previewPlan:ActiveNutritionPlan={
  id:'preview',name:'Базовый рацион',description:'Два плотных основных приёма пищи и лёгкий ужин.',
  daily_kcal_target:2300,free_kcal_target:250,protein_target_g:150,fat_target_g:null,carbs_target_g:null,notes:null,version:1,
  meals:[
    {id:'m1',name:'Завтрак',meal_type:'main',kcal_target:650,target_locked:false,notes:'Можно чередовать два привычных варианта.',variants:[
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
    {id:'m2',name:'Обед',meal_type:'main',kcal_target:1100,target_locked:false,notes:null,variants:[
      {id:'v3',name:'Курица + гречка + овощи',is_default:true,notes:null,items:[
        {id:'i7',name:'Куриное филе',grams:250,kcal_100:165,protein_100:31,fat_100:3.6,carbs_100:0,is_fixed:true},
        {id:'i8',name:'Гречка сухая',grams:120,kcal_100:343,protein_100:13,fat_100:3.4,carbs_100:72,is_fixed:false},
        {id:'i9',name:'Овощи / салат',grams:300,kcal_100:25,protein_100:1.2,fat_100:.2,carbs_100:4.5,is_fixed:true},
        {id:'i10',name:'Оливковое масло',grams:15,kcal_100:900,protein_100:0,fat_100:100,carbs_100:0,is_fixed:false},
      ]},
    ]},
    {id:'m3',name:'Лёгкий ужин',meal_type:'light',kcal_target:550,target_locked:false,notes:'Лёгкий объёмный приём пищи.',variants:[
      {id:'v4',name:'Салат + творог',is_default:true,notes:null,items:[
        {id:'i11',name:'Овощи / салат',grams:350,kcal_100:25,protein_100:1.2,fat_100:.2,carbs_100:4.5,is_fixed:true},
        {id:'i12',name:'Творог 5%',grams:260,kcal_100:145,protein_100:17,fat_100:5,carbs_100:3,is_fixed:false},
        {id:'i13',name:'Оливковое масло',grams:10,kcal_100:900,protein_100:0,fat_100:100,carbs_100:0,is_fixed:false},
      ]},
    ]},
  ],
}

const previewNutritionTrend:NutritionTrendDay[]=[
  {date:'2026-10-04',calories:2280,protein_g:146,weight_kg:80.8,waist_cm:84.2},
  {date:'2026-10-05',calories:2140,protein_g:151,weight_kg:null,waist_cm:null},
  {date:'2026-10-06',calories:2210,protein_g:143,weight_kg:80.4,waist_cm:null},
  {date:'2026-10-07',calories:2050,protein_g:156,weight_kg:null,waist_cm:null},
  {date:'2026-10-08',calories:2180,protein_g:149,weight_kg:80.1,waist_cm:83.8},
  {date:'2026-10-09',calories:2240,protein_g:152,weight_kg:null,waist_cm:null},
  {date:'2026-10-10',calories:2100,protein_g:150,weight_kg:80.0,waist_cm:null},
]
function totals(items:ActiveNutritionPlan['meals'][number]['variants'][number]['items']){
  return items.reduce((s,i)=>{
    const f=i.grams/100
    return {kcal:s.kcal+i.kcal_100*f,protein:s.protein+i.protein_100*f,fat:s.fat+i.fat_100*f,carbs:s.carbs+i.carbs_100*f}
  },{kcal:0,protein:0,fat:0,carbs:0})
}

export function NutritionPage({preview}:Props){
  const previewParams=preview?new URLSearchParams(window.location.search):null
  const previewRecovery=previewParams?.get('qaRecovery')==='1'
  const previewNoPlan=previewParams?.get('qaNutritionNoPlan')==='1'
  const recoveryPersistenceEnabled=!preview||previewRecovery
  const [plan,setPlan]=useState<ActiveNutritionPlan|null>(preview&&!previewNoPlan?previewPlan:null)
  const [loading,setLoading]=useState(!preview)
  const [notice,setNotice]=useState('')
  const [loadFailures,setLoadFailures]=useState<NutritionLoadFailure[]>([])
  const [selected,setSelected]=useState<Record<string,string>>({})
  const [checkin,setCheckin]=useState<NutritionDailyCheckin|null>(null)
  const [adherence,setAdherence]=useState<NutritionDailyCheckin['nutrition_adherence']>(null)
  const [dayMode,setDayMode]=useState<'plan'|'deviation'|'manual'|null>(null)
  const [deviation,setDeviation]=useState<NutritionDailyCheckin['nutrition_deviation']>(null)
  const [actualCalories,setActualCalories]=useState('')
  const [actualProtein,setActualProtein]=useState('')
  const [actualFat,setActualFat]=useState('')
  const [actualCarbs,setActualCarbs]=useState('')
  const [showActual,setShowActual]=useState(false)
  const [savingCheckin,setSavingCheckin]=useState(false)
  const [setup,setSetup]=useState<any>(preview?{target_kcal:2300,tracking_mode:'meal_plan'}:null)
  const [trackingMode,setTrackingMode]=useState<'meal_plan'|'calorie_tracking'>('meal_plan')
  const [switchingMode,setSwitchingMode]=useState(false)
  const [planLoaded,setPlanLoaded]=useState(preview)
  const [planLoading,setPlanLoading]=useState(!preview)
  const [setupLoaded,setSetupLoaded]=useState(preview)
  const [setupOpen,setSetupOpen]=useState(false)
  const [setupForm,setSetupForm]=useState<NutritionSetupForm>({
    sex:'male',
    height:'',
    weight:'',
    steps:'',
    dailyActivity:'sedentary',
    strengthSessions:'3',
    strengthMinutes:'60',
    cardioSessions:'0',
    cardioMinutes:'30',
    cardioIntensity:'moderate',
    goal:'maintain',
  })
  const [latestMeasuredWeight,setLatestMeasuredWeight]=useState<number|null>(null)
  const [bodyProfile,setBodyProfile]=useState<{height_cm:number|null;wrist_cm:number|null;ankle_cm:number|null}|null>(preview?{height_cm:178,wrist_cm:18,ankle_cm:null}:null)
  const [nutritionTrend,setNutritionTrend]=useState<NutritionTrendDay[]>(preview?previewNutritionTrend:[])
  const [nutritionTrendError,setNutritionTrendError]=useState('')
  const nutritionTrendScrollRef=useRef<HTMLDivElement>(null)
  const [builderOpen,setBuilderOpen]=useState(false)
  const [planEditorOpen,setPlanEditorOpen]=useState(false)
  const [creatingPlan,setCreatingPlan]=useState(false)
  const foodSavingRef=useRef(new Set<string>())
  const [foodSavingIds,setFoodSavingIds]=useState<string[]>([])
  const [mealCount,setMealCount]=useState(3)
  const [foods,setFoods]=useState<any[]>([])
  const [chosenFoods,setChosenFoods]=useState<string[]>([])
  const [visibleFoodGroups]=useState<FoodGroupKey[]>(DEFAULT_FOOD_GROUPS)
  const [openFoodGroups,setOpenFoodGroups]=useState<FoodGroupKey[]>(['meat'])
  const checkinBaselineRef=useRef(nutritionCheckinSignature(null))
  const setupBaselineRef=useRef(nutritionSetupSignature(preview?{target_kcal:2300,tracking_mode:'meal_plan'}:null))
  const checkinTouchedRef=useRef(false)
  const setupTouchedRef=useRef(false)

  function checkinDraftKey(){return 'andrey-fit:nutrition-checkin-draft:'+appDateKey()}
  function setupDraftKey(){return 'andrey-fit:nutrition-setup-draft'}
  function clearCheckinRecovery(){if(!recoveryPersistenceEnabled)return;try{localStorage.removeItem(checkinDraftKey())}catch{}}
  function clearSetupRecovery(){if(!recoveryPersistenceEnabled)return;try{localStorage.removeItem(setupDraftKey())}catch{}}
  function readCheckinRecovery():NutritionCheckinRecovery|null{
    if(!recoveryPersistenceEnabled)return null
    try{
      const raw=localStorage.getItem(checkinDraftKey())
      if(!raw)return null
      const parsed=JSON.parse(raw) as NutritionCheckinRecovery
      return parsed?.version===1&&parsed.date===appDateKey()?parsed:null
    }catch{return null}
  }
  function readSetupRecovery():NutritionSetupRecovery|null{
    if(!recoveryPersistenceEnabled)return null
    try{
      const raw=localStorage.getItem(setupDraftKey())
      if(!raw)return null
      const parsed=JSON.parse(raw) as NutritionSetupRecovery
      return parsed?.version===1&&parsed.form?parsed:null
    }catch{return null}
  }
  function restoreCheckinRecovery(server:NutritionDailyCheckin|null,serverKnown=true){
    const serverBaseline=nutritionCheckinSignature(server)
    const saved=readCheckinRecovery()
    if(!saved){
      checkinBaselineRef.current=serverBaseline
      return
    }
    if(serverKnown&&saved.baseline!==serverBaseline){
      clearCheckinRecovery()
      checkinBaselineRef.current=serverBaseline
      setNotice(current=>current||'Отметка питания изменилась на другом устройстве — локальный старый черновик не восстановлен.')
      return
    }
    checkinBaselineRef.current=serverKnown?serverBaseline:saved.baseline
    checkinTouchedRef.current=true
    setDayMode(saved.dayMode)
    setAdherence(saved.adherence)
    setDeviation(saved.deviation)
    setActualCalories(saved.actualCalories)
    setActualProtein(saved.actualProtein)
    setActualFat(saved.actualFat??'')
    setActualCarbs(saved.actualCarbs??'')
    setShowActual(saved.showActual)
  }
  function restoreSetupRecovery(server:any,serverKnown=true){
    const serverBaseline=nutritionSetupSignature(server)
    const saved=readSetupRecovery()
    if(!saved){
      setupBaselineRef.current=serverBaseline
      return
    }
    if(serverKnown&&saved.baseline!==serverBaseline){
      clearSetupRecovery()
      setupBaselineRef.current=serverBaseline
      setNotice(current=>current||'Расчёт питания изменился на другом устройстве — локальный старый черновик не восстановлен.')
      return
    }
    setupBaselineRef.current=serverKnown?serverBaseline:saved.baseline
    setupTouchedRef.current=true
    setSetupForm(saved.form)
    setSetupOpen(true)
  }
  function patchSetupForm(patch:Partial<NutritionSetupForm>){
    setupTouchedRef.current=true
    setSetupForm(current=>({...current,...patch}))
  }
  function cancelSetupEdit(){
    setupTouchedRef.current=false
    clearSetupRecovery()
    if(setup)applyNutritionSetup(setup,latestMeasuredWeight)
    setSetupOpen(false)
  }

  function addLoadFailure(code:NutritionLoadFailure){
    setLoadFailures(current=>current.includes(code)?current:[...current,code])
  }

  function applyTodayCheckin(today:NutritionDailyCheckin|null,preserveDraft=false){
    setCheckin(today)
    if(!today||preserveDraft)return
    setAdherence(today.nutrition_adherence)
    setDayMode(today.nutrition_mode==='manual'?'manual':today.nutrition_adherence==='followed'?'plan':'deviation')
    setDeviation(today.nutrition_deviation)
    setActualCalories(today.calories==null?'':String(today.calories))
    setActualProtein(today.protein_g==null?'':String(today.protein_g))
    setActualFat(today.fat_g==null?'':String(today.fat_g))
    setActualCarbs(today.carbs_g==null?'':String(today.carbs_g))
    setShowActual(today.calories!=null || today.protein_g!=null || today.fat_g!=null || today.carbs_g!=null)
  }

  function applyNutritionSetup(nutritionSetup:any,latestWeight:number|null,profileHeight:number|null=bodyProfile?.height_cm??null){
    setSetup(nutritionSetup)
    setTrackingMode((nutritionSetup?.tracking_mode??'meal_plan') as 'meal_plan'|'calorie_tracking')
    if(nutritionSetup&&!setupOpen)setSetupForm({
      sex:nutritionSetup.sex_for_calculation,
      height:String(profileHeight??nutritionSetup.height_cm??''),
      weight:latestWeight==null&&nutritionSetup.weight_kg_used!=null?String(nutritionSetup.weight_kg_used):'',
      steps:String(nutritionSetup.average_steps),
      dailyActivity:nutritionSetup.daily_activity_level,
      strengthSessions:String(nutritionSetup.strength_sessions_per_week),
      strengthMinutes:String(nutritionSetup.strength_minutes_per_session),
      cardioSessions:String(nutritionSetup.cardio_sessions_per_week),
      cardioMinutes:String(nutritionSetup.cardio_minutes_per_session),
      cardioIntensity:nutritionSetup.cardio_intensity,
      goal:nutritionSetup.goal,
    })
    else if(!nutritionSetup&&!setupOpen&&profileHeight!=null)setSetupForm(current=>({...current,height:String(profileHeight)}))
  }

  useEffect(()=>{
    if(preview)return
    let cancelled=false
    setLoadFailures([])

    loadActiveNutritionPlan()
      .then(value=>{
        if(cancelled)return
        setPlan(value)
        setPlanLoaded(true)
      })
      .catch(()=>{
        if(cancelled)return
        setPlanLoaded(false)
        addLoadFailure('plan')
      })
      .finally(()=>{if(!cancelled)setPlanLoading(false)})

    loadTodayNutritionCheckin()
      .then(today=>{
        if(cancelled)return
        applyTodayCheckin(today)
        restoreCheckinRecovery(today,true)
      })
      .catch(()=>{
        if(cancelled)return
        addLoadFailure('checkin')
        restoreCheckinRecovery(null,false)
      })
      .finally(()=>{if(!cancelled)setLoading(false)})

    Promise.allSettled([loadMyNutritionSetup(),loadLatestWeightForNutrition(),loadMyProfile()])
      .then(([setupResult,weightResult,profileResult])=>{
        if(cancelled)return
        const failed:string[]=[]
        const nutritionSetup=setupResult.status==='fulfilled'?setupResult.value:null
        const latestWeight=weightResult.status==='fulfilled'?weightResult.value:null
        const profile=profileResult.status==='fulfilled'?profileResult.value:null
        if(profile)setBodyProfile({height_cm:profile.height_cm,wrist_cm:profile.wrist_cm,ankle_cm:profile.ankle_cm})

        if(setupResult.status==='fulfilled'){
          setSetupLoaded(true)
          applyNutritionSetup(nutritionSetup,latestWeight,profile?.height_cm??null)
          restoreSetupRecovery(nutritionSetup,true)
        }else {
          setSetupLoaded(false)
          restoreSetupRecovery(null,false)
          failed.push('setup')
        }

        if(weightResult.status==='fulfilled')setLatestMeasuredWeight(latestWeight)
        else failed.push('weight')

        failed.forEach(code=>addLoadFailure(code as NutritionLoadFailure))
      })

    loadMyNutritionTrend(14)
      .then(value=>{if(!cancelled){setNutritionTrend(value);setNutritionTrendError('')}})
      .catch(()=>{if(!cancelled)setNutritionTrendError('Не удалось загрузить статистику за последние 14 дней.')})

    return()=>{cancelled=true}
  },[preview])

  useEffect(()=>{
    if(!preview)return
    checkinBaselineRef.current=nutritionCheckinSignature(null)
    setupBaselineRef.current=nutritionSetupSignature(setup)
    restoreCheckinRecovery(null,true)
    restoreSetupRecovery(setup,true)
  },[preview])

  useEffect(()=>{
    if(!recoveryPersistenceEnabled||!checkinTouchedRef.current)return
    const draft:NutritionCheckinRecovery={
      version:1,date:appDateKey(),baseline:checkinBaselineRef.current,
      dayMode,adherence,deviation,actualCalories,actualProtein,actualFat,actualCarbs,showActual,
    }
    try{localStorage.setItem(checkinDraftKey(),JSON.stringify(draft))}catch{}
  },[recoveryPersistenceEnabled,dayMode,adherence,deviation,actualCalories,actualProtein,actualFat,actualCarbs,showActual])

  useEffect(()=>{
    if(!recoveryPersistenceEnabled||!setupTouchedRef.current)return
    const draft:NutritionSetupRecovery={version:1,baseline:setupBaselineRef.current,form:setupForm}
    try{localStorage.setItem(setupDraftKey(),JSON.stringify(draft))}catch{}
  },[recoveryPersistenceEnabled,setupForm])

  async function retryFailedNutritionLoads(){
    const pending=[...loadFailures]
    if(!pending.length)return
    const succeeded:NutritionLoadFailure[]=[]
    if(pending.includes('plan'))setPlanLoading(true)
    await Promise.all(pending.map(async code=>{
      try{
        if(code==='plan'){
          const value=await loadActiveNutritionPlan()
          setPlan(value);setPlanLoaded(true)
        }else if(code==='checkin'){
          const today=await loadTodayNutritionCheckin()
          const preserveDraft=checkinTouchedRef.current||dayMode!==null||adherence!==null||deviation!==null||showActual||actualCalories.trim()!==''||actualProtein.trim()!==''||actualFat.trim()!==''||actualCarbs.trim()!==''
          applyTodayCheckin(today,preserveDraft)
          if(!preserveDraft)restoreCheckinRecovery(today,true)
          else if(nutritionCheckinSignature(today)!==checkinBaselineRef.current)setNotice('Отметка питания изменилась на другом устройстве. Текущий локальный черновик оставлен на экране, но сохранение будет заблокировано до обновления.')
        }else if(code==='setup'){
          const nutritionSetup=await loadMyNutritionSetup()
          setSetupLoaded(true)
          applyNutritionSetup(nutritionSetup,latestMeasuredWeight)
          if(!setupTouchedRef.current)restoreSetupRecovery(nutritionSetup,true)
          else if(nutritionSetupSignature(nutritionSetup)!==setupBaselineRef.current)setNotice('Расчёт питания изменился на другом устройстве. Локальный черновик оставлен, но сначала обнови данные.')
        }else{
          const latestWeight=await loadLatestWeightForNutrition()
          if(!(setupOpen&&setupForm.weight.trim()))setLatestMeasuredWeight(latestWeight)
        }
        succeeded.push(code)
      }catch{}
    }))
    if(pending.includes('plan'))setPlanLoading(false)
    if(succeeded.length)setLoadFailures(current=>current.filter(code=>!succeeded.includes(code)))
  }

  const day=useMemo(()=>{
    if(!plan)return {kcal:0,protein:0,fat:0,carbs:0}
    return plan.meals.reduce((sum,meal)=>{
      const chosen=meal.variants.find(v=>v.id===selected[meal.id]) ?? meal.variants.find(v=>v.is_default) ?? meal.variants[0]
      if(!chosen)return sum
      const t=totals(chosen.items)
      return {kcal:sum.kcal+t.kcal,protein:sum.protein+t.protein,fat:sum.fat+t.fat,carbs:sum.carbs+t.carbs}
    },{kcal:0,protein:0,fat:0,carbs:0})
  },[plan,selected])

  async function switchTrackingMode(next:'meal_plan'|'calorie_tracking'){
    if(next===trackingMode||switchingMode)return
    if(next==='meal_plan'&&!plan){setNotice('Сначала нужен сохранённый Meal Plan.');return}
    setSwitchingMode(true);setNotice('')
    try{
      if(!preview)await setMyNutritionTrackingMode(next)
      setTrackingMode(next)
      setSetup((current:any)=>current?{...current,tracking_mode:next}:current)
      checkinTouchedRef.current=true
      if(next==='calorie_tracking'){
        setDayMode('manual')
        setAdherence(null)
        setDeviation(null)
        setShowActual(true)
        showAppToast('Подсчёт калорий включён. Meal Plan сохранён — к нему можно вернуться в любой момент.','info')
      }else{
        setDayMode(null)
        setAdherence(null)
        setDeviation(null)
        setShowActual(false)
        showAppToast('Meal Plan снова активен.')
      }
    }catch(e){
      if(!preview){
        try{
          const actual=await loadMyNutritionSetup()
          const actualMode=(actual?.tracking_mode??trackingMode) as 'meal_plan'|'calorie_tracking'
          if(actualMode===next){
            setTrackingMode(next)
            setSetup((current:any)=>current?{...current,tracking_mode:next}:actual)
            showAppToast(next==='meal_plan'?'Meal Plan уже активен.':'Подсчёт калорий уже включён.','info')
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось переключить режим питания')
    }
    finally{setSwitchingMode(false)}
  }

  async function saveCheckin(){
    const mode: 'meal_plan'|'manual'=trackingMode==='calorie_tracking'?'manual':(!plan||dayMode==='manual')?'manual':'meal_plan'
    if(trackingMode==='meal_plan'&&plan&&!dayMode){setNotice('Выбери, как сегодня питался.');return}
    if(mode==='manual'&&actualCalories.trim()===''){setNotice('При подсчёте калорий укажи калории за день.');return}
    const effectiveAdherence:NutritionDailyCheckin['nutrition_adherence']=dayMode==='plan'?'followed':dayMode==='deviation'?'partial':null
    if(dayMode==='deviation' && !deviation){setNotice('Укажи, как получилось относительно цели.');return}
    const calories=actualCalories.trim()===''?null:Number(actualCalories)
    const protein=actualProtein.trim()===''?null:Number(actualProtein)
    const fat=actualFat.trim()===''?null:Number(actualFat)
    const carbs=actualCarbs.trim()===''?null:Number(actualCarbs)
    const submitted={
      mode,
      adherence:mode==='meal_plan'?effectiveAdherence:null,
      deviation,
      calories:Number.isFinite(calories as number)?calories:null,
      protein_g:Number.isFinite(protein as number)?protein:null,
      fat_g:Number.isFinite(fat as number)?fat:null,
      carbs_g:Number.isFinite(carbs as number)?carbs:null,
      plan_id:mode==='meal_plan'?plan?.id??null:null,
    }
    const applySaved=(saved:NutritionDailyCheckin)=>{
      setCheckin(saved)
      checkinBaselineRef.current=nutritionCheckinSignature(saved)
      checkinTouchedRef.current=false
      clearCheckinRecovery()
      showAppToast('Питание за сегодня сохранено.')
    }
    setSavingCheckin(true);setNotice('')
    try{
      if(!preview){
        const latest=await loadTodayNutritionCheckin()
        if(nutritionCheckinSignature(latest)!==checkinBaselineRef.current){
          setCheckin(latest)
          setNotice('Отметка питания уже изменилась на другом устройстве. Твои введённые значения оставлены на экране; обнови страницу перед повторным сохранением.')
          return
        }
        await saveTodayNutritionCheckin(submitted)
      }
      applySaved({
        id:checkin?.id??'preview',checkin_date:appDateKey(),
        nutrition_mode:submitted.mode,nutrition_adherence:submitted.adherence,
        nutrition_deviation:submitted.deviation,calories:submitted.calories,
        protein_g:submitted.protein_g,fat_g:submitted.fat_g,carbs_g:submitted.carbs_g,nutrition_plan_id:submitted.plan_id,
      })
    }catch(e){
      if(!preview){
        try{
          const server=await loadTodayNutritionCheckin()
          const same=server
            && server.nutrition_mode===submitted.mode
            && server.nutrition_adherence===submitted.adherence
            && server.nutrition_deviation===submitted.deviation
            && server.calories===submitted.calories
            && server.protein_g===submitted.protein_g
            && server.fat_g===submitted.fat_g
            && server.carbs_g===submitted.carbs_g
            && server.nutrition_plan_id===submitted.plan_id
          if(same){applySaved(server);return}
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось сохранить')
    }
    finally{setSavingCheckin(false)}
  }

  async function calculateTarget(){
    const height=Number(setupForm.height)
    const manualWeight=setupForm.weight.trim()===''?null:Number(setupForm.weight.replace(',','.'))
    const steps=Number(setupForm.steps)
    const strengthSessions=Number(setupForm.strengthSessions)
    const strengthMinutes=Number(setupForm.strengthMinutes)
    const cardioSessions=Number(setupForm.cardioSessions)
    const cardioMinutes=Number(setupForm.cardioMinutes)
    if(!height||setupForm.steps.trim()===''){setNotice('Заполни рост и среднее число шагов.');return}
    if(latestMeasuredWeight==null&&(manualWeight==null||!Number.isFinite(manualWeight)||manualWeight<30||manualWeight>350)){setNotice('Укажи вес для расчёта от 30 до 350 кг.');return}
    if(!Number.isFinite(strengthSessions)||strengthSessions<0||strengthSessions>14){setNotice('Проверь число силовых тренировок.');return}
    if(strengthSessions>0&&(!strengthMinutes||strengthMinutes<15)){setNotice('Укажи среднюю длительность силовой тренировки.');return}
    if(!Number.isFinite(cardioSessions)||cardioSessions<0||cardioSessions>14){setNotice('Проверь число кардио-тренировок.');return}
    if(cardioSessions>0&&(!cardioMinutes||cardioMinutes<5)){setNotice('Укажи среднюю длительность кардио.');return}

    setSavingCheckin(true);setNotice('')
    try{
      if(!preview){
        const latestSetup=await loadMyNutritionSetup()
        if(nutritionSetupSignature(latestSetup)!==setupBaselineRef.current){
          setSetup(latestSetup)
          setNotice('Расчёт питания уже изменился на другом устройстве. Твои введённые значения оставлены на экране; обнови страницу перед повторным расчётом.')
          return
        }
      }
      if(!preview){
        const currentBody=bodyProfile??await loadMyProfile()
        if(currentBody.height_cm!==height){
          await saveMyBodyProfile({height_cm:height,wrist_cm:currentBody.wrist_cm,ankle_cm:currentBody.ankle_cm})
          setBodyProfile({height_cm:height,wrist_cm:currentBody.wrist_cm,ankle_cm:currentBody.ankle_cm})
        }
      }
      const result=await saveMyNutritionSetup({
        sex:setupForm.sex,
        height,
        weight:latestMeasuredWeight==null?manualWeight:null,
        steps,
        dailyActivity:setupForm.dailyActivity,
        strengthSessions,
        strengthMinutes:strengthMinutes||60,
        cardioSessions,
        cardioMinutes:cardioMinutes||30,
        cardioIntensity:setupForm.cardioIntensity,
        goal:setupForm.goal,
      })
      if(result){
        setSetup((current:any)=>({
          ...(current??{}),
          sex_for_calculation:setupForm.sex,
          height_cm:height,
          average_steps:steps,
          daily_activity_level:setupForm.dailyActivity,
          strength_sessions_per_week:strengthSessions,
          strength_minutes_per_session:strengthMinutes||60,
          cardio_sessions_per_week:cardioSessions,
          cardio_minutes_per_session:cardioMinutes||30,
          cardio_intensity:setupForm.cardioIntensity,
          goal:setupForm.goal,
          bmr_kcal:Number(result.bmr_kcal),
          activity_factor:Number(result.activity_factor),
          exercise_kcal_day:Number(result.exercise_kcal_day),
          weight_kg_used:Number(result.weight_kg_used),
          age_used:Number(result.age_used),
          estimated_maintenance_kcal:Number(result.maintenance_kcal),
          target_kcal:Number(result.target_kcal),
          estimated_weekly_change_kg:Number(result.estimated_weekly_change_kg),
          tracking_mode:current?.tracking_mode??trackingMode,
        }))
        if(!preview){
          try{
            const actual=await loadMyNutritionSetup()
            if(actual){
              setSetup(actual)
              setupBaselineRef.current=nutritionSetupSignature(actual)
            }
          }catch{
            setupBaselineRef.current=nutritionSetupSignature({
              sex_for_calculation:setupForm.sex,height_cm:height,weight_kg_used:latestMeasuredWeight??manualWeight,
              average_steps:steps,daily_activity_level:setupForm.dailyActivity,
              strength_sessions_per_week:strengthSessions,strength_minutes_per_session:strengthMinutes||60,
              cardio_sessions_per_week:cardioSessions,cardio_minutes_per_session:cardioMinutes||30,
              cardio_intensity:setupForm.cardioIntensity,goal:setupForm.goal,
            })
          }
        }
        setupTouchedRef.current=false
        clearSetupRecovery()
        setSetupOpen(false)
        showAppToast('Стартовая калорийность рассчитана. Уточняй её по средней динамике веса за 2–3 недели.','info')
      }
    }catch(e){
      if(!preview){
        try{
          const actual=await loadMyNutritionSetup()
          const sameInput=actual
            && actual.sex_for_calculation===setupForm.sex
            && Number(actual.height_cm)===height
            && Number(actual.average_steps)===steps
            && actual.daily_activity_level===setupForm.dailyActivity
            && Number(actual.strength_sessions_per_week)===strengthSessions
            && Number(actual.strength_minutes_per_session)===Number(strengthMinutes||60)
            && Number(actual.cardio_sessions_per_week)===cardioSessions
            && Number(actual.cardio_minutes_per_session)===Number(cardioMinutes||30)
            && actual.cardio_intensity===setupForm.cardioIntensity
            && actual.goal===setupForm.goal
          if(sameInput){
            setSetup(actual)
            setTrackingMode((actual.tracking_mode??trackingMode) as 'meal_plan'|'calorie_tracking')
            setupBaselineRef.current=nutritionSetupSignature(actual)
            setupTouchedRef.current=false
            clearSetupRecovery()
            setSetupOpen(false)
            showAppToast('Расчёт уже был сохранён на сервере.','info')
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось рассчитать калорийность')
    }
    finally{setSavingCheckin(false)}
  }

  async function openSelfBuilder(){
    setBuilderOpen(true)
    if(foods.length||preview||!supabase)return

    let authUser
    try{authUser=await getVerifiedUser()}catch{setNotice('Не удалось определить пользователя.');return}

    const [{data,error},{data:prefs,error:prefError}]=await Promise.all([
      supabase.from('foods')
        .select('id,name,kcal_100,protein_100,fat_100,carbs_100,default_portion_g,weighing_method,food_group,popularity_rank')
        .eq('is_active',true).order('popularity_rank').order('name'),
      supabase.from('client_food_preferences')
        .select('food_id,selected,preference').eq('client_id',authUser.id),
    ])

    if(error||prefError){
      const loadError=error||prefError
      setNotice(loadError?.message?('Не удалось загрузить список продуктов: '+loadError.message):'Не удалось загрузить список продуктов.')
      return
    }

    setFoods(data??[])
    setChosenFoods((prefs??[])
      .filter((x:any)=>Boolean(x.selected)||x.preference==='preferred')
      .map((x:any)=>x.food_id))
    setOpenFoodGroups(['meat'])
  }

  async function toggleFood(foodId:string){
    if(foodSavingRef.current.has(foodId))return
    foodSavingRef.current.add(foodId)
    setFoodSavingIds(ids=>[...ids,foodId])
    const on=!chosenFoods.includes(foodId)
    setChosenFoods(v=>on?(v.includes(foodId)?v:[...v,foodId]):v.filter(id=>id!==foodId))
    if(preview||!supabase){
      foodSavingRef.current.delete(foodId)
      setFoodSavingIds(ids=>ids.filter(id=>id!==foodId))
      return
    }

    let authUser
    try{authUser=await getVerifiedUser()}
    catch{
      setChosenFoods(v=>on?v.filter(id=>id!==foodId):[...v,foodId])
      setNotice('Не удалось определить пользователя.')
      return
    }

    const {error}=await supabase.from('client_food_preferences').upsert({
      client_id:authUser.id,
      food_id:foodId,
      selected:on,
      preference:on?'preferred':'allowed',
      is_enabled:true,
      updated_at:new Date().toISOString(),
    },{onConflict:'client_id,food_id'})

    if(error){
      let savedDespiteError=false
      try{
        const {data:actual}=await supabase.from('client_food_preferences')
          .select('selected,preference,is_enabled')
          .eq('client_id',authUser.id).eq('food_id',foodId).maybeSingle()
        savedDespiteError=Boolean(actual&&actual.is_enabled&&Boolean(actual.selected)===on&&(on?actual.preference==='preferred':true))
      }catch{}
      if(!savedDespiteError){
        setChosenFoods(v=>on?v.filter(id=>id!==foodId):(v.includes(foodId)?v:[...v,foodId]))
        setNotice('Не удалось сохранить выбор продукта.')
      }
    }
    foodSavingRef.current.delete(foodId)
    setFoodSavingIds(ids=>ids.filter(id=>id!==foodId))
  }

  function toggleFoodGroup(key:FoodGroupKey){
    setOpenFoodGroups(current=>current.includes(key)?current.filter(item=>item!==key):[...current,key])
  }

  async function continueToMealPlan(){
    if(!chosenFoods.length){setNotice('Выбери хотя бы один любимый продукт.');return}
    setCreatingPlan(true);setNotice('')
    try{
      if(preview){
        setPlan(previewPlan)
        setBuilderOpen(false)
        return
      }
      await createMyMealPlan(mealCount,chosenFoods)
      const activePlan=await loadActiveNutritionPlan()
      if(!activePlan)throw new Error('Meal Plan создан, но не удалось его загрузить.')
      setPlan(activePlan)
      try{
        await setMyNutritionTrackingMode('meal_plan')
        setTrackingMode('meal_plan')
        setSetup((current:any)=>current?{...current,tracking_mode:'meal_plan'}:current)
        setBuilderOpen(false)
        showAppToast('Meal Plan создан и включён.')
      }catch(e){
        setBuilderOpen(false)
        setNotice('Meal Plan создан и сохранён, но не удалось включить режим Meal Plan: '+(e instanceof Error?e.message:'ошибка переключения')+'. Сам план не потерян.')
      }
    }catch(e){
      if(!preview){
        try{
          const activePlan=await loadActiveNutritionPlan()
          if(activePlan){
            setPlan(activePlan)
            setBuilderOpen(false)
            try{
              await setMyNutritionTrackingMode('meal_plan')
              setTrackingMode('meal_plan')
              setSetup((current:any)=>current?{...current,tracking_mode:'meal_plan'}:current)
              showAppToast('Meal Plan уже был создан — продолжаем с ним.','info')
            }catch{
              setNotice('Meal Plan уже создан, но режим Meal Plan пока не удалось включить. Повторно создавать план не нужно.')
            }
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось создать Meal Plan')
    }finally{
      setCreatingPlan(false)
    }
  }

  useEffect(()=>{
    if(trackingMode!=='calorie_tracking'||nutritionTrend.length===0)return
    const id=window.requestAnimationFrame(()=>{
      const node=nutritionTrendScrollRef.current
      if(node)node.scrollLeft=node.scrollWidth
    })
    return()=>window.cancelAnimationFrame(id)
  },[trackingMode,nutritionTrend])

  const builderCatalogFoods=useMemo(()=>foods.map(food=>({
    ...food,
    default_portion_g:food.default_portion_g??null,
    source:'global' as const,
    favorite:chosenFoods.includes(food.id),
    usage_count:0,
    last_used_at:null,
  })),[foods,chosenFoods])

  const trendNutritionDays=nutritionTrend.slice(-14)
  const recentNutritionDays=trendNutritionDays.slice(-7)
  const calorieDays=recentNutritionDays.filter(day=>day.calories!=null)
  const proteinDays=recentNutritionDays.filter(day=>day.protein_g!=null)
  const avgCalories=calorieDays.length?Math.round(calorieDays.reduce((sum,day)=>sum+(day.calories as number),0)/calorieDays.length):null
  const avgProtein=proteinDays.length?Math.round(proteinDays.reduce((sum,day)=>sum+(day.protein_g as number),0)/proteinDays.length):null
  const weightSummary=summarizeWeeklyWeights(nutritionTrend.map(day=>({measured_at:day.date,weight_kg:day.weight_kg})),appDateKey())
  const weeklyWeightDelta=weightSummary.currentCount>=3&&weightSummary.previousCount>=3&&weightSummary.currentAverage!=null&&weightSummary.previousAverage!=null
    ? weightSummary.currentAverage-weightSummary.previousAverage
    : null
  const waistEntries=nutritionTrend.filter(day=>day.waist_cm!=null)
  const latestWaistTrend=waistEntries.at(-1)?.waist_cm??null
  const previousWaistTrend=waistEntries.length>1?waistEntries[0]?.waist_cm??null:null
  const waistDelta=latestWaistTrend!=null&&previousWaistTrend!=null?latestWaistTrend-previousWaistTrend:null
  if(loading)return <div className="library-empty">Загружаю питание…</div>

  return <UiStack className="client-nutrition-page">
    {loadFailures.length>0&&<UiLoadError
      message={'Часть данных питания не загрузилась: '+loadFailures.map(code=>nutritionLoadLabels[code]).join(', ')+'.'}
      hint="Уже введённые значения останутся на месте; повторим только неудавшиеся запросы."
      onRetry={()=>void retryFailedNutritionLoads()}
      retryLabel="Повторить загрузку"
    />}
    {planLoaded&&plan&&<section className="panel nutrition-tracking-mode-card is-compact">
      <div className="nutrition-tracking-mode-copy">
        <span className="eyebrow">Режим питания</span>
        <h3>{trackingMode==='meal_plan'?'Meal Plan':'Подсчёт калорий'}</h3>
        <small>{trackingMode==='calorie_tracking'?'Meal Plan сохранён и доступен для возврата.':'План остаётся сохранён при смене режима.'}</small>
      </div>
      <div className="nutrition-tracking-mode-actions">
        {trackingMode==='meal_plan'
          ? <button type="button" className="ghost-button compact" disabled={switchingMode} onClick={()=>void switchTrackingMode('calorie_tracking')}>{switchingMode?'Переключаю…':'Считать калории'}</button>
          : <button type="button" className="primary-button compact" disabled={switchingMode} onClick={()=>void switchTrackingMode('meal_plan')}>{switchingMode?'Возвращаю…':'Вернуть Meal Plan'}</button>}
      </div>
    </section>}

    <section className="nutrition-checkin-card">
      <div className="nutrition-checkin-copy">
        <span className="eyebrow">Сегодня</span>
        <h3>{planLoading?'Загружаю Meal Plan…':!planLoaded?'Meal Plan временно недоступен':trackingMode==='calorie_tracking'?'Что получилось по калориям?':plan?'Как сегодня питался?':'Что получилось по питанию?'}</h3>
        <p>{planLoading?'Основной экран уже доступен, сам план догружается отдельно.':!planLoaded?'Можно пользоваться доступными функциями; Meal Plan попробуй открыть чуть позже.':trackingMode==='calorie_tracking'?'Укажи калории за день; белок можно добавить по желанию. Meal Plan при этом остаётся сохранённым.':plan?'План остаётся ориентиром. Выбери способ отчёта за сегодня — пересчитывать рацион каждый день не нужно.':'Если считаешь питание самостоятельно, достаточно указать ккал и белок.'}</p>
      </div>

      {planLoaded&&plan&&trackingMode==='meal_plan' ? <div className="adherence-buttons nutrition-mode-buttons">
        {[
          ['plan','По плану'],
          ['deviation','С отклонениями'],
          ['manual','Считал калории'],
        ].map(([value,label])=><button key={value} className={dayMode===value?'is-active':''} onClick={()=>{
          const next=value as 'plan'|'deviation'|'manual'
          checkinTouchedRef.current=true
          setDayMode(next)
          if(next==='plan'){setAdherence('followed');setDeviation('about_target');setShowActual(false)}
          else if(next==='deviation'){setAdherence('partial');setDeviation(null);setShowActual(false)}
          else {setAdherence(null);setDeviation(null);setShowActual(true)}
        }}>{label}</button>)}
      </div> : null}

      {plan&&trackingMode==='meal_plan'&&dayMode==='deviation' && <div className="nutrition-deviation-block">
        <span>По калориям получилось</span>
        <div className="nutrition-deviation-buttons">
          {[
            ['about_target','Примерно в цель'],
            ['over','Больше цели'],
            ['under','Меньше цели'],
            ['unknown','Не знаю'],
          ].map(([value,label])=><button key={value} className={deviation===value?'is-active':''} onClick={()=>{
            checkinTouchedRef.current=true
            setDeviation(value as NutritionDailyCheckin['nutrition_deviation'])
          }}>{label}</button>)}
        </div>
        {!showActual && <button className="text-button" onClick={()=>{checkinTouchedRef.current=true;setShowActual(true)}}>Знаю цифры — указать КБЖУ</button>}
      </div>}

      {planLoaded&&(trackingMode==='calorie_tracking'||!plan||dayMode==='manual'||showActual) && <div className="nutrition-actual-fields">
        <label><span>Ккал{(trackingMode==='calorie_tracking'||!plan||dayMode==='manual')?' *':''}</span><input className={trackingMode==='calorie_tracking'||!plan||dayMode==='manual'?'is-required':''} type="number" min="0" step="10" value={actualCalories} onChange={e=>{checkinTouchedRef.current=true;setActualCalories(e.target.value)}} placeholder={trackingMode==='calorie_tracking'||!plan||dayMode==='manual'?'обязательно':'необязательно'}/></label>
        <label><span>Белок, г</span><input type="number" min="0" step="1" value={actualProtein} onChange={e=>{checkinTouchedRef.current=true;setActualProtein(e.target.value)}} placeholder="необязательно"/></label>
        <label><span>Жиры, г</span><input type="number" min="0" step="1" value={actualFat} onChange={e=>{checkinTouchedRef.current=true;setActualFat(e.target.value)}} placeholder="необязательно"/></label>
        <label><span>Углеводы, г</span><input type="number" min="0" step="1" value={actualCarbs} onChange={e=>{checkinTouchedRef.current=true;setActualCarbs(e.target.value)}} placeholder="необязательно"/></label>
      </div>}

      <div className="nutrition-checkin-actions">

        <button className="primary-button compact" disabled={savingCheckin||planLoading||!planLoaded} onClick={()=>void saveCheckin()}><Save size={14}/>{checkin?'Обновить':'Сохранить'}</button>
      </div>
    </section>

    {trackingMode==='calorie_tracking'&&<section className="panel nutrition-trend-panel">
      <div className="panel-head"><div><span className="eyebrow">Связь питания и прогресса</span><h3>Последние 7 дней</h3></div></div>
      <p className="panel-description">Сначала смотри на средние за неделю, а ниже сопоставляй конкретные дни. Вес и талия могут шуметь, поэтому выводы лучше делать по тренду за 2–3 недели.</p>
      {nutritionTrendError?<UiNotice tone="warning">{nutritionTrendError}</UiNotice>:<>
        <div className="nutrition-trend-summary">
          <div><span>Цель</span><strong>{setup?.target_kcal?Math.round(setup.target_kcal)+' ккал':'—'}</strong><small>текущая калорийность</small></div>
          <div><span>Среднее фактически</span><strong>{avgCalories==null?'—':avgCalories+' ккал'}</strong><small>{calorieDays.length?'по '+calorieDays.length+' внесённым дням':'нет записей'}</small></div>
          <div><span>Белок в среднем</span><strong>{avgProtein==null?'—':avgProtein+' г'}</strong><small>{proteinDays.length?'по '+proteinDays.length+' внесённым дням':'нет записей'}</small></div>
          <div><span>Вес · тренд недели</span><strong>{weeklyWeightDelta==null?'—':(weeklyWeightDelta>0?'+':'')+weeklyWeightDelta.toFixed(2).replace('.',',')+' кг'}</strong><small>{weeklyWeightDelta==null?'нужно ≥3 замеров в обе недели':'по среднему весу'}</small></div>
          <div><span>Талия</span><strong>{latestWaistTrend==null?'—':latestWaistTrend.toFixed(1).replace('.',',')+' см'}</strong><small>{waistDelta==null?'последний замер':(waistDelta>0?'+':'')+waistDelta.toFixed(1).replace('.',',')+' см за 14 дней'}</small></div>
        </div>

        <div className="nutrition-trend-scroll-hint">Листай по дням →</div>
        <div className="nutrition-trend-matrix-scroll" ref={nutritionTrendScrollRef} aria-label="Питание, вес и талия по дням">
          <div className="nutrition-trend-matrix">
            <div className="nutrition-trend-corner">Показатель</div>
            {trendNutritionDays.map(day=>{
              const date=new Date(day.date+'T00:00:00')
              const weekday=date.toLocaleDateString('ru-RU',{weekday:'short'}).replace('.','')
              const label=date.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})
              return <div className={'nutrition-trend-date'+(day.date===appDateKey()?' is-today':'')+(weekday==='пн'?' is-week-start':'')} key={'date-'+day.date}>
                <strong>{weekday}</strong><span>{label}</span>
              </div>
            })}

            <div className="nutrition-trend-row-label">Ккал</div>
            {trendNutritionDays.map(day=>{
              const value=day.calories
              const target=setup?.target_kcal?Number(setup.target_kcal):null
              const fill=value!=null&&target?Math.min(100,Math.max(10,value/target*100)):0
              return <div className={'nutrition-trend-cell'+(value!=null?' has-value':'')} key={'kcal-'+day.date}>
                {value==null?<span>—</span>:<><strong>{Math.round(value)}</strong><i className="nutrition-trend-cell-bar" style={{width:fill+'%'}}/></>}
              </div>
            })}

            <div className="nutrition-trend-row-label">Белок</div>
            {trendNutritionDays.map(day=><div className={'nutrition-trend-cell'+(day.protein_g!=null?' has-value':'')} key={'protein-'+day.date}>
              {day.protein_g==null?<span>—</span>:<><strong>{Math.round(day.protein_g)} г</strong><i className="nutrition-trend-cell-dot"/></>}
            </div>)}

            <div className="nutrition-trend-row-label">Вес</div>
            {trendNutritionDays.map(day=><div className={'nutrition-trend-cell nutrition-trend-cell--body'+(day.weight_kg!=null?' has-value':'')} key={'weight-'+day.date}>
              {day.weight_kg==null?<span>—</span>:<strong>{day.weight_kg.toFixed(1).replace('.',',')}</strong>}
            </div>)}

            <div className="nutrition-trend-row-label">Талия</div>
            {trendNutritionDays.map(day=><div className={'nutrition-trend-cell nutrition-trend-cell--body'+(day.waist_cm!=null?' has-value':'')} key={'waist-'+day.date}>
              {day.waist_cm==null?<span>—</span>:<strong>{day.waist_cm.toFixed(1).replace('.',',')}</strong>}
            </div>)}
          </div>
        </div>
        <div className="nutrition-trend-legend"><span>Ккал и белок — ежедневные записи</span><span>Вес и талия — только в дни замеров</span></div>
      </>}
    </section>}

    {!planLoaded||!setupLoaded ? null : trackingMode==='calorie_tracking'&&plan ? <>
      <section className="panel nutrition-calorie-mode">
        <div className="panel-head"><div><span className="eyebrow">Подсчёт калорий</span><h3>{setup?.target_kcal?setup.target_kcal+' ккал / день':'Текущая цель'}</h3></div></div>
        <p className="panel-description">Сейчас Meal Plan не используется как ежедневный сценарий. Записывай фактические калории и при желании белок, жиры и углеводы в карточке «Сегодня» выше.</p>
        <div className="nutrition-saved-plan">
          <div><span>Сохранённый Meal Plan</span><strong>{plan.name}</strong><small>Версия {plan.version} · {plan.daily_kcal_target} ккал</small></div>
          <button type="button" className="primary-button compact" disabled={switchingMode} onClick={()=>void switchTrackingMode('meal_plan')}>Вернуть план</button>
        </div>
      </section>

      {notice&&<UiNotice tone="warning">{notice}</UiNotice>}
    </> : !plan ? <>
      <section className="panel nutrition-self-start">
        <div className="panel-head"><div><span className="eyebrow">Meal Plan</span><h3>{setup?'Твоя стартовая цель — '+setup.target_kcal+' ккал':'Сначала рассчитаем стартовую калорийность'}</h3></div></div>
        <p className="panel-description">{setup?'Это стартовая оценка расхода, а не «вечная» цифра. Проверяем её по фактической динамике веса и при необходимости корректируем.':'Калькулятор использует последний вес из «Прогресса», возраст из профиля, рост, обычную активность, шаги, силовые и кардио.'}</p>

        {setup&&<div className="nutrition-target-summary">
          {setup.bmr_kcal!=null&&<div><span>Основной обмен</span><strong>≈ {setup.bmr_kcal}</strong><small>ккал / день</small></div>}
          <div><span>Поддержание</span><strong>≈ {setup.estimated_maintenance_kcal}</strong><small>ккал / день</small></div>
          <div className="is-target"><span>Твоя цель</span><strong>{setup.target_kcal}</strong><small>ккал / день</small></div>
          {setup.estimated_weekly_change_kg!=null&&Math.abs(setup.estimated_weekly_change_kg)>0.01&&<div><span>Расчётный темп</span><strong>{setup.estimated_weekly_change_kg>0?'+':''}{setup.estimated_weekly_change_kg}</strong><small>кг / неделю*</small></div>}
        </div>}
        {setup&&<p className="nutrition-method-note">* Очень приблизительная стартовая оценка. Формула: Mifflin–St Jeor + повседневная активность и шаги + отдельный учёт силовых и кардио. Реальный расход лучше уточнять по 2–3 неделям наблюдений.</p>}

        {!setupOpen&&<button className="primary-button compact" onClick={()=>setSetupOpen(true)}>{setup?'Изменить расчёт':'Рассчитать мою норму'}</button>}
        {setupOpen&&<div className="nutrition-setup-form">
          <div className="nutrition-setup-section-title"><strong>Основные данные</strong><span>Возраст берём из профиля. Вес — из последнего замера, а если его нет, можно указать здесь.</span></div>
          <label>Пол для расчёта<select value={setupForm.sex} onChange={e=>patchSetupForm({sex:e.target.value as 'male'|'female'})}><option value="male">Мужской</option><option value="female">Женский</option></select></label>
          <label>Рост, см<input inputMode="decimal" value={setupForm.height} onChange={e=>patchSetupForm({height:e.target.value})} placeholder="Например, 175"/></label>
          {latestMeasuredWeight!=null
            ? <div className="nutrition-weight-source"><span>Вес для расчёта</span><strong>{latestMeasuredWeight.toFixed(1).replace('.',',')} кг</strong><small>Берём последний вес из «Прогресса».</small></div>
            : <label>Вес, кг<input inputMode="decimal" value={setupForm.weight} onChange={e=>patchSetupForm({weight:e.target.value})} placeholder="Например, 70"/><small>Нужен только для расчёта. Как замер в «Прогресс» не сохраняется.</small></label>}

          <div className="nutrition-setup-section-title"><strong>Повседневная активность</strong><span>Без тренировок — их считаем отдельно, чтобы не задвоить расход.</span></div>
          <label className="nutrition-setup-wide">Обычный день<select value={setupForm.dailyActivity} onChange={e=>patchSetupForm({dailyActivity:e.target.value as DailyActivityLevel})}>{ACTIVITY_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select><small>{ACTIVITY_OPTIONS.find(option=>option.value===setupForm.dailyActivity)?.hint}</small></label>
          <label>Шагов в обычный день<input inputMode="numeric" value={setupForm.steps} onChange={e=>patchSetupForm({steps:e.target.value})} placeholder="Например, 7000"/><small>Если отдельное кардио считаешь ниже, его шаги лучше сюда не добавлять.</small></label>

          <div className="nutrition-setup-section-title"><strong>Силовые</strong><span>Считаем отдельно от обычной дневной активности.</span></div>
          <label>Тренировок / неделю<input type="number" min="0" max="14" value={setupForm.strengthSessions} onChange={e=>patchSetupForm({strengthSessions:e.target.value})}/></label>
          <label>Средняя длительность, мин<input type="number" min="15" max="240" disabled={Number(setupForm.strengthSessions)===0} value={setupForm.strengthMinutes} onChange={e=>patchSetupForm({strengthMinutes:e.target.value})}/></label>

          <div className="nutrition-setup-section-title"><strong>Кардио</strong><span>Бег, велосипед, эллипс, плавание и другие отдельные кардио-сессии.</span></div>
          <label>Сессий / неделю<input type="number" min="0" max="14" value={setupForm.cardioSessions} onChange={e=>patchSetupForm({cardioSessions:e.target.value})}/></label>
          <label>Средняя длительность, мин<input type="number" min="5" max="300" disabled={Number(setupForm.cardioSessions)===0} value={setupForm.cardioMinutes} onChange={e=>patchSetupForm({cardioMinutes:e.target.value})}/></label>
          <label className="nutrition-setup-wide">Интенсивность<select disabled={Number(setupForm.cardioSessions)===0} value={setupForm.cardioIntensity} onChange={e=>patchSetupForm({cardioIntensity:e.target.value as CardioIntensity})}>{CARDIO_INTENSITY_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>

          <div className="nutrition-setup-section-title"><strong>Цель</strong><span>Чем агрессивнее режим, тем важнее дальше сверять расчёт с реальной динамикой.</span></div>
          <label className="nutrition-setup-wide">Темп<select value={setupForm.goal} onChange={e=>patchSetupForm({goal:e.target.value as NutritionGoal})}>{GOAL_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label} · {option.delta}</option>)}</select></label>
          <div className="nutrition-setup-actions"><button className="ghost-button" onClick={cancelSetupEdit}>Отмена</button><button className="primary-button compact" disabled={savingCheckin} onClick={()=>void calculateTarget()}>{savingCheckin?'Считаю…':'Рассчитать'}</button></div>
        </div>}
        {setup&&<div className="nutrition-start-actions"><button className="primary-button compact" onClick={()=>void openSelfBuilder()}>Собрать свой Meal Plan</button></div>}
      </section>
{setup&&builderOpen&&<section className="panel self-meal-builder">
        <span className="eyebrow">Шаг 1</span><h3>Как тебе удобно питаться?</h3>
        <p className="panel-description">Выбери число приёмов пищи. Дальше распределим между ними твою цель {setup.target_kcal} ккал.</p>
        <div className="meal-count-picker">{[2,3,4,5].map(n=><button key={n} className={mealCount===n?'is-active':''} onClick={()=>setMealCount(n)}>{n}</button>)}</div>
        <span className="eyebrow self-food-step">Шаг 2</span><h3>Что ты обычно ешь?</h3>
        <p className="panel-description">Нажми на продукт — он сразу станет выбранным и любимым. Повторный клик убирает выбор. Любимые остаются внутри своих категорий.</p>

        <div className="self-food-search">
          <FoodCombobox
            foods={builderCatalogFoods}
            placeholder="Найти среди всех продуктов…"
            onSelect={food=>void toggleFood(food.id)}
          />
          <small>Поиск идёт по всему справочнику, даже по скрытым категориям.</small>
        </div>

        <div className="self-food-categories">
          {visibleFoodGroups.map(key=>{
            const meta=FOOD_GROUPS.find(g=>g.key===key)
            const group=foods.filter(f=>f.food_group===key)
            if(!meta||!group.length)return null
            const orderedGroup=[...group.filter(f=>chosenFoods.includes(f.id)),...group.filter(f=>!chosenFoods.includes(f.id))]
            const selectedCount=group.filter(f=>chosenFoods.includes(f.id)).length
            const open=openFoodGroups.includes(key)
            return <div className={'self-food-category '+(open?'is-open':'')} key={key}>
              <div className="self-food-category-head">
                <button className="self-food-category-toggle" onClick={()=>toggleFoodGroup(key)}>
                  <div><strong>{meta.label}</strong><span>Выбрано {selectedCount} из {group.length}</span></div>
                  <ChevronDown size={18}/>
                </button>
              </div>
              {open&&<div className="self-food-chips">{orderedGroup.map(f=>{
                const selected=chosenFoods.includes(f.id)
                return <button className={'self-food-chip-select whole '+(selected?'is-selected':'')} key={f.id} disabled={foodSavingIds.includes(f.id)} onClick={()=>void toggleFood(f.id)}>
                  <span>{f.name}</span>
                  <small>{selected&&<Star size={13}/>} {Math.round(Number(f.kcal_100))} ккал</small>
                </button>
              })}</div>}
            </div>
          })}
        </div>

        <div className="self-builder-summary"><span>{mealCount} приёма пищи · выбрано продуктов: {chosenFoods.length}</span><button className="primary-button compact" disabled={!chosenFoods.length||creatingPlan} onClick={()=>void continueToMealPlan()}>{creatingPlan?'Собираю Meal Plan…':'Продолжить'}</button></div>
      </section>}
            {notice&&<div className="drawer-notice">{notice}</div>}
    </> : <>
      <section className="nutrition-client-hero">
        <div><span className="eyebrow light">Меню-план · версия {plan.version}</span><h2>{plan.name}</h2><p>{plan.description||'Ориентир на день — выбирай удобный вариант каждого приёма.'}</p></div>
        <div className="nutrition-client-target"><strong>{plan.daily_kcal_target}</strong><span>ккал / день</span></div>
      </section>

      <div className="nutrition-plan-actions">
        <div><strong>{plan.free_kcal_target||'—'}{plan.free_kcal_target?' ккал':''}</strong><span>{plan.free_kcal_target?'свободный резерв':'свободный резерв ещё не задан'}</span></div>
        <button className="primary-button compact" onClick={()=>setPlanEditorOpen(true)}><SlidersHorizontal size={15}/>Редактировать Meal Plan</button>
      </div>

      {planEditorOpen&&<ClientMealPlanEditor
        plan={plan}
        preview={preview}
        onClose={()=>setPlanEditorOpen(false)}
        reloadPlan={loadActiveNutritionPlan}
        onSaved={next=>{setPlan(next);setSelected({});showAppToast('Meal Plan обновлён. Новая версия активна.')}}
      />}

      <section className="nutrition-client-macros">
        <div><span>По выбранным вариантам</span><strong>≈ {Math.round(day.kcal)} ккал</strong></div>
        <div><span>Свободно</span><strong>{plan.free_kcal_target||0} ккал</strong></div>
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
  </UiStack>
}
