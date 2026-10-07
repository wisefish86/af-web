import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Save } from 'lucide-react'
import {
  loadMyTrackingSetup, loadTodayWellbeing, saveTodayWellbeing,
  type DailyWellbeing, type TrackingFieldState
} from '../features/tracking/service'
import { appDateKey } from '../lib/appDate'

const labels:Record<keyof Pick<DailyWellbeing,'hunger'|'energy'|'stress'|'sleep'|'ease'>,{title:string;low:string;high:string}>={
  hunger:{title:'Голод',low:'не ощущал',high:'сильный'},
  energy:{title:'Энергия',low:'очень мало',high:'отлично'},
  stress:{title:'Стресс',low:'спокойно',high:'сильный'},
  sleep:{title:'Сон',low:'плохо',high:'отлично'},
  ease:{title:'Соблюдать питание',low:'очень тяжело',high:'очень легко'},
}

const previewValue:DailyWellbeing={hunger:2,energy:4,stress:2,sleep:4,ease:4,comment:''}
const emptyValue:DailyWellbeing={hunger:null,energy:null,stress:null,sleep:null,ease:null,comment:''}

type WellbeingDraft={version:1;date:string;baseline:string;value:DailyWellbeing}

function wellbeingSignature(value:DailyWellbeing){
  return JSON.stringify({
    hunger:value.hunger,energy:value.energy,stress:value.stress,
    sleep:value.sleep,ease:value.ease,comment:value.comment.trim(),
  })
}

export function DailyCheckinCard({preview}:{preview:boolean}){
  const [setup,setSetup]=useState<TrackingFieldState[]>([])
  const [value,setValue]=useState<DailyWellbeing>(preview?previewValue:emptyValue)
  const [loading,setLoading]=useState(!preview)
  const [setupLoaded,setSetupLoaded]=useState(preview)
  const [wellbeingLoaded,setWellbeingLoaded]=useState(preview)
  const [saving,setSaving]=useState(false)
  const [saved,setSaved]=useState(false)
  const [notice,setNotice]=useState('')
  const previewRecovery=preview&&new URLSearchParams(window.location.search).get('qaRecovery')==='1'
  const recoveryEnabled=!preview||previewRecovery
  const todayKey=appDateKey()
  const draftKey='andrey-fit:daily-wellbeing-draft:'+todayKey
  const baselineRef=useRef(wellbeingSignature(preview?previewValue:emptyValue))
  const touchedRef=useRef(false)

  function clearDraft(){
    if(!recoveryEnabled)return
    try{localStorage.removeItem(draftKey)}catch{}
  }
  function readDraft():WellbeingDraft|null{
    if(!recoveryEnabled)return null
    try{
      const raw=localStorage.getItem(draftKey)
      if(!raw)return null
      const parsed=JSON.parse(raw) as WellbeingDraft
      return parsed?.version===1&&parsed.date===todayKey?parsed:null
    }catch{return null}
  }
  function restoreDraft(server:DailyWellbeing,serverKnown=true){
    const serverBaseline=wellbeingSignature(server)
    const savedDraft=readDraft()
    if(!savedDraft){
      baselineRef.current=serverBaseline
      return
    }
    if(serverKnown&&savedDraft.baseline!==serverBaseline){
      baselineRef.current=serverBaseline
      clearDraft()
      setNotice(current=>current||'Самочувствие уже изменилось на другом устройстве — старый локальный черновик не восстановлен.')
      return
    }
    baselineRef.current=serverKnown?serverBaseline:savedDraft.baseline
    touchedRef.current=true
    setValue(savedDraft.value)
  }

  useEffect(()=>{
    if(preview){
      setSetup(Object.keys(labels).map((code,index)=>({
        code,section:'daily',label:labels[code as keyof typeof labels].title,unit:null,
        enabled:true,required:false,frequency:'daily',client_can_disable:true,hidden:false,
        reminder_enabled:true,settings:{},sort_order:index,
      } as TrackingFieldState)))
      setSetupLoaded(true);setWellbeingLoaded(true);setLoading(false)
      setValue(previewValue)
      if(previewRecovery)restoreDraft(previewValue,true)
      return
    }
    Promise.allSettled([loadMyTrackingSetup(),loadTodayWellbeing()])
      .then(([setupResult,wellbeingResult])=>{
        const failed:string[]=[]
        if(setupResult.status==='fulfilled'){setSetup(setupResult.value);setSetupLoaded(true)}
        else {setSetupLoaded(false);failed.push('настройки вопросов')}
        if(wellbeingResult.status==='fulfilled'){
          setValue(wellbeingResult.value)
          setWellbeingLoaded(true)
          restoreDraft(wellbeingResult.value,true)
        }else{
          setWellbeingLoaded(false)
          restoreDraft(emptyValue,false)
          failed.push('сегодняшние значения')
        }
        if(failed.length)setNotice(current=>current||'Часть дневного отчёта не загрузилась: '+failed.join(', ')+'.')
      })
      .finally(()=>setLoading(false))
  },[preview])

  useEffect(()=>{
    if(!recoveryEnabled||!touchedRef.current)return
    const draft:WellbeingDraft={version:1,date:todayKey,baseline:baselineRef.current,value}
    try{localStorage.setItem(draftKey,JSON.stringify(draft))}catch{}
  },[recoveryEnabled,todayKey,value])

  const fields=useMemo(()=>setup.filter(f=>f.section==='daily'&&f.enabled&&!f.hidden&&f.code in labels),[setup])

  async function save(){
    if(!setupLoaded||!wellbeingLoaded){setNotice('Дневной отчёт загружен не полностью. Сохранение временно отключено.');return}
    const missingRequired=fields.filter(field=>field.required&&value[field.code as keyof typeof labels]==null)
    if(missingRequired.length){setNotice('Заполни обязательные поля: '+missingRequired.map(field=>field.label).join(', '));return}
    setSaving(true);setSaved(false);setNotice('')
    try{
      if(!preview){
        const before=await loadTodayWellbeing()
        const serverBaseline=wellbeingSignature(before)
        if(serverBaseline!==baselineRef.current){
          baselineRef.current=serverBaseline
          touchedRef.current=true
          try{localStorage.setItem(draftKey,JSON.stringify({version:1,date:todayKey,baseline:serverBaseline,value} satisfies WellbeingDraft))}catch{}
          setNotice('Сегодняшнее самочувствие уже изменилось на другом устройстве. Твои ответы оставлены как черновик. Проверь их и нажми «Сохранить» ещё раз, если хочешь заменить серверные данные.')
          return
        }

        await saveTodayWellbeing(value)
        const actual=await loadTodayWellbeing()
        setValue(actual)
        baselineRef.current=wellbeingSignature(actual)
      }else{
        baselineRef.current=wellbeingSignature(value)
      }

      touchedRef.current=false
      clearDraft()
      setSaved(true)
      setTimeout(()=>setSaved(false),1800)
    }catch(e){
      if(!preview){
        try{
          const server=await loadTodayWellbeing()
          if(wellbeingSignature(server)===wellbeingSignature(value)){
            setValue(server)
            baselineRef.current=wellbeingSignature(server)
            touchedRef.current=false
            clearDraft()
            setSaved(true)
            setTimeout(()=>setSaved(false),1800)
            return
          }
        }catch{}
      }
      setNotice(e instanceof Error?e.message:'Не удалось сохранить отчёт')
    }
    finally{setSaving(false)}
  }

  if(loading)return <section className="panel daily-checkin-card"><div className="library-empty">Загружаю самочувствие…</div></section>
  if(!setupLoaded)return <section className="panel daily-checkin-card"><div className="library-empty">Не удалось загрузить настройки дневного отчёта.</div></section>
  if(!fields.length)return null

  return <section className="panel daily-checkin-card">
    <div className="panel-head">
      <div><span className="eyebrow">Сегодня</span><h3>Как себя чувствуешь?</h3></div>
      {saved&&<span className="saved-inline"><Check size={14}/>Сохранено</span>}
    </div>
    <p className="panel-description">Пять коротких оценок. Ненужные вопросы можно отключить в настройках.</p>

    <div className="wellbeing-grid">
      {fields.map(field=>{
        const code=field.code as keyof typeof labels
        const meta=labels[code]
        const current=value[code] as number|null
        return <div className="wellbeing-field" key={field.code}>
          <div><strong>{meta.title}{field.required?' *':''}</strong><span>{meta.low} → {meta.high}</span></div>
          <div className="score-buttons">
            {[1,2,3,4,5].map(score=><button key={score} disabled={!wellbeingLoaded} className={current===score?'is-active':''} onClick={()=>{touchedRef.current=true;setValue(v=>({...v,[code]:current===score?null:score}))}}>{score}</button>)}
          </div>
        </div>
      })}
    </div>

    <label className="daily-comment">Комментарий тренеру <small>необязательно · тренер получит уведомление</small><textarea rows={2} disabled={!wellbeingLoaded} value={value.comment} onChange={e=>{touchedRef.current=true;setValue(v=>({...v,comment:e.target.value}))}} placeholder="Например: плохо спал или тренировка далась легче обычного"/></label>

    <div className="daily-checkin-actions">
      {notice&&<span>{notice}</span>}
      <button className="primary-button compact" disabled={saving||!wellbeingLoaded} onClick={()=>void save()}><Save size={14}/>{saving?'Сохраняю…':'Сохранить самочувствие'}</button>
    </div>
  </section>
}
