import { useEffect, useMemo, useState } from 'react'
import { Calculator, Camera, CheckCircle2, ChevronDown, RotateCcw, Save } from 'lucide-react'
import {
  isProgressPhotoDone, loadCurrentMonthCheckin, loadMeasurements, loadMyTrackingSetup,
  setProgressPhotoDone, saveMeasurement, saveMonthlyProgress,
  type Measurement, type MonthlyCheckin, type TrackingFieldState
} from '../features/tracking/service'
import { loadMyNutritionSetup } from '../features/nutrition/service'
import { appDateKey } from '../lib/appDate'

type Props={preview:boolean}

const previewMeasurements:Measurement[]=[
  {id:'1',measured_at:'2026-09-27',weight_kg:89.6,waist_cm:96,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
  {id:'2',measured_at:'2026-09-24',weight_kg:89.9,waist_cm:null,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
  {id:'3',measured_at:'2026-09-21',weight_kg:90.2,waist_cm:97,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
  {id:'4',measured_at:'2026-09-17',weight_kg:90.8,waist_cm:null,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
  {id:'5',measured_at:'2026-09-13',weight_kg:91.4,waist_cm:99,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
]
const blankMonthly:MonthlyCheckin={appearance:null,fitness:null,physical_comfort:null,energy:null,sleep_recovery:null,nutrition:null,relationship_with_food:null,improve:'',next_step:'',keep:'',comment:''}
const monthlyMeta:{key:keyof Pick<MonthlyCheckin,'appearance'|'fitness'|'physical_comfort'|'energy'|'sleep_recovery'|'nutrition'|'relationship_with_food'>;visibilityCode:string;label:string}[]=[
  {key:'appearance',visibilityCode:'appearance',label:'Как нравится внешний вид'},
  {key:'fitness',visibilityCode:'fitness',label:'Физическая форма'},
  {key:'physical_comfort',visibilityCode:'physical_comfort',label:'Физический комфорт'},
  {key:'energy',visibilityCode:'monthly_energy',label:'Энергия за месяц'},
  {key:'sleep_recovery',visibilityCode:'sleep_recovery',label:'Сон и восстановление'},
  {key:'nutrition',visibilityCode:'nutrition',label:'Насколько устраивает питание'},
  {key:'relationship_with_food',visibilityCode:'relationship_with_food',label:'Отношения с едой'},
]

function valueOrNull(value:string){const n=Number(value.replace(',','.'));return value.trim()===''||!Number.isFinite(n)?null:n}
function display(value:number|null,digits=1){return value==null?'—':value.toFixed(digits).replace('.',',')}

export function ProgressPage({preview}:Props){
  const [measurements,setMeasurements]=useState<Measurement[]>(preview?previewMeasurements:[])
  const [setup,setSetup]=useState<TrackingFieldState[]>([])
  const [monthly,setMonthly]=useState<MonthlyCheckin>(blankMonthly)
  const [photoDone,setPhotoDone]=useState(preview)
  const [photoSaving,setPhotoSaving]=useState(false)
  const [loading,setLoading]=useState(!preview)
  const [saving,setSaving]=useState(false)
  const [notice,setNotice]=useState('')
  const [quick,setQuick]=useState({weight:'',waist:'',note:''})
  const [editingQuick,setEditingQuick]=useState(false)
  const [monthlyMeasures,setMonthlyMeasures]=useState({chest:'',hips:'',thigh:'',arm_relaxed:'',arm_flexed:''})
  const [bodyHeight,setBodyHeight]=useState(preview?'175':'')

  useEffect(()=>{
    if(preview){
      setSetup(['weight','waist','chest','hips','thigh','arm_relaxed','arm_flexed','appearance','fitness','physical_comfort','sleep_recovery','nutrition'].map(code=>({
        code,section:code==='weight'||code==='waist'?'measurements':code==='chest'||code==='hips'||code==='thigh'||code.startsWith('arm_')?'measurements':'monthly',
        label:code,unit:null,enabled:true,required:false,frequency:'monthly',client_can_disable:true,hidden:false,reminder_enabled:true,settings:{},
      })))
      setLoading(false)
      return
    }
    Promise.all([loadMeasurements(),loadMyTrackingSetup(),loadCurrentMonthCheckin(),isProgressPhotoDone(),loadMyNutritionSetup()])
      .then(([m,s,mc,p,nutritionSetup])=>{setMeasurements(m);setSetup(s);setMonthly(mc);setPhotoDone(p)
        if(nutritionSetup?.height_cm)setBodyHeight(String(nutritionSetup.height_cm))
        const today=appDateKey()
        const current=m.find(x=>x.measured_at===today)
        if(current)setQuick({weight:current.weight_kg==null?'':String(current.weight_kg).replace('.',','),waist:current.waist_cm==null?'':String(current.waist_cm).replace('.',','),note:current.note??''})
        const month=today.slice(0,7)
        const monthlyMeasurement=m.find(x=>x.measured_at.startsWith(month)&&(
          x.chest_cm!=null||x.hips_cm!=null||x.thigh_cm!=null||x.arm_relaxed_cm!=null||x.arm_flexed_cm!=null
        ))
        if(monthlyMeasurement)setMonthlyMeasures({
          chest:monthlyMeasurement.chest_cm==null?'':String(monthlyMeasurement.chest_cm).replace('.',','),
          hips:monthlyMeasurement.hips_cm==null?'':String(monthlyMeasurement.hips_cm).replace('.',','),
          thigh:monthlyMeasurement.thigh_cm==null?'':String(monthlyMeasurement.thigh_cm).replace('.',','),
          arm_relaxed:monthlyMeasurement.arm_relaxed_cm==null?'':String(monthlyMeasurement.arm_relaxed_cm).replace('.',','),
          arm_flexed:monthlyMeasurement.arm_flexed_cm==null?'':String(monthlyMeasurement.arm_flexed_cm).replace('.',','),
        })
      })
      .catch(e=>setNotice(e instanceof Error?e.message:'Не удалось загрузить прогресс'))
      .finally(()=>setLoading(false))
  },[preview])

  const isVisible=(code:string)=>{
    const field=setup.find(f=>f.code===code)
    return field ? field.enabled&&!field.hidden : true
  }
  const isRequired=(code:string)=>{
    const field=setup.find(f=>f.code===code)
    return Boolean(field?.enabled&&!field.hidden&&field.required)
  }

  const todayKey=appDateKey()
  const todayMeasurement=measurements.find(m=>m.measured_at===todayKey)
  const quickAlreadySaved=Boolean(todayMeasurement&&(todayMeasurement.weight_kg!=null||todayMeasurement.waist_cm!=null))
  const latestWeight=measurements.find(m=>m.weight_kg!=null)?.weight_kg??null
  const latestWaist=measurements.find(m=>m.waist_cm!=null)?.waist_cm??null
  const weightEntries=useMemo(()=>measurements.filter(m=>m.weight_kg!=null),[measurements])
  const waistEntries=useMemo(()=>measurements.filter(m=>m.waist_cm!=null),[measurements])
  const startWeight=weightEntries.at(-1)?.weight_kg??null
  const startWaist=waistEntries.at(-1)?.waist_cm??null
  const sevenDayAverage=useMemo(()=>{
    if(!weightEntries.length)return null
    const newest=new Date(weightEntries[0].measured_at+'T00:00:00').getTime()
    const recent=weightEntries.filter(m=>newest-new Date(m.measured_at+'T00:00:00').getTime()<=6*86400000)
    return recent.length?recent.reduce((sum,m)=>sum+(m.weight_kg??0),0)/recent.length:null
  },[weightEntries])
  const previousSevenDayAverage=useMemo(()=>{
    if(!weightEntries.length)return null
    const newest=new Date(weightEntries[0].measured_at+'T00:00:00').getTime()
    const prior=weightEntries.filter(m=>{
      const age=newest-new Date(m.measured_at+'T00:00:00').getTime()
      return age>=7*86400000&&age<=13*86400000
    })
    return prior.length?prior.reduce((sum,m)=>sum+(m.weight_kg??0),0)/prior.length:null
  },[weightEntries])
  const weeklyWeightDelta=sevenDayAverage!=null&&previousSevenDayAverage!=null?sevenDayAverage-previousSevenDayAverage:null
  const heightCm=useMemo(()=>{
    const value=Number(bodyHeight.replace(',','.'))
    return Number.isFinite(value)&&value>=100&&value<=250?value:null
  },[bodyHeight])
  const bmi=heightCm!=null&&latestWeight!=null?latestWeight/Math.pow(heightCm/100,2):null
  const waistHeightRatio=heightCm!=null&&latestWaist!=null?latestWaist/heightCm:null
  const halfHeightWaist=heightCm!=null?heightCm/2:null
  const weightPoints=useMemo(()=>weightEntries.slice(0,12).reverse(),[weightEntries])
  const chart=useMemo(()=>{
    if(weightPoints.length<2)return ''
    const vals=weightPoints.map(p=>p.weight_kg as number)
    const min=Math.min(...vals)-.2,max=Math.max(...vals)+.2
    return vals.map((p,i)=>(i/(vals.length-1)*100)+','+(100-(p-min)/(max-min)*100)).join(' ')
  },[weightPoints])

  async function saveQuick(){
    const weight=valueOrNull(quick.weight),waist=valueOrNull(quick.waist)
    const missingRequired=[
      isRequired('weight')&&weight==null?'Вес':null,
      isRequired('waist')&&waist==null?'Талия':null,
    ].filter(Boolean) as string[]
    if(missingRequired.length){setNotice('Заполни обязательные поля: '+missingRequired.join(', '));return}
    if(weight==null&&waist==null){setNotice('Укажи вес или талию.');return}
    setSaving(true);setNotice('')
    try{
      if(!preview)await saveMeasurement({
        measured_at:appDateKey(),weight_kg:weight,waist_cm:waist,
        chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:quick.note,
      })
      if(!preview)setMeasurements(await loadMeasurements())
      setQuick({weight:weight==null?'':String(weight).replace('.',','),waist:waist==null?'':String(waist).replace('.',','),note:quick.note})
      setNotice(quickAlreadySaved?'Сегодняшний замер изменён.':'Замер за сегодня сохранён.')
      setEditingQuick(false)
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить замер')}
    finally{setSaving(false)}
  }

  async function saveMonthly(){
    const requiredMeasureValues=[
      {code:'chest',label:'Грудь',value:valueOrNull(monthlyMeasures.chest)},
      {code:'hips',label:'Бёдра',value:valueOrNull(monthlyMeasures.hips)},
      {code:'thigh',label:'Бедро',value:valueOrNull(monthlyMeasures.thigh)},
      {code:'arm_relaxed',label:'Рука расслаблена',value:valueOrNull(monthlyMeasures.arm_relaxed)},
      {code:'arm_flexed',label:'Рука напряжена',value:valueOrNull(monthlyMeasures.arm_flexed)},
    ]
    const missingRequired=[
      ...requiredMeasureValues.filter(item=>isRequired(item.code)&&item.value==null).map(item=>item.label),
      ...monthlyMeta.filter(meta=>isRequired(meta.visibilityCode)&&monthly[meta.key]==null).map(meta=>meta.label),
    ]
    if(missingRequired.length){setNotice('Заполни обязательные поля: '+missingRequired.join(', '));return}
    setSaving(true);setNotice('')
    try{
      if(!preview){
        await saveMonthlyProgress({
          measured_at:appDateKey(),
          chest_cm:valueOrNull(monthlyMeasures.chest),hips_cm:valueOrNull(monthlyMeasures.hips),
          thigh_cm:valueOrNull(monthlyMeasures.thigh),arm_relaxed_cm:valueOrNull(monthlyMeasures.arm_relaxed),
          arm_flexed_cm:valueOrNull(monthlyMeasures.arm_flexed),
        },monthly)
        setMeasurements(await loadMeasurements())
      }
      setNotice('Ежемесячный обзор сохранён.')
    }catch(e){setNotice(e instanceof Error?e.message:'Не удалось сохранить ежемесячный обзор')}
    finally{setSaving(false)}
  }

  async function togglePhoto(done:boolean){
    const previous=photoDone
    setPhotoDone(done)
    setPhotoSaving(true)
    setNotice('')
    try{
      if(!preview)await setProgressPhotoDone(done)
      setNotice(done?'Фото отмечено как сделанное в этом месяце.':'Отметка о фото снята.')
    }catch(e){
      setPhotoDone(previous)
      setNotice(e instanceof Error?e.message:'Не удалось сохранить отметку')
    }finally{
      setPhotoSaving(false)
    }
  }

  return <div className="page-stack progress-live-page">
    <div className="stats-grid compact-stats progress-summary-grid">
      <article className="stat-card"><div className="stat-label">Средний вес · 7 дней</div><div className="stat-value">{display(sevenDayAverage)}{sevenDayAverage!=null?' кг':''}</div><div className="stat-unit">{weeklyWeightDelta==null?'Нужно больше записей':`${weeklyWeightDelta>0?'+':''}${display(weeklyWeightDelta)} кг к прошлой неделе`}</div></article>
      <article className="stat-card"><div className="stat-label">Талия</div><div className="stat-value">{display(latestWaist)}{latestWaist!=null?' см':''}</div><div className="stat-unit">{latestWaist!=null&&startWaist!=null?`${latestWaist-startWaist>0?'+':''}${display(latestWaist-startWaist)} см от старта`:'последний сохранённый'}</div></article>
      <article className="stat-card"><div className="stat-label">Вес от старта</div><div className="stat-value">{latestWeight!=null&&startWeight!=null?`${latestWeight-startWeight>0?'+':''}${display(latestWeight-startWeight)} кг`:'—'}</div><div className="stat-unit">{startWeight!=null?`старт: ${display(startWeight)} кг`:'пока нет стартового замера'}</div></article>
    </div>

    <details className="panel body-metrics-panel">
      <summary>
        <div className="body-metrics-summary-copy">
          <span className="eyebrow">Калькуляторы</span>
          <div className="body-metrics-title-row"><h3>Показатели тела</h3><ChevronDown className="body-metrics-chevron" size={20}/></div>
          <p>Полезные ориентиры по росту, весу и талии — без попытки вычислить «идеальное тело».</p>
        </div>
        <Calculator size={20}/>
      </summary>
      <div className="body-metrics-content">
        <label className="body-height-field">Рост, см
          <input inputMode="decimal" value={bodyHeight} onChange={e=>setBodyHeight(e.target.value)} placeholder="Например, 175"/>
          <small>{bodyHeight?'Можно изменить только для расчёта.':'Если уже рассчитывал питание, рост подставится автоматически.'}</small>
        </label>

        {heightCm==null
          ? <div className="body-metrics-empty">Укажи рост, чтобы рассчитать показатели.</div>
          : <div className="body-metrics-grid">
              <article>
                <span>Талия / рост</span>
                <strong>{waistHeightRatio==null?'—':waistHeightRatio.toFixed(2).replace('.',',')}</strong>
                <small>{waistHeightRatio==null?'Нужен замер талии':waistHeightRatio<.5?'Сейчас ниже 0,50':'Сейчас 0,50 или выше'}</small>
              </article>
              <article>
                <span>Ориентир 0,50</span>
                <strong>{halfHeightWaist==null?'—':display(halfHeightWaist)}{halfHeightWaist!=null?' см':''}</strong>
                <small>Это половина роста, а не «идеальная талия»</small>
              </article>
              <article>
                <span>ИМТ</span>
                <strong>{bmi==null?'—':bmi.toFixed(1).replace('.',',')}</strong>
                <small>{bmi==null?'Нужен замер веса':'Справочно: ИМТ не отличает мышцы от жира'}</small>
              </article>
              <article>
                <span>Талия от старта</span>
                <strong>{latestWaist!=null&&startWaist!=null?(latestWaist-startWaist>0?'+':'')+display(latestWaist-startWaist)+' см':'—'}</strong>
                <small>{startWaist!=null?'Старт: '+display(startWaist)+' см':'Пока недостаточно данных'}</small>
              </article>
            </div>}
        <p className="body-metrics-note">Отношение талии к росту полезнее фиксированной «нормы талии»: ориентир 0,50 учитывает рост. Эти показатели нужны для наблюдения за динамикой и не являются диагнозом.</p>
      </div>
    </details>

    {notice&&<div className="drawer-notice">{notice}</div>}

    {chart&&<section className="panel chart-panel">
      <div className="panel-head"><div><span className="eyebrow">История</span><h3>Динамика веса</h3></div></div>
      <div className="chart-wrap"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={chart} fill="none" vectorEffect="non-scaling-stroke"/></svg></div>
      <div className="chart-labels"><span>{weightPoints[0]?.measured_at}</span><span>{weightPoints.at(-1)?.measured_at}</span></div>
    </section>}

    <section className={'panel quick-measure-panel '+(quickAlreadySaved&&!editingQuick?'is-complete':'')}>
      <div className="panel-head"><div><span className="eyebrow">Быстрый замер</span><h3>Вес и талия</h3></div>{quickAlreadySaved&&<span className="measurement-saved-badge"><CheckCircle2 size={15}/>Сегодня заполнено</span>}</div>
      {quickAlreadySaved&&!editingQuick
        ? <div className="quick-measure-complete"><div className="quick-measure-values">{isVisible('weight')&&todayMeasurement?.weight_kg!=null&&<span><small>Вес</small><strong>{display(todayMeasurement.weight_kg)} кг</strong></span>}{isVisible('waist')&&todayMeasurement?.waist_cm!=null&&<span><small>Талия</small><strong>{display(todayMeasurement.waist_cm)} см</strong></span>}</div>{todayMeasurement?.note&&<p className="quick-measure-saved-note">{todayMeasurement.note}</p>}<button className="ghost-button compact" onClick={()=>setEditingQuick(true)}>Изменить</button></div>
        : <><p className="panel-description">Вес можно вносить в любой день — для прогресса приложение ориентируется на среднее за 7 дней. Талию достаточно измерять раз в неделю в одинаковых условиях.</p>
          <p className="measurement-note-hint">Комментарий необязателен. Например: утром натощак, после тренировки или необычный режим.</p>
          <div className="measurement-form live-measurement-form">
            {isVisible('weight')&&<label>Вес, кг<input className="measurement-value-input" inputMode="decimal" value={quick.weight} onChange={e=>setQuick(v=>({...v,weight:e.target.value}))} placeholder={latestWeight!=null?display(latestWeight):'Введите вес'}/></label>}
            {isVisible('waist')&&<label>Талия, см<input className="measurement-value-input" inputMode="decimal" value={quick.waist} onChange={e=>setQuick(v=>({...v,waist:e.target.value}))} placeholder={latestWaist!=null?display(latestWaist):'Введите талию'}/></label>}
            <label className="wide">Комментарий<textarea className="quick-measure-note" rows={1} value={quick.note} onChange={e=>setQuick(v=>({...v,note:e.target.value}))} placeholder="Комментарий к замеру…"/></label>
            <div className="quick-measure-actions">{quickAlreadySaved&&<button className="ghost-button compact" onClick={()=>setEditingQuick(false)}>Отмена</button>}<button className="primary-button compact" disabled={saving} onClick={()=>void saveQuick()}><Save size={15}/>{saving?'Сохраняю…':quickAlreadySaved?'Сохранить изменения':'Сохранить замер'}</button></div>
          </div></>}
    </section>

    <details className="panel monthly-progress-panel">
      <summary><div className="monthly-progress-summary-copy"><span className="eyebrow">Раз в месяц</span><div className="monthly-progress-title-row"><h3>Расширенный контроль</h3><ChevronDown className="monthly-progress-chevron" size={20}/></div><p>Дополнительные объёмы, фото для себя и короткая оценка состояния.</p></div></summary>

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

        <section className={'progress-photo-card '+(photoDone?'is-complete':'')}>
          <div><Camera size={20}/><div><strong>Фото прогресса</strong><span>Сделай для себя в одинаковом свете и ракурсе. Загружать фото сюда не нужно.</span></div></div>
          {photoDone
            ? <div className="progress-photo-status"><span><CheckCircle2 size={16}/>Отмечено в этом месяце</span><button type="button" className="ghost-button compact" disabled={photoSaving} onClick={()=>void togglePhoto(false)}><RotateCcw size={14}/>{photoSaving?'Сохраняю…':'Отменить отметку'}</button></div>
            : <button type="button" className="primary-button compact" disabled={photoSaving} onClick={()=>void togglePhoto(true)}><CheckCircle2 size={15}/>{photoSaving?'Сохраняю…':'Фото сделано'}</button>}
        </section>

        <section>
          <h4>Самооценка месяца</h4>
          <div className="monthly-score-grid">
            {monthlyMeta.filter(meta=>isVisible(meta.visibilityCode)).map(meta=><div className="monthly-score-field" key={meta.key}><span className="monthly-score-label">{meta.label}</span><div className="monthly-score-scale" role="group" aria-label={meta.label}>{Array.from({length:10},(_,i)=>i+1).map(n=><button key={n} type="button" className={monthly[meta.key]===n?'is-selected':''} aria-pressed={monthly[meta.key]===n} onClick={()=>setMonthly(v=>({...v,[meta.key]:v[meta.key]===n?null:n}))}>{n}</button>)}</div><div className="monthly-score-anchors"><span>Плохо</span><span>Отлично</span></div></div>)}
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
      <div className="measurement-history-list">{measurements.slice(0,12).map(m=><div key={m.id}><strong>{new Date(m.measured_at+'T00:00:00').toLocaleDateString('ru-RU')}</strong><div className="measurement-history-entry"><span>{m.weight_kg!=null?'Вес '+display(m.weight_kg)+' кг':''}{m.weight_kg!=null&&m.waist_cm!=null?' · ':''}{m.waist_cm!=null?'Талия '+display(m.waist_cm)+' см':''}</span>{m.note&&<small className="measurement-history-note">{m.note}</small>}</div></div>)}</div>
    </section>}
  </div>
}
