import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowLeft, Check, ChevronRight, Clock3, Dumbbell, Info, MessageCircle,
  Minus, Play, Plus, RefreshCcw, Repeat2, TimerReset, X
} from 'lucide-react'
import {
  addWorkoutComment, completeCardioEntry, completeWorkout, completeWorkoutExercise, deleteWorkoutSet, loadActiveTrainingPlan,
  loadInProgressWorkout, loadWorkout, replaceWorkoutExercise, saveWorkoutSet, startWorkout
} from '../features/workouts/service'
import type {
  ActiveTrainingPlan, LiveWorkout, LiveWorkoutExercise, WorkoutSetRecord
} from '../features/workouts/types'
import { estimateOneRepMax, normalizeDecimalInput, parseDecimal } from '../lib/numberInput'
import { CoachHint } from '../components/CoachHint'

type Props = { preview: boolean }

type SetDraft = {
  weight:string
  reps:string
  rir:number | null
  isWarmup:boolean
  completed:boolean
  completedAt:string | null
}

type SheetState =
  | {type:'technique';exercise:LiveWorkoutExercise}
  | {type:'comment';exercise:LiveWorkoutExercise}
  | {type:'replace';exercise:LiveWorkoutExercise}
  | null

const previewPlan: ActiveTrainingPlan = {
  id:'preview-plan',
  name:'Full Body',
  description:'Две силовые тренировки в неделю. Между тренировками — минимум 48 часов.',
  weekly_frequency:2,
  sessions:[
    {id:'preview-day',name:'Full Body',session_type:'mixed',planned_duration_minutes:70,notes:null},
    {id:'preview-cardio',name:'Кардио',session_type:'cardio',planned_duration_minutes:30,notes:null},
  ],
}

const previewWorkout: LiveWorkout = {
  id:'preview-workout',
  program_name:'Full Body',
  session_name:'Full Body',
  session_type:'mixed',
  started_at:new Date().toISOString(),
  status:'in_progress',
  exercises:[
    {
      id:'we-press',exercise_id:'ex-press',name:'Жим гантелей на наклонной скамье',
      instructions:'Сведи лопатки, уверенно упрись стопами. Опускай гантели под контролем и не проваливай плечо.',
      technique_url:null,image_url:null,primary_muscle:'chest',sort_order:10,prescribed_sets:3,
      reps_min:8,reps_max:12,rir_min:1,rir_max:2,rir_enabled:true,rest_seconds:180,
      allow_substitution:true,substitution_group_id:'sg-press',substitution_policy:'strict',exercise_role:'main',
      trainer_notes:'Не уходи чрезмерно глубоко в нижней точке.',completed_at:null,
      sets:[],previous_sets:[
        {set_number:1,weight_kg:30,reps:10,rir:2},
        {set_number:2,weight_kg:30,reps:9,rir:1},
        {set_number:3,weight_kg:28,reps:11,rir:1},
      ],
      substitution_options:[
        {id:'alt-1',name:'Жим штанги на наклонной скамье'},
        {id:'alt-2',name:'Наклонный жим в машине Смита'},
      ],
    },
    {
      id:'we-row',exercise_id:'ex-row',name:'Горизонтальная тяга в блочном тренажёре',
      instructions:'Сохраняй нейтральную поясницу. Тяни локти назад, а не плечи вверх.',
      technique_url:null,image_url:null,primary_muscle:'back',sort_order:20,prescribed_sets:3,
      reps_min:8,reps_max:12,rir_min:1,rir_max:2,rir_enabled:true,rest_seconds:150,
      allow_substitution:true,substitution_group_id:'sg-row',substitution_policy:'flexible',exercise_role:'main',
      trainer_notes:null,completed_at:null,sets:[],previous_sets:[
        {set_number:1,weight_kg:55,reps:12,rir:2},
        {set_number:2,weight_kg:55,reps:11,rir:1},
        {set_number:3,weight_kg:55,reps:10,rir:1},
      ],
      substitution_options:[{id:'alt-3',name:'Тяга гантели одной рукой'}],
    },
    {
      id:'we-leg',exercise_id:'ex-leg',name:'Жим ногами',
      instructions:'Колени по линии носков, таз не отрывай от спинки.',
      technique_url:null,image_url:null,primary_muscle:'quads',sort_order:30,prescribed_sets:3,
      reps_min:10,reps_max:15,rir_min:1,rir_max:2,rir_enabled:true,rest_seconds:180,
      allow_substitution:false,substitution_group_id:null,substitution_policy:'strict',exercise_role:'accessory',
      trainer_notes:null,completed_at:null,sets:[],previous_sets:[
        {set_number:1,weight_kg:120,reps:14,rir:2},
        {set_number:2,weight_kg:120,reps:12,rir:1},
        {set_number:3,weight_kg:120,reps:11,rir:1},
      ],
      substitution_options:[],
    },
  ],
  cardio:[
    {
      id:'wc-1',modality_code:'treadmill',modality_name:'Беговая дорожка',
      name:null,sort_order:100,prescribed_duration_minutes:15,prescribed_hr_min:120,
      prescribed_hr_max:135,prescribed_speed_kmh:null,prescribed_incline_percent:6,
      prescribed_distance_km:null,trainer_notes:'Спокойный темп после силовой.',
      actual_duration_minutes:null,actual_hr_avg:null,actual_rpe:null,actual_distance_km:null,
      client_notes:null,completed_at:null,
    },
  ],
}

function roleLabel(role: LiveWorkoutExercise['exercise_role']) {
  return role === 'main' ? 'Основное' : role === 'accessory' ? 'Дополнительное' : 'Опционально'
}

function previousLabel(exercise:LiveWorkoutExercise) {
  if (!exercise.previous_sets.length) return 'Пока нет предыдущих результатов'
  return exercise.previous_sets
    .map(set => {
      const weight = set.weight_kg == null ? '—' : Number(set.weight_kg).toLocaleString('ru-RU',{maximumFractionDigits:2})
      const reps = set.reps ?? '—'
      return `${weight} × ${reps}`
    })
    .join(' · ')
}

function elapsedLabel(from:string | null,now:number) {
  if (!from) return ''
  const elapsed=Math.max(0,Math.floor((now-new Date(from).getTime())/1000))
  const minutes=Math.floor(elapsed/60)
  const seconds=elapsed%60
  return minutes ? minutes+' мин '+String(seconds).padStart(2,'0')+' сек' : seconds+' сек'
}

function restLabel(seconds:number) {
  const minutes=Math.floor(seconds/60)
  const rest=seconds%60
  if (!minutes) return `${rest} сек`
  return rest ? `${minutes} мин ${rest} сек` : `${minutes} мин`
}

function defaultDraft(exercise:LiveWorkoutExercise,setNumber:number):SetDraft {
  const current = exercise.sets.find(set=>set.set_number===setNumber)
  return {
    weight:current?.weight_kg != null ? String(current.weight_kg) : '',
    reps:current?.reps != null ? String(current.reps) : '',
    rir:current?.rir ?? null,
    isWarmup:current?.is_warmup ?? false,
    completed:Boolean(current?.completed_at),
    completedAt:current?.completed_at ?? null,
  }
}

function beep() {
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const master = ctx.createGain()
    master.gain.setValueAtTime(.0001,ctx.currentTime)
    master.gain.exponentialRampToValueAtTime(.09,ctx.currentTime+.02)
    master.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.62)
    master.connect(ctx.destination)

    const notes=[659.25,783.99,1046.5]
    notes.forEach((frequency,index)=>{
      const osc=ctx.createOscillator()
      const gain=ctx.createGain()
      const start=ctx.currentTime+index*.12
      osc.type='sine'
      osc.frequency.value=frequency
      gain.gain.setValueAtTime(.0001,start)
      gain.gain.exponentialRampToValueAtTime(.65,start+.015)
      gain.gain.exponentialRampToValueAtTime(.0001,start+.2)
      osc.connect(gain)
      gain.connect(master)
      osc.start(start)
      osc.stop(start+.22)
    })
    window.setTimeout(()=>void ctx.close(),800)
  } catch {}
  navigator.vibrate?.([90,55,90])
}

export function WorkoutsPage({ preview }:Props) {
  const [plan,setPlan] = useState<ActiveTrainingPlan | null>(preview ? previewPlan : null)
  const [workout,setWorkout] = useState<LiveWorkout | null>(null)
  const [loading,setLoading] = useState(!preview)
  const [busy,setBusy] = useState(false)
  const [notice,setNotice] = useState('')
  const [setDrafts,setSetDrafts] = useState<Record<string,SetDraft>>({})
  const [activeExerciseId,setActiveExerciseId] = useState<string | null>(null)
  const [extraSets,setExtraSets] = useState<Record<string,number>>({})
  const [sheet,setSheet] = useState<SheetState>(null)
  const [comment,setComment] = useState('')
  const [timerEnd,setTimerEnd] = useState<number | null>(null)
  const [timerName,setTimerName] = useState('')
  const [remaining,setRemaining] = useState(0)
  const [now,setNow] = useState(()=>Date.now())
  const timerFinishedRef = useRef(false)
  const [cardioDrafts,setCardioDrafts] = useState<Record<string,{duration:string;hr:string;rpe:string;distance:string}>>({})

  useEffect(()=>{
    if (preview) return
    setLoading(true)
    Promise.all([loadActiveTrainingPlan(),loadInProgressWorkout()])
      .then(([activePlan,activeWorkout])=>{
        setPlan(activePlan)
        if (activeWorkout) setWorkout(activeWorkout)
      })
      .catch(error=>setNotice(error instanceof Error ? error.message : 'Не удалось загрузить программу'))
      .finally(()=>setLoading(false))
  },[preview])

  useEffect(()=>{
    if (!workout) return
    const drafts:Record<string,SetDraft> = {}
    for (const exercise of workout.exercises) {
      const count = Math.max(exercise.prescribed_sets,exercise.sets.length)
      for (let n=1;n<=count;n++) drafts[`${exercise.id}:${n}`] = defaultDraft(exercise,n)
    }
    setSetDrafts(drafts)
    setExtraSets(Object.fromEntries(workout.exercises.map(exercise=>{
      const highestSavedSet=Math.max(exercise.prescribed_sets,...exercise.sets.map(set=>set.set_number))
      return [exercise.id,Math.max(0,highestSavedSet-exercise.prescribed_sets)]
    })))
    setCardioDrafts(Object.fromEntries(workout.cardio.map(item=>[item.id,{
      duration:item.actual_duration_minutes==null?'':String(item.actual_duration_minutes),
      hr:item.actual_hr_avg==null?'':String(item.actual_hr_avg),
      rpe:item.actual_rpe==null?'':String(item.actual_rpe),
      distance:item.actual_distance_km==null?'':String(item.actual_distance_km),
    }])))
  },[workout?.id])

  useEffect(()=>{
    if (!workout || workout.status!=='in_progress') return
    setNow(Date.now())
    const id=window.setInterval(()=>setNow(Date.now()),1000)
    return ()=>window.clearInterval(id)
  },[workout?.id,workout?.status])

  useEffect(()=>{
    if (!timerEnd) {
      setRemaining(0)
      timerFinishedRef.current=false
      return
    }
    const tick = () => {
      const next = Math.max(0,Math.ceil((timerEnd-Date.now())/1000))
      setRemaining(next)
      if (next===0 && !timerFinishedRef.current) {
        timerFinishedRef.current=true
        beep()
      }
    }
    tick()
    const id = window.setInterval(tick,250)
    return ()=>window.clearInterval(id)
  },[timerEnd])

  const completedSetCount = useMemo(()=>{
    if (!workout) return 0
    return Object.entries(setDrafts).filter(([,draft])=>draft.completed).length
  },[workout,setDrafts])

  async function begin(sessionId:string) {
    setBusy(true);setNotice('')
    try {
      if (preview) {
        setWorkout({...previewWorkout,session_name:previewPlan.sessions.find(s=>s.id===sessionId)?.name ?? 'Full Body'})
      } else {
        const id = await startWorkout(sessionId)
        setWorkout(await loadWorkout(id))
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось начать тренировку')
    } finally {setBusy(false)}
  }

  function patchSet(exerciseId:string,setNumber:number,patch:Partial<SetDraft>) {
    const key=`${exerciseId}:${setNumber}`
    setSetDrafts(current=>({...current,[key]:{...(current[key] ?? {weight:'',reps:'',rir:null,isWarmup:false,completed:false,completedAt:null}),...patch}}))
  }

  async function finishSet(exercise:LiveWorkoutExercise,setNumber:number) {
    const key=`${exercise.id}:${setNumber}`
    const draft=setDrafts[key] ?? defaultDraft(exercise,setNumber)
    const reps=draft.reps.trim()==='' ? null : Number(draft.reps)
    const weight=parseDecimal(draft.weight)
    if (reps==null || !Number.isInteger(reps) || reps<0) {
      setNotice('Укажи количество повторов целым числом.')
      return
    }

    const completedAt=new Date().toISOString()
    setBusy(true);setNotice('')
    try {
      if (!preview) {
        await saveWorkoutSet(exercise.id,{
          set_number:setNumber,weight_kg:weight,reps,rir:exercise.rir_enabled ? draft.rir : null,is_warmup:draft.isWarmup,completed_at:completedAt,
        })
      }
      patchSet(exercise.id,setNumber,{completed:true,completedAt})
      setTimerName(exercise.name)
      setTimerEnd(Date.now()+exercise.rest_seconds*1000)
      timerFinishedRef.current=false
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось сохранить сет')
    } finally {setBusy(false)}
  }

  async function persistSetDraft(exercise:LiveWorkoutExercise,setNumber:number,draft:SetDraft) {
    if (preview || draft.completed) return
    const reps=draft.reps.trim()==='' ? null : Number(draft.reps)
    const weight=parseDecimal(draft.weight)
    if (weight==null && reps==null && draft.rir==null && !draft.isWarmup) return
    try {
      await saveWorkoutSet(exercise.id,{
        set_number:setNumber,
        weight_kg:weight,
        reps:Number.isInteger(reps) ? reps : null,
        rir:exercise.rir_enabled ? draft.rir : null,
        is_warmup:draft.isWarmup,
        completed_at:null,
      })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось сохранить черновик сета')
    }
  }

  async function removeLastExtraSet(exercise:LiveWorkoutExercise) {
    const extraCount=extraSets[exercise.id] ?? 0
    if (extraCount<=0) return

    const setNumber=exercise.prescribed_sets+extraCount
    const key=`${exercise.id}:${setNumber}`
    const draft=setDrafts[key] ?? defaultDraft(exercise,setNumber)
    const hasData=draft.weight.trim()!=='' || draft.reps.trim()!=='' || draft.rir!=null || draft.completed

    if (hasData && !window.confirm(`Удалить дополнительный сет №${setNumber} и его сохранённые данные?`)) return

    setBusy(true);setNotice('')
    try {
      if (!preview) await deleteWorkoutSet(exercise.id,setNumber)
      setSetDrafts(current=>{
        const next={...current}
        delete next[key]
        return next
      })
      setExtraSets(current=>({...current,[exercise.id]:Math.max(0,extraCount-1)}))
      setNotice('Дополнительный сет удалён.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось удалить сет')
    } finally {setBusy(false)}
  }

  async function finishExercise(exercise:LiveWorkoutExercise) {
    const completedAt=new Date().toISOString()
    setBusy(true);setNotice('')
    try {
      if (!preview) await completeWorkoutExercise(exercise.id,completedAt)
      setWorkout(current=>current ? {
        ...current,
        exercises:current.exercises.map(item=>item.id===exercise.id?{...item,completed_at:completedAt}:item),
      } : current)
      setActiveExerciseId(null)
      setTimerEnd(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось завершить упражнение')
    } finally {setBusy(false)}
  }

  async function replaceExercise(exercise:LiveWorkoutExercise,newExerciseId:string) {
    setBusy(true);setNotice('')
    try {
      if (preview) {
        const option=exercise.substitution_options.find(item=>item.id===newExerciseId)
        if (option) setWorkout(current=>current ? {...current,exercises:current.exercises.map(item=>item.id===exercise.id?{...item,exercise_id:option.id,name:option.name}:item)} : current)
      } else {
        await replaceWorkoutExercise(exercise.id,newExerciseId)
        setWorkout(await loadWorkout(workout!.id))
      }
      setSheet(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось заменить упражнение')
    } finally {setBusy(false)}
  }

  async function sendComment(exercise:LiveWorkoutExercise) {
    const body=comment.trim()
    if (!body) return
    setBusy(true);setNotice('')
    try {
      if (!preview) await addWorkoutComment(exercise.id,body)
      setNotice('Комментарий отправлен тренеру.')
      setComment('')
      setSheet(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось отправить комментарий')
    } finally {setBusy(false)}
  }

  async function finishCardio(id:string) {
    const draft=cardioDrafts[id] ?? {duration:'',hr:'',rpe:'',distance:''}
    setBusy(true);setNotice('')
    try {
      if (!preview) await completeCardioEntry(id,{
        actual_duration_minutes:draft.duration===''?null:Number(draft.duration),
        actual_hr_avg:draft.hr===''?null:Number(draft.hr),
        actual_rpe:draft.rpe===''?null:Number(draft.rpe.replace(',','.')),
        actual_distance_km:draft.distance===''?null:Number(draft.distance.replace(',','.')),
        client_notes:null,
      })
      setWorkout(current=>current?{...current,cardio:current.cardio.map(item=>item.id===id?{...item,completed_at:new Date().toISOString()}:item)}:current)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось сохранить кардио')
    } finally {setBusy(false)}
  }

  async function finishWorkout() {
    if (!workout) return

    const plannedSetCount=workout.exercises.reduce((sum,exercise)=>sum+exercise.prescribed_sets,0)
    const completedPlannedSetCount=workout.exercises.reduce((sum,exercise)=>{
      let completed=0
      for(let setNumber=1;setNumber<=exercise.prescribed_sets;setNumber++){
        const draft=setDrafts[`${exercise.id}:${setNumber}`] ?? defaultDraft(exercise,setNumber)
        if(draft.completed) completed++
      }
      return sum+completed
    },0)

    const confirmation=
      completedPlannedSetCount===0
        ? 'Ни одного планового сета ещё не сохранено. Всё равно завершить тренировку?'
        : completedPlannedSetCount<plannedSetCount
          ? `Сохранено ${completedPlannedSetCount} из ${plannedSetCount} плановых сетов. Всё равно завершить тренировку?`
          : 'Все плановые сеты сохранены. Точно завершить тренировку?'

    if(!window.confirm(confirmation)) return

    setBusy(true);setNotice('')
    try {
      if (!preview) await completeWorkout(workout.id)
      setWorkout({...workout,status:'completed'})
      setTimerEnd(null)
      setNotice('Тренировка завершена и сохранена.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось завершить тренировку')
    } finally {setBusy(false)}
  }

  if (loading) return <div className="library-empty">Загружаю программу…</div>

  if (!workout) {
    return <div className="page-stack">
      <section className="workout-hero">
        <div>
          <span className="eyebrow light">Тренировки</span>
          <h2>{plan?.name ?? 'Программа пока не назначена'}</h2>
          <p>{plan?.description ?? 'Когда тренер опубликует программу, она появится здесь.'}</p>
        </div>
        {plan?.weekly_frequency && <div className="hero-score"><strong>{plan.weekly_frequency}</strong><span>сессии в неделю</span></div>}
      </section>

      {plan?.sessions?.length ? <div className="workout-session-grid">
        {plan.sessions.map(session=><article className="workout-session-card" key={session.id}>
          <div className={`workout-session-icon ${session.session_type}`}>{session.session_type==='cardio'?<Activity size={20}/>:<Dumbbell size={20}/>}</div>
          <div>
            <span className="eyebrow">{session.session_type==='strength'?'Силовая':session.session_type==='cardio'?'Кардио':'Смешанная'}</span>
            <h3>{session.name}</h3>
            <p>{session.planned_duration_minutes ? `≈ ${session.planned_duration_minutes} мин` : 'Без жёсткого лимита по времени'}</p>
          </div>
          <button className="primary-button compact" disabled={busy} onClick={()=>void begin(session.id)}><Play size={15}/>Начать</button>
        </article>)}
      </div> : <div className="library-empty">Активной программы пока нет.</div>}
      {notice && <div className="drawer-notice">{notice}</div>}
    </div>
  }

  const activeExercise=activeExerciseId ? workout.exercises.find(exercise=>exercise.id===activeExerciseId) ?? null : null
  const activeTotalSets=activeExercise ? activeExercise.prescribed_sets+(extraSets[activeExercise.id] ?? 0) : 0
  const activeDrafts=activeExercise
    ? Array.from({length:activeTotalSets},(_,i)=>setDrafts[`${activeExercise.id}:${i+1}`] ?? defaultDraft(activeExercise,i+1))
    : []
  const activeCompletedCount=activeDrafts.filter(d=>d.completed).length
  const activeLastCompletedAt=activeDrafts
    .filter(d=>d.completed&&d.completedAt)
    .map(d=>d.completedAt as string)
    .sort((a,b)=>new Date(b).getTime()-new Date(a).getTime())[0] ?? null
  const completedExerciseCount=workout.exercises.filter(exercise=>Boolean(exercise.completed_at)).length

  return <div className="page-stack live-workout-page">
    {!activeExercise ? <section className="live-workout-hero">
      <div>
        <span className="eyebrow light">{workout.program_name}</span>
        <h2>{workout.session_name}</h2>
        <p>{workout.status==='completed'
          ? 'Готово. Результаты сохранены.'
          : `${completedExerciseCount}/${workout.exercises.length} упражнений · ${completedSetCount} сетов сохранено`}</p>
      </div>
      {workout.status==='in_progress' && <button className="white-button" disabled={busy} onClick={()=>void finishWorkout()}><Check size={16}/>Завершить тренировку</button>}
    </section> : <section className="exercise-detail-hero">
      <button className="exercise-detail-back" onClick={()=>setActiveExerciseId(null)} aria-label="Назад к упражнениям"><ArrowLeft size={20}/></button>
      <div className="exercise-detail-heading">
        <span className="eyebrow">{workout.session_name}</span>
        <h2>{activeExercise.name}</h2>
        <p>{activeCompletedCount}/{activeTotalSets} сетов сохранено</p>
      </div>
      {activeExercise.completed_at && <span className="exercise-done-badge"><Check size={14}/>Готово</span>}
    </section>}

    {notice && <div className="drawer-notice">{notice}</div>}

    {!activeExercise ? <>
      <div className="workout-exercise-overview">
        {workout.exercises.map((exercise,index)=>{
          const totalSets=exercise.prescribed_sets+(extraSets[exercise.id] ?? 0)
          const exerciseDrafts=Array.from({length:totalSets},(_,i)=>setDrafts[`${exercise.id}:${i+1}`] ?? defaultDraft(exercise,i+1))
          const completed=exerciseDrafts.filter(d=>d.completed).length
          const lastCompletedAt=exerciseDrafts
            .filter(d=>d.completed&&d.completedAt)
            .map(d=>d.completedAt as string)
            .sort((a,b)=>new Date(b).getTime()-new Date(a).getTime())[0] ?? null
          return <button className={`workout-exercise-summary ${exercise.completed_at?'is-completed':''}`} key={exercise.id} onClick={()=>setActiveExerciseId(exercise.id)}>
            <div className="workout-exercise-summary-number">{exercise.completed_at?<Check size={16}/>:index+1}</div>
            {exercise.image_url
              ? <img className="workout-exercise-summary-image" src={exercise.image_url} alt="" loading="lazy"/>
              : <div className="workout-exercise-summary-image placeholder"><Dumbbell size={20}/></div>}
            <div className="workout-exercise-summary-copy">
              <strong>{exercise.name}</strong>
              <span>
                {exercise.prescribed_sets} × {exercise.reps_min ?? '—'}–{exercise.reps_max ?? '—'}
                {exercise.rir_enabled && exercise.rir_min!=null ? ` · RIR ${exercise.rir_min}–${exercise.rir_max ?? exercise.rir_min}` : ''}
                {' · '}{restLabel(exercise.rest_seconds)}
              </span>
              {lastCompletedAt && !exercise.completed_at && <small><TimerReset size={12}/>После последнего сета: {elapsedLabel(lastCompletedAt,now)}</small>}
            </div>
            <div className="workout-exercise-summary-progress">
              <strong>{completed}/{totalSets}</strong>
              <span>{exercise.completed_at?'готово':'сетов'}</span>
            </div>
            <ChevronRight className="workout-exercise-summary-chevron" size={18}/>
          </button>
        })}
      </div>

      {workout.cardio.length>0 && <div className="live-exercise-list">
        {workout.cardio.map(cardio=>{
          const draft=cardioDrafts[cardio.id] ?? {duration:'',hr:'',rpe:'',distance:''}
          return <article className="live-exercise-card live-cardio-card" key={cardio.id}>
            <div className="live-exercise-head">
              <div className="exercise-number cardio"><Activity size={17}/></div>
              <div className="live-exercise-title"><span className="eyebrow">Кардио</span><h3>{cardio.name || cardio.modality_name}</h3></div>
            </div>
            <div className="cardio-prescription-line">
              {cardio.prescribed_duration_minutes && <span><Clock3 size={14}/>{cardio.prescribed_duration_minutes} мин</span>}
              {cardio.prescribed_hr_min && <span>Пульс {cardio.prescribed_hr_min}–{cardio.prescribed_hr_max ?? cardio.prescribed_hr_min}</span>}
              {cardio.prescribed_incline_percent!=null && <span>Наклон {cardio.prescribed_incline_percent}%</span>}
            </div>
            {cardio.trainer_notes && <CoachHint storageKey={'cardio:'+cardio.id} text={cardio.trainer_notes}/>}
            <div className="cardio-result-grid">
              <label><span>Минуты</span><input disabled={Boolean(cardio.completed_at)||workout.status!=='in_progress'} inputMode="numeric" value={draft.duration} onChange={e=>setCardioDrafts(current=>({...current,[cardio.id]:{...draft,duration:e.target.value.replace(/\D/g,'')}}))}/></label>
              <label><span>Средний пульс</span><input disabled={Boolean(cardio.completed_at)||workout.status!=='in_progress'} inputMode="numeric" value={draft.hr} onChange={e=>setCardioDrafts(current=>({...current,[cardio.id]:{...draft,hr:e.target.value.replace(/\D/g,'')}}))}/></label>
              <label><span>RPE</span><input disabled={Boolean(cardio.completed_at)||workout.status!=='in_progress'} inputMode="decimal" value={draft.rpe} onChange={e=>setCardioDrafts(current=>({...current,[cardio.id]:{...draft,rpe:normalizeDecimalInput(e.target.value)}}))}/></label>
              <label><span>Км</span><input disabled={Boolean(cardio.completed_at)||workout.status!=='in_progress'} inputMode="decimal" value={draft.distance} onChange={e=>setCardioDrafts(current=>({...current,[cardio.id]:{...draft,distance:normalizeDecimalInput(e.target.value)}}))}/></label>
            </div>
            {workout.status==='in_progress' && <button className={`primary-button compact cardio-complete ${cardio.completed_at?'is-completed':''}`} disabled={busy||Boolean(cardio.completed_at)} onClick={()=>void finishCardio(cardio.id)}>{cardio.completed_at?<><Check size={15}/>Готово</>:<><Check size={15}/>Завершить кардио</>}</button>}
          </article>
        })}
      </div>}
    </> : <article className="exercise-focus-card">
      <div className="exercise-focus-intro">
        {activeExercise.image_url
          ? <img className="exercise-focus-image" src={activeExercise.image_url} alt="" loading="lazy"/>
          : <div className="exercise-focus-image placeholder"><Dumbbell size={26}/></div>}
        <div>
          <div className="exercise-focus-strategy">
            <strong>{activeExercise.prescribed_sets} × {activeExercise.reps_min ?? '—'}–{activeExercise.reps_max ?? '—'}</strong>
            {activeExercise.rir_enabled && activeExercise.rir_min!=null && <span>RIR {activeExercise.rir_min}–{activeExercise.rir_max ?? activeExercise.rir_min}</span>}
            <span>Отдых {restLabel(activeExercise.rest_seconds)}</span>
          </div>
          {activeLastCompletedAt && !activeExercise.completed_at && <div className="exercise-last-set-timer"><TimerReset size={13}/>После последнего сета: <strong>{elapsedLabel(activeLastCompletedAt,now)}</strong></div>}
        </div>
      </div>

      {activeExercise.trainer_notes && <CoachHint storageKey={'workout:'+activeExercise.exercise_id} text={activeExercise.trainer_notes}/>}
      {activeExercise.previous_sets.length>0 && <details className="previous-result-collapsed">
        <summary>Прошлый раз</summary>
        <span>{previousLabel(activeExercise)}</span>
      </details>}

      <div className="live-sets exercise-focus-sets">
        <div className={`live-set-row header ${activeExercise.rir_enabled?'':'no-rir'}`}><span>Сет</span><span>Вес</span><span>Повторы</span>{activeExercise.rir_enabled&&<span>RIR</span>}<span/></div>
        {Array.from({length:activeTotalSets},(_,i)=>i+1).map(setNumber=>{
          const key=`${activeExercise.id}:${setNumber}`
          const row=setDrafts[key] ?? defaultDraft(activeExercise,setNumber)
          const previous=activeExercise.previous_sets.find(set=>set.set_number===setNumber)
          const previousWeight=previous?.weight_kg==null?'—':Number(previous.weight_kg).toLocaleString('ru-RU',{maximumFractionDigits:2})
          const previousReps=previous?.reps==null?'—':String(previous.reps)
          const weight=parseDecimal(row.weight)
          const reps=row.reps===''?null:Number(row.reps)
          const e1rm=weight&&reps ? estimateOneRepMax(weight,reps) : null
          const locked=workout.status!=='in_progress'||Boolean(activeExercise.completed_at)||row.completed
          return <div className={`live-set-row ${activeExercise.rir_enabled?'':'no-rir'} ${row.completed?'is-completed':''}`} key={setNumber}>
            <div className="set-number-cell"><strong>{setNumber}</strong>{row.isWarmup&&<small>разм.</small>}</div>
            <div>
              <input
                disabled={locked}
                inputMode="decimal"
                value={row.weight}
                onChange={e=>patchSet(activeExercise.id,setNumber,{weight:normalizeDecimalInput(e.target.value)})}
                onBlur={()=>void persistSetDraft(activeExercise,setNumber,setDrafts[key] ?? row)}
                placeholder={previousWeight}
              />
              {e1rm!=null&&<small>1ПМ ≈ {e1rm.toFixed(1)}</small>}
            </div>
            <input
              disabled={locked}
              inputMode="numeric"
              value={row.reps}
              onChange={e=>patchSet(activeExercise.id,setNumber,{reps:e.target.value.replace(/\D/g,'')})}
              onBlur={()=>void persistSetDraft(activeExercise,setNumber,setDrafts[key] ?? row)}
              placeholder={previousReps}
            />
            {activeExercise.rir_enabled&&<select
              className="rir-select"
              disabled={locked}
              value={row.rir??''}
              onChange={e=>{
                const next={...row,rir:e.target.value===''?null:Number(e.target.value)}
                patchSet(activeExercise.id,setNumber,{rir:next.rir})
                void persistSetDraft(activeExercise,setNumber,next)
              }}
              aria-label={`RIR, сет ${setNumber}`}
            >
              <option value="">—</option><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option>
            </select>}
            <button className={`set-complete-button ${row.completed?'is-done':''}`} disabled={busy||locked} onClick={()=>void finishSet(activeExercise,setNumber)}>{row.completed?<Check size={17}/>:<ChevronRight size={17}/>}</button>
          </div>
        })}
      </div>

      {workout.status==='in_progress' && !activeExercise.completed_at && <div className="exercise-focus-actions">
        <div className="exercise-focus-secondary-actions">
          <button className="text-button" onClick={()=>setExtraSets(current=>({...current,[activeExercise.id]:(current[activeExercise.id]??0)+1}))}><Plus size={15}/>Добавить сет</button>
          {(extraSets[activeExercise.id]??0)>0 && <button className="text-button danger-text-button" disabled={busy} onClick={()=>void removeLastExtraSet(activeExercise)}><Minus size={15}/>Удалить последний</button>}
          <button className="text-button" onClick={()=>setSheet({type:'technique',exercise:activeExercise})}><Info size={15}/>Техника</button>
          {activeExercise.allow_substitution&&activeExercise.substitution_options.length>0&&<button className="text-button" onClick={()=>setSheet({type:'replace',exercise:activeExercise})}><Repeat2 size={15}/>Заменить</button>}
          <button className="text-button" onClick={()=>setSheet({type:'comment',exercise:activeExercise})}><MessageCircle size={15}/>Комментарий</button>
        </div>
        <button className="primary-button exercise-complete-button" disabled={busy||activeCompletedCount===0} onClick={()=>void finishExercise(activeExercise)}><Check size={17}/>Завершить упражнение</button>
      </div>}

      {activeExercise.completed_at && <div className="exercise-completed-panel"><Check size={18}/><span>Упражнение завершено. Все сохранённые сеты останутся в истории.</span><button className="ghost-button" onClick={()=>setActiveExerciseId(null)}>К списку упражнений</button></div>}
    </article>}

    {timerEnd && workout.status==='in_progress' && <div className={`rest-timer ${remaining===0?'is-finished':''}`}>
      <div className="rest-timer-icon"><TimerReset size={19}/></div>
      <div><small>{remaining===0?'Отдых закончен':'Отдых после сета'}</small><strong>{String(Math.floor(remaining/60)).padStart(2,'0')}:{String(remaining%60).padStart(2,'0')}</strong><span>{timerName}</span></div>
      <div className="rest-timer-actions">
        <button onClick={()=>{setTimerEnd((timerEnd??Date.now())-15000);timerFinishedRef.current=false}}>−15</button>
        <button onClick={()=>{setTimerEnd((timerEnd??Date.now())+15000);timerFinishedRef.current=false}}>+15</button>
        <button onClick={()=>setTimerEnd(null)}><X size={14}/></button>
      </div>
    </div>}

    {sheet && <div className="drawer-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)setSheet(null)}}>
      <aside className="exercise-drawer workout-sheet">
        <div className="drawer-head">
          <div><span className="eyebrow">{sheet.type==='technique'?'Техника':sheet.type==='comment'?'Комментарий тренеру':'Замена упражнения'}</span><h3>{sheet.exercise.name}</h3></div>
          <button className="icon-button" onClick={()=>setSheet(null)}><X size={18}/></button>
        </div>
        <div className="drawer-body">
          {sheet.type==='technique' && <>
            {sheet.exercise.image_url ? <img className="technique-image" src={sheet.exercise.image_url} alt={sheet.exercise.name}/> : <div className="technique-icon"><Dumbbell size={24}/></div>}
            <div className="technique-copy"><h4>Как выполнять</h4><p>{sheet.exercise.instructions || 'Тренер пока не добавил отдельное описание техники.'}</p></div>
            {sheet.exercise.trainer_notes && <div className="coach-note"><strong>Подсказка тренера</strong><span>{sheet.exercise.trainer_notes}</span></div>}
            {sheet.exercise.technique_url && <a className="primary-button compact" href={sheet.exercise.technique_url} target="_blank" rel="noreferrer">Открыть видео техники</a>}
          </>}
          {sheet.type==='comment' && <>
            <p className="sheet-description">Напиши только то, что важно тренеру: боль, дискомфорт, непонятная техника, слишком лёгкий или тяжёлый вес.</p>
            <textarea className="sheet-textarea" rows={6} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Например: на втором сете начало тянуть правое плечо"/>
            <button className="primary-button" disabled={busy||!comment.trim()} onClick={()=>void sendComment(sheet.exercise)}><MessageCircle size={16}/>Отправить тренеру</button>
          </>}
          {sheet.type==='replace' && <>
            <p className="sheet-description">Доступны только варианты, которые тренер заранее разрешил для этого движения.</p>
            <div className="replacement-list">
              {sheet.exercise.substitution_options.map(option=><button key={option.id} onClick={()=>void replaceExercise(sheet.exercise,option.id)}><RefreshCcw size={17}/><span>{option.name}</span><ChevronRight size={16}/></button>)}
            </div>
          </>}
        </div>
      </aside>
    </div>}
  </div>
}
