import { useEffect, useMemo, useState } from 'react'
import { Check, Save } from 'lucide-react'
import {
  loadMyTrackingSetup, loadTodayWellbeing, saveTodayWellbeing,
  type DailyWellbeing, type TrackingFieldState
} from '../features/tracking/service'

const labels:Record<keyof Pick<DailyWellbeing,'hunger'|'energy'|'stress'|'sleep'|'ease'>,{title:string;low:string;high:string}>={
  hunger:{title:'Голод',low:'не ощущал',high:'сильный'},
  energy:{title:'Энергия',low:'очень мало',high:'отлично'},
  stress:{title:'Стресс',low:'спокойно',high:'сильный'},
  sleep:{title:'Сон',low:'плохо',high:'отлично'},
  ease:{title:'Соблюдать питание',low:'очень тяжело',high:'очень легко'},
}

const previewValue:DailyWellbeing={hunger:2,energy:4,stress:2,sleep:4,ease:4,comment:''}
const emptyValue:DailyWellbeing={hunger:null,energy:null,stress:null,sleep:null,ease:null,comment:''}

export function DailyCheckinCard({preview}:{preview:boolean}){
  const [setup,setSetup]=useState<TrackingFieldState[]>([])
  const [value,setValue]=useState<DailyWellbeing>(preview?previewValue:emptyValue)
  const [loading,setLoading]=useState(!preview)
  const [setupLoaded,setSetupLoaded]=useState(preview)
  const [wellbeingLoaded,setWellbeingLoaded]=useState(preview)
  const [saving,setSaving]=useState(false)
  const [saved,setSaved]=useState(false)
  const [notice,setNotice]=useState('')

  useEffect(()=>{
    if(preview){
      setSetup(Object.keys(labels).map((code,index)=>({
        code,section:'daily',label:labels[code as keyof typeof labels].title,unit:null,
        enabled:true,required:false,frequency:'daily',client_can_disable:true,hidden:false,
        reminder_enabled:true,settings:{},sort_order:index,
      } as TrackingFieldState)))
      setSetupLoaded(true);setWellbeingLoaded(true);setLoading(false)
      return
    }
    Promise.allSettled([loadMyTrackingSetup(),loadTodayWellbeing()])
      .then(([setupResult,wellbeingResult])=>{
        const failed:string[]=[]
        if(setupResult.status==='fulfilled'){setSetup(setupResult.value);setSetupLoaded(true)}
        else {setSetupLoaded(false);failed.push('настройки вопросов')}
        if(wellbeingResult.status==='fulfilled'){setValue(wellbeingResult.value);setWellbeingLoaded(true)}
        else {setWellbeingLoaded(false);failed.push('сегодняшние значения')}
        setNotice(failed.length?'Часть дневного отчёта не загрузилась: '+failed.join(', ')+'.':'')
      })
      .finally(()=>setLoading(false))
  },[preview])

  const fields=useMemo(()=>setup.filter(f=>f.section==='daily'&&f.enabled&&!f.hidden&&f.code in labels),[setup])

  async function save(){
    if(!setupLoaded||!wellbeingLoaded){setNotice('Дневной отчёт загружен не полностью. Сохранение временно отключено.');return}
    const missingRequired=fields.filter(field=>field.required&&value[field.code as keyof typeof labels]==null)
    if(missingRequired.length){setNotice('Заполни обязательные поля: '+missingRequired.map(field=>field.label).join(', '));return}
    setSaving(true);setSaved(false);setNotice('')
    try{
      if(!preview)await saveTodayWellbeing(value)
      setSaved(true)
      setTimeout(()=>setSaved(false),1800)
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить отчёт')}
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
            {[1,2,3,4,5].map(score=><button key={score} disabled={!wellbeingLoaded} className={current===score?'is-active':''} onClick={()=>setValue(v=>({...v,[code]:current===score?null:score}))}>{score}</button>)}
          </div>
        </div>
      })}
    </div>

    <label className="daily-comment">Комментарий <small>необязательно</small><textarea rows={2} disabled={!wellbeingLoaded} value={value.comment} onChange={e=>setValue(v=>({...v,comment:e.target.value}))} placeholder="Например: плохо спал или тренировка далась легче обычного"/></label>

    <div className="daily-checkin-actions">
      {notice&&<span>{notice}</span>}
      <button className="primary-button compact" disabled={saving||!wellbeingLoaded} onClick={()=>void save()}><Save size={14}/>{saving?'Сохраняю…':'Сохранить самочувствие'}</button>
    </div>
  </section>
}
