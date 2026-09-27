import { useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { demoExercises } from '../data/demo'

export function WorkoutsPage() {
  const [started, setStarted] = useState(false)
  return <div className="page-stack">
    <section className="workout-hero"><div><span className="eyebrow light">Программа · День A</span><h2>Верх тела</h2><p>Работай в заданном диапазоне и оставляй 1–2 повтора в запасе.</p></div><button onClick={()=>setStarted(true)} className="white-button">{started ? 'Тренировка идёт' : 'Начать тренировку'}</button></section>
    <div className="exercise-list">{demoExercises.map((ex,index)=><article className="exercise-card" key={ex.name}><div className="exercise-top"><div className="exercise-number">{index+1}</div><div className="exercise-title"><span>{ex.muscle}</span><h3>{ex.name}</h3><div className="scheme"><strong>{ex.scheme}</strong> · {ex.rir}</div></div><button className="icon-button" title="Выбрать замену"><ChevronDown/></button></div><div className="previous">Прошлый результат: <strong>{ex.previous}</strong></div><div className="sets-table"><div className="set-row header"><span>Подход</span><span>Вес, кг</span><span>Повторы</span><span>RIR</span></div>{[1,2,3].map(s=><div className="set-row" key={s}><strong>{s}</strong><input inputMode="decimal" placeholder="—"/><input inputMode="numeric" placeholder="—"/><input inputMode="numeric" placeholder="—"/></div>)}</div><button className="text-button"><Plus size={16}/>Добавить подход</button></article>)}</div>
    <button className="primary-button save-workout">Сохранить тренировку</button>
  </div>
}
