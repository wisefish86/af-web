import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BodyPotentialCard } from '../components/BodyPotentialCard'
import { loadMeasurements, type Measurement } from '../features/tracking/service'
import { UiLoadError, UiStack } from '../ui/primitives'

type Props={preview:boolean}

const previewMeasurements:Measurement[]=[
  {id:'1',measured_at:'2026-09-27',weight_kg:89.6,waist_cm:96,chest_cm:null,hips_cm:null,thigh_cm:null,arm_relaxed_cm:null,arm_flexed_cm:null,note:null},
]

export function BodyCompositionPage({preview}:Props){
  const [measurements,setMeasurements]=useState<Measurement[]>(preview?previewMeasurements:[])
  const [error,setError]=useState('')
  const [reloadKey,setReloadKey]=useState(0)

  useEffect(()=>{
    if(preview)return
    let cancelled=false
    setError('')
    loadMeasurements()
      .then(value=>{if(!cancelled)setMeasurements(value)})
      .catch(()=>{if(!cancelled)setError('Не удалось загрузить последние замеры.')})
    return()=>{cancelled=true}
  },[preview,reloadKey])

  const latestWeight=measurements.find(item=>item.weight_kg!=null)?.weight_kg??null
  const latestWaist=measurements.find(item=>item.waist_cm!=null)?.waist_cm??null

  return <UiStack className="settings-page">
    <Link className="ghost-button compact settings-back-link" to="/useful"><ArrowLeft size={16}/>Полезное</Link>
    <section className="section-intro hub-hero">
      <div>
        <span className="eyebrow">Полезное · расчёты</span>
        <h2>Каркас и композиция тела</h2>
        <p>Ориентиры по талии, росту и каркасу. Это справочные расчёты, а не медицинская диагностика и не обязательные цели.</p>
      </div>
    </section>
    {error&&<UiLoadError message={error} onRetry={()=>setReloadKey(value=>value+1)} retryLabel="Повторить загрузку"/>}
    <BodyPotentialCard preview={preview} latestWaist={latestWaist} latestWeight={latestWeight} defaultOpen/>
  </UiStack>
}
