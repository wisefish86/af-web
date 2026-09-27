import { useEffect, useMemo, useState } from 'react'
import { Camera, Check, Save } from 'lucide-react'
import {
  isProgressPhotoDone, loadCurrentMonthCheckin, loadMeasurements, loadMyTrackingSetup,
  markProgressPhotoDone, saveCurrentMonthCheckin, saveMeasurement,
  type Measurement, type MonthlyCheckin, type TrackingFieldState
} from '../features/tracking/service'

type Props={preview:boolean}

const previewMeasurements:Measurement[]=[
  {id:'1',measured_at:'2026-09-27',weight_kg:89.6,waist_cm:96,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
  {id:'2',measured_at:'2026-09-24',weight_kg:89.9,waist_cm:null,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
  {id:'3',measured_at:'2026-09-21',weight_kg:90.2,waist_cm:97,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
  {id:'4',measured_at:'2026-09-17',weight_kg:90.8,waist_cm:null,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
  {id:'5',measured_at:'2026-09-13',weight_kg:91.4,waist_cm:99,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
]
const blankMonthly:MonthlyCheckin={appearance:null,fitness:null,physical_comfort:null,energy:null,sleep_recovery:null,nutrition:null,relationship_with_food:null,improve:'',next_step:'',keep:'',comment:''}
const monthlyMeta:{key:keyof Pick<MonthlyCheckin,'appearance'|'fitness'|'physical_comfort'|'energy'|'sleep_recovery'|'nutrition'|'relationship_with_food'>;label:string}[]=[
  {key:'appearance',label:'Как нравится внешний вид'},
  {key:'fitness',label:'Физическая форма'},
  {key:'physical_comfort',label:'Физический комфорт'},
  {key:'energy',label:'Энергия'},
  {key:'sleep_recovery',label:'Сон и восстановление'},
  {key:'nutrition',label:'Насколько устраивает питание'},
  {key:'relationship_with_food',label:'Отношения с едой'},
]

function valueOrNull(value:string){const n=Number(value.replace(',','.'));return value.trim()===''||!Number.isFinite(n)?null:n}
function display(value:number|null,digits=1){return value==null?'—':value.toFixed(digits).replace('.',',')}

export function ProgressPage({preview}:Props){
  const [measurements,setMeasurements]=useState<Measurement[]>(preview?previewMeasurements:[])
  const [setup,setSetup]=useState<TrackingFieldState[]>([])
  const [monthly,setMonthly]=useState<MonthlyCheckin>(blankMonthly)
  const [photoDone,setPhotoDone]=useState(preview)
  const [loading,setLoading]=useState(!preview)
  const [saving,setSaving]=useState(false)
  const [notice,setNotice]=useState('')
  const [quick,setQuick]=useState({weight:'',waist:'',note:''})
  const [monthlyMeasures,setMonthlyMeasures]=useState({chest:'',hips:'',thigh:'',arm_relaxed:'',arm_flexed:''})

  useEffect(()=>{
    if(preview){
      setSetup(['weight','waist','chest','hips','thigh','arm_relaxed','arm_flexed','appearance','fitness','physical_comfort','sleep_recovery','nutrition'].map(code=>({
        code,section:code==='weight'||code==='waist'?'measurements':code==='chest'||code==='hips'||code==='thigh'||code.startsWith('arm_')?'measurements':'monthly',
        label:code,unit:null,enabled:true,required:false,frequency:'monthly',client_can_disable:true,hidden:false,reminder_enabled:true,settings:{},
      })))
      setLoading(false)
      return
    }
    Promise.all([loadMeasurements(),loadMyTrackingSetup(),loadCurrentMonthCheckin(),isProgressPhotoDone()])
      .then(([m,s,mc,p])=>{setMeasurements(m);setSetup(s);setMonthly(mc);setPhotoDone(p)})
      .catch(e=>setNotice(e instanceof Error?e.message:'Не удалось загрузить прогресс'))
      .finally(()=>setLoading(false))
  },[preview])

  const isVisible=(code:string)=>{
    const field=setup.find(f=>f.code===code)
    return field ? field.enabled&&!field.hidden : true
  }

  const latestWeight=measurements.find(m=>m.weight_kg!=null)?.weight_kg??null
  const latestWaist=measurements.find(m=>m.waist_cm!=null)?.waist_cm??null
  const weightPoints=useMemo(()=>measurements.filter(m=>m.weight_kg!=null).slice(0,12).reverse(),[measurements])
  const chart=useMemo(()=>{
    if(weightPoints.length<2)return ''
    const vals=weightPoints.map(p=>p.weight_kg as number)
    const min=Math.min(...vals)-.2,max=Math.max(...vals)+.2
    return vals.map((p,i)=>(i/(vals.length-1)*100)+','+(100-(p-min)/(max-min)*100)).join(' ')
  },[weightPoints])

  async function saveQuick(){
    const weight=valueOrNull(quick.weight),waist=valueOrNull(quick.waist)
    if(weight==null&&waist==null){setNotice('Укажи вес или талию.');return}
    setSaving(true);setNotice('')
    try{
      if(!preview)await saveMeasurement({
        measured_at:new Date().toISOString().slice(0,10),weight_kg:weight,waist_cm:waist,
        chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:quick.note||null,
      })
      if(!preview)setMeasurements(await loadMeasurements())
      setQuick({weight:'',waist:'',note:''})
      setNotice('Замер сохранён.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить замер')}
    finally{setSaving(false)}
  }

  async function saveMonthly(){
    setSaving(true);setNotice('')
    try{
      if(!preview){
        await saveMeasurement({
          measured_at:new Date().toISOString().slice(0,10),weight_kg:null,waist_cm:null,
          chest_cm:valueOrNull(monthlyMeasures.chest),hips_cm:valueOrNull(monthlyMeasures.hips),
          thigh_cm:valueOrNull(monthlyMeasures.thigh),arm_relaxed_cm:valueOrNull(monthlyMeasures.arm_relaxed),
          arm_flexed_cm:valueOrNull(monthlyMeasures.arm_flexed),note:null,
        })
        await saveCurrentMonthCheckin(monthly)
        setMeasurements(await loadMeasurements())
      }
      setNotice('Ежемесячный обзор сохранён.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить ежемесячный обзор')}
    finally{setSaving(false)}
  }

  async function markPhoto(){
    try{
      if(!preview)await markProgressPhotoDone()
      setPhotoDone(true)
      setNotice('Отметил: фото прогресса сделано. Само фото в приложение не загружается.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить отметку')}
  }

  return <div className="page-stack progress-live-page">
    <div className="stats-grid compact-stats">
      <article className="stat-card"><div className="stat-label">Текущий вес</div><div className="stat-value">{display(latestWeight)}{latestWeight!=null?' кг':''}</div><div className="stat-unit">последний сохранённый</div></article>
      <article className="stat-card"><div className="stat-label">Талия</div><div className="stat-value">{display(latestWaist)}{latestWaist!=null?' см':''}</div><div className="stat-unit">последний сохранённый</div></article>
      <article className="stat-card"><div className="stat-label">Замеров веса</div><div className="stat-value">{measurements.filter(m=>m.weight_kg!=null).length}</div><div className="stat-unit">в истории</div></article>
    </div>

    {notice&&<div className="drawer-notice">{notice}</div>}

    {chart&&<section className="panel chart-panel">
      <div className="panel-head"><div><span className="eyebrow">История</span><h3>Динамика веса</h3></div></div>
      <div className="chart-wrap"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={chart} fill="none" vectorEffect="non-scaling-stroke"/></svg></div>
      <div className="chart-labels"><span>{weightPoints[0]?.measured_at}</span><span>{weightPoints.at(-1)?.measured_at}</span></div>
    </section>}

    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">Быстрый замер</span><h3>Вес и талия</h3></div></div>
      <p className="panel-description">Вес по стартовому плану — ПН/СР/СБ, талия — раз в неделю. Внести можно и в другой день.</p>
      <div className="measurement-form live-measurement-form">
        {isVisible('weight')&&<label>Вес, кг<input inputMode="decimal" value={quick.weight} onChange={e=>setQuick(v=>({...v,weight:e.target.value}))} placeholder="89,6"/></label>}
        {isVisible('waist')&&<label>Талия, см<input inputMode="decimal" value={quick.waist} onChange={e=>setQuick(v=>({...v,waist:e.target.value}))} placeholder="96"/></label>}
        <label className="wide">Комментарий<input value={quick.note} onChange={e=>setQuick(v=>({...v,note:e.target.value}))} placeholder="По желанию"/></label>
        <button className="primary-button compact" disabled={saving} onClick={()=>void saveQuick()}><Save size={15}/>{saving?'Сохраняю…':'Сохранить'}</button>
      </div>
    </section>

    <details className="panel monthly-progress-panel">
      <summary><div><span className="eyebrow">Раз в месяц</span><h3>Расширенный контроль</h3><p>Дополнительные объёмы, фото для себя и короткая оценка состояния.</p></div><span>Открыть</span></summary>

      <div className="monthly-progress-content">
        <section>
          <h4>Дополнительные замеры</h4>
          <div className="monthly-measure-grid">
            {isVisible('chest')&&<label>Грудь, см<input inputMode="decimal" value={monthlyMeasures.chest} onChange={e=>setMonthlyMeasures(v=>({...v,chest:e.target.value}))}/></label>}
            {isVisible('hips')&&<label>Бёдра, см<input inputMode="decimal" value={monthlyMeasures.hips} onChange={e=>setMonthlyMeasures(v=>({...v,hips:e.target.value}))}/></label>}
            {isVisible('thigh')&&<label>Бедро, см<input inputMode="decimal" value={monthlyMeasures.thigh} onChange={e=>setMonthlyMeasures(v=>({...v,thigh:e.target.value}))}/></label>}
            {isVisible('arm_relaxed')&&<label>Рука расслаблена, см<input inputMode="decimal" value={monthlyMeasures.arm_relaxed} onChange={e=>setMonthlyMeasures(v=>({...v,arm_relaxed:e.target.value}))}/></label>}
            {isVisible('arm_flexed')&&<label>Рука напряжена, см<input inputMode="decimal" value={monthlyMeasures.arm_flexed} onChange={e=>setMonthlyMeasures(v=>({...v,arm_flexed:e.target.value}))}/></label>}
          </div>
        </section>

        <section className="progress-photo-card">
          <div><Camera size={20}/><div><strong>Фото прогресса</strong><span>Сделай для себя в одинаковом свете и ракурсе. Загружать фото сюда не нужно.</span></div></div>
          <button className={photoDone?'ghost-button is-done':'ghost-button'} disabled={photoDone} onClick={()=>void markPhoto()}>{photoDone?<><Check size={15}/>Сделано в этом месяце</>:<>Отметить «сделано»</>}</button>
        </section>

        <section>
          <h4>Самооценка месяца</h4>
          <div className="monthly-score-grid">
            {monthlyMeta.filter(meta=>isVisible(meta.key)).map(meta=><label key={meta.key}><span>{meta.label}</span><select value={monthly[meta.key]??''} onChange={e=>setMonthly(v=>({...v,[meta.key]:e.target.value===''?null:Number(e.target.value)}))}><option value="">—</option>{Array.from({length:10},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}</select></label>)}
          </div>
          <div className="monthly-text-grid">
            <label>Что улучшить?<textarea rows={2} value={monthly.improve} onChange={e=>setMonthly(v=>({...v,improve:e.target.value}))}/></label>
            <label>Следующий шаг<textarea rows={2} value={monthly.next_step} onChange={e=>setMonthly(v=>({...v,next_step:e.target.value}))}/></label>
            <label>Что точно оставить?<textarea rows={2} value={monthly.keep} onChange={e=>setMonthly(v=>({...v,keep:e.target.value}))}/></label>
          </div>
          <button className="primary-button compact" disabled={saving} onClick={()=>void saveMonthly()}><Save size={15}/>Сохранить месяц</button>
        </section>
      </div>
    </details>

    {!loading&&measurements.length>0&&<section className="panel measurement-history-panel">
      <div className="panel-head"><div><span className="eyebrow">Последние записи</span><h3>История замеров</h3></div></div>
      <div className="measurement-history-list">{measurements.slice(0,12).map(m=><div key={m.id}><strong>{new Date(m.measured_at+'T00:00:00').toLocaleDateString('ru-RU')}</strong><span>{m.weight_kg!=null?'Вес '+display(m.weight_kg)+' кг':''}{m.weight_kg!=null&&m.waist_cm!=null?' · ':''}{m.waist_cm!=null?'Талия '+display(m.waist_cm)+' см':''}</span></div>)}</div>
    </section>}
  </div>
}
