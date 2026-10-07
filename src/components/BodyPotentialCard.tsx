import { useMemo, useRef, useState } from 'react'
import { Calculator, ChevronDown, Save } from 'lucide-react'
import { loadMyProfile, saveMyBodyProfile } from '../features/profile/service'
import { loadMyNutritionSetup } from '../features/nutrition/service'
import { showAppToast } from '../lib/toast'

type Props={
  preview:boolean
  latestWaist:number|null
  latestWeight:number|null
}

type Sex='male'|'female'|null
type Frame='small'|'medium'|'large'|null

function parseCm(value:string,min:number,max:number){
  const n=Number(value.replace(',','.'))
  return Number.isFinite(n)&&n>=min&&n<=max?n:null
}
function display(value:number|null,digits=1){
  return value==null?'—':value.toFixed(digits).replace('.',',')
}
function frameFromRatio(height:number,wrist:number,sex:Sex):Frame{
  if(!sex)return null
  const ratio=height/wrist
  if(sex==='male')return ratio>10.4?'small':ratio<9.6?'large':'medium'
  return ratio>10.9?'small':ratio<9.9?'large':'medium'
}
function frameLabel(frame:Frame){
  return frame==='small'?'Тонкий':frame==='medium'?'Средний':frame==='large'?'Крупный':'—'
}
function framePotentialLabel(frame:Frame){
  return frame==='small'?'Компактный':frame==='medium'?'Средний':frame==='large'?'Выше среднего по абсолютному объёму':'—'
}
function frameMuscleCopy(frame:Frame){
  if(frame==='small')return 'Тонкий каркас обычно означает более компактный абсолютный объём мышц. Это не говорит о том, насколько быстро они будут расти.'
  if(frame==='large')return 'Крупный каркас обычно позволяет нести больше абсолютной мышечной массы. Скорость набора всё равно определяется не запястьем.'
  if(frame==='medium')return 'Средний каркас — без выраженного смещения в сторону очень тонкого или очень крупного скелета.'
  return 'Для оценки каркаса нужны рост, запястье и пол из расчёта питания.'
}

function bodyProfileSignature(height:number|null,wrist:number|null){
  return JSON.stringify({height:height==null?null:Number(height),wrist:wrist==null?null:Number(wrist)})
}

export function BodyPotentialCard({preview,latestWaist,latestWeight}:Props){
  const [loaded,setLoaded]=useState(preview)
  const [loading,setLoading]=useState(false)
  const [saving,setSaving]=useState(false)
  const [height,setHeight]=useState(preview?'178':'')
  const [wrist,setWrist]=useState(preview?'18':'')
  const [sex,setSex]=useState<Sex>(preview?'male':null)
  const [notice,setNotice]=useState('')
  const bodyBaselineRef=useRef(bodyProfileSignature(preview?178:null,preview?18:null))

  async function ensureLoaded(){
    if(loaded||loading)return
    setLoading(true);setNotice('')
    const [profileResult,nutritionResult]=await Promise.allSettled([loadMyProfile(),loadMyNutritionSetup()])
    if(profileResult.status==='fulfilled'){
      const profile=profileResult.value
      setHeight(profile.height_cm==null?'':String(profile.height_cm).replace('.',','))
      setWrist(profile.wrist_cm==null?'':String(profile.wrist_cm).replace('.',','))
      bodyBaselineRef.current=bodyProfileSignature(profile.height_cm,profile.wrist_cm)
    }else setNotice('Не удалось загрузить исходные данные профиля.')
    if(nutritionResult.status==='fulfilled')setSex(nutritionResult.value?.sex_for_calculation??null)
    setLoaded(profileResult.status==='fulfilled')
    setLoading(false)
  }

  const heightCm=useMemo(()=>parseCm(height,100,250),[height])
  const wristCm=useMemo(()=>parseCm(wrist,10,30),[wrist])
  const waistRatio=heightCm!=null&&latestWaist!=null?latestWaist/heightCm:null
  const healthyWaistLow=heightCm!=null?heightCm*.40:null
  const healthyWaistHigh=heightCm!=null?heightCm*.49:null
  const halfHeight=heightCm!=null?heightCm*.50:null
  const classicWaist=wristCm!=null&&sex==='male'?wristCm*4.5:null
  const frame=heightCm!=null&&wristCm!=null?frameFromRatio(heightCm,wristCm,sex):null
  const bmi=heightCm!=null&&latestWeight!=null?latestWeight/Math.pow(heightCm/100,2):null

  async function save(){
    if(height.trim()&&heightCm==null){setNotice('Проверь рост: допустимо 100–250 см.');return}
    if(wrist.trim()&&wristCm==null){setNotice('Проверь запястье: допустимо 10–30 см.');return}
    if(heightCm==null){setNotice('Укажи рост.');return}
    if(!preview&&!loaded){setNotice('Исходные данные профиля ещё не загрузились. Закрой и снова открой этот блок или повтори позже.');return}
    setSaving(true);setNotice('')
    try{
      if(!preview){
        const before=await loadMyProfile()
        const serverBaseline=bodyProfileSignature(before.height_cm,before.wrist_cm)
        if(serverBaseline!==bodyBaselineRef.current){
          bodyBaselineRef.current=serverBaseline
          setNotice('Рост или запястье изменились на другом устройстве. Твои значения оставлены на экране. Проверь их и нажми «Сохранить» ещё раз, если хочешь заменить серверные данные.')
          return
        }
        await saveMyBodyProfile({height_cm:heightCm,wrist_cm:wristCm})
        const actual=await loadMyProfile()
        bodyBaselineRef.current=bodyProfileSignature(actual.height_cm,actual.wrist_cm)
        setHeight(actual.height_cm==null?'':String(actual.height_cm).replace('.',','))
        setWrist(actual.wrist_cm==null?'':String(actual.wrist_cm).replace('.',','))
      }
      showAppToast('Исходные данные сохранены.')
    }catch(error){
      if(!preview){
        try{
          const actual=await loadMyProfile()
          const actualHeight=actual.height_cm==null?null:Number(actual.height_cm)
          const actualWrist=actual.wrist_cm==null?null:Number(actual.wrist_cm)
          if(actualHeight===heightCm&&actualWrist===wristCm){
            bodyBaselineRef.current=bodyProfileSignature(actualHeight,actualWrist)
            setHeight(actualHeight==null?'':String(actualHeight).replace('.',','))
            setWrist(actualWrist==null?'':String(actualWrist).replace('.',','))
            showAppToast('Исходные данные уже были сохранены на сервере.','info')
            return
          }
        }catch{}
      }
      setNotice(error instanceof Error?error.message:'Не удалось сохранить исходные данные.')
    }finally{setSaving(false)}
  }

  return <details className="panel body-metrics-panel" onToggle={event=>{if((event.currentTarget as HTMLDetailsElement).open)void ensureLoaded()}}>
    <summary>
      <div className="body-metrics-summary-copy">
        <span className="eyebrow">Ориентиры</span>
        <div className="body-metrics-title-row"><h3>Каркас и композиция тела</h3><ChevronDown className="body-metrics-chevron" size={20}/></div>
        <p>Талия относительно роста, размер каркаса и классические пропорции — как ориентиры, а не как «идеал».</p>
      </div>
      <Calculator size={20}/>
    </summary>

    <div className="body-metrics-content">
      {loading?<div className="body-metrics-empty">Загружаю исходные данные…</div>:<>
        <div className="body-profile-inputs">
          <label className="body-height-field">Рост, см
            <input inputMode="decimal" value={height} onChange={e=>setHeight(e.target.value)} placeholder="Например, 178"/>
            <small>Постоянное значение профиля. Его можно исправить здесь или в Настройках.</small>
          </label>
          <label className="body-height-field">Запястье, см
            <input inputMode="decimal" value={wrist} onChange={e=>setWrist(e.target.value)} placeholder="Например, 18"/>
            <small>Измерь в самом узком месте, лента прилегает без сильного натяжения.</small>
          </label>
          <button className="primary-button compact body-profile-save" disabled={saving||heightCm==null} onClick={event=>{event.preventDefault();void save()}}><Save size={15}/>{saving?'Сохраняю…':'Сохранить'}</button>
        </div>

        {notice&&<div className="drawer-notice body-profile-notice">{notice}</div>}

        {heightCm==null
          ? <div className="body-metrics-empty">Укажи рост, чтобы появились ориентиры.</div>
          : <div className="body-metrics-grid body-potential-grid">
              <article>
                <span>Талия / рост</span>
                <strong>{waistRatio==null?'—':waistRatio.toFixed(2).replace('.',',')}</strong>
                <small>{waistRatio==null?'Нужен замер талии':waistRatio<.4?'Ниже референсного диапазона':waistRatio<.5?'Здоровый диапазон по центральной жировой массе':waistRatio<.6?'Повышенная центральная жировая масса':'Высокая центральная жировая масса'}</small>
              </article>
              <article>
                <span>Здоровый диапазон талии</span>
                <strong>{display(healthyWaistLow)}–{display(healthyWaistHigh)} см</strong>
                <small>40–49% роста. Главная простая граница — держать талию ниже {display(halfHeight)} см.</small>
              </article>
              <article>
                <span>Каркас</span>
                <strong>{frameLabel(frame)}</strong>
                <small>{wristCm==null?'Добавь запястье':sex==null?'Для классификации нужен пол из расчёта питания':`Рост / запястье = ${(heightCm/wristCm).toFixed(1).replace('.',',')}`}</small>
              </article>
              <article>
                <span>Классическая пропорция</span>
                <strong>{classicWaist==null?'—':display(classicWaist)+' см'}</strong>
                <small>{wristCm==null?'Добавь запястье':sex==='female'?'Историческая формула МакКаллума ориентирована на мужские бодибилдинг-пропорции — здесь её не показываем.':sex==null?'Нужен пол из расчёта питания.':'≈ 4,5× запястье. Это эстетический ориентир МакКаллума, не медицинская цель.'}</small>
              </article>
              <article className="body-potential-wide">
                <span>Что каркас говорит о мышцах</span>
                <strong>{framePotentialLabel(frame)}</strong>
                <small>{frameMuscleCopy(frame)}</small>
              </article>
              <article className="body-potential-wide">
                <span>Вес</span>
                <strong>{bmi==null?'Не делаем целью':`ИМТ ${bmi.toFixed(1).replace('.',',')} — только справочно`}</strong>
                <small>При той же талии человек с большей мышечной массой может весить заметно больше. Поэтому здесь важнее талия, её динамика и силовой прогресс, а не одно «идеальное» число на весах.</small>
              </article>
            </div>}

        <details className="body-metrics-method">
          <summary>Как это считается и насколько этому верить</summary>
          <div>
            <p><b>Талия / рост.</b> Для взрослых диапазон 0,40–0,49 используют как ориентир здоровой центральной жировой массы; 0,50 и выше связан с ростом рисков.</p>
            <p><b>Каркас.</b> Запястье относительно роста — грубая оценка размера скелетного каркаса. Она не измеряет мышцы и не предсказывает скорость их набора.</p>
            <p><b>Классическая пропорция.</b> Формула 4,5× запястье пришла из бодибилдинга и нужна только как любопытный ориентир пропорций. Она не должна быть обязательной целью.</p>
          </div>
        </details>
      </>}
    </div>
  </details>
}
