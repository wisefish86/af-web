import { CalendarDays, ChevronRight, CircleCheck, Dumbbell } from 'lucide-react'
import { demoStats } from '../data/demo'
import { StatCard } from '../components/StatCard'

export function DashboardPage() {
  return <div className="page-stack">
    <section className="hero-card"><div><span className="eyebrow light">Сегодня</span><h2>Доброе утро, Сергей</h2><p>Идёшь по плану. Сегодня достаточно удержать питание и сделать тренировку без попытки «отработать» вчерашний день.</p></div><div className="hero-score"><strong>84</strong><span>балла недели</span></div></section>
    <div className="stats-grid">{demoStats.map((s)=><StatCard key={s.label} {...s}/>)}</div>
    <div className="two-column">
      <section className="panel"><div className="panel-head"><div><span className="eyebrow">Следующий шаг</span><h3>Тренировка A</h3></div><Dumbbell/></div><div className="next-action"><strong>4 упражнения · ~55 минут</strong><p>Последняя тренировка была 3 дня назад. Начни с тех же рабочих весов и добавляй только если остаётся нужный RIR.</p><button className="primary-button compact">Открыть тренировку <ChevronRight size={17}/></button></div></section>
      <section className="panel"><div className="panel-head"><div><span className="eyebrow">На этой неделе</span><h3>Ритм процесса</h3></div><CalendarDays/></div><ul className="check-list"><li><CircleCheck/>2 силовые тренировки</li><li><CircleCheck/>3 взвешивания</li><li><CircleCheck/>Белок ≥ цели: 6 из 7 дней</li><li className="pending"><span className="empty-check"/>Замер талии — завтра</li></ul></section>
    </div>
  </div>
}
