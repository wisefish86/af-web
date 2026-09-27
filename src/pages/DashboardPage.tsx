import { CalendarDays, ChevronRight, CircleCheck, Dumbbell } from 'lucide-react'
import { demoStats } from '../data/demo'
import { StatCard } from '../components/StatCard'

type Props = { name: string; enabledModules: string[] }

export function DashboardPage({ name, enabledModules }: Props) {
  const stats = demoStats.filter(stat => {
    if (['Калории','Белок'].includes(stat.label)) return enabledModules.includes('nutrition')
    if (stat.label === 'Вес') return enabledModules.includes('progress')
    if (stat.label === 'Тренировки') return enabledModules.includes('training')
    return true
  })

  const hasTraining = enabledModules.includes('training')
  const hasNutrition = enabledModules.includes('nutrition')
  const hasProgress = enabledModules.includes('progress')

  return (
    <div className="page-stack">
      <section className="hero-card">
        <div>
          <span className="eyebrow light">Сегодня</span>
          <h2>Доброе утро, {name}</h2>
          <p>Здесь только то, что относится к твоему текущему плану. Ненужные разделы и показатели не отвлекают.</p>
        </div>
        <div className="hero-score"><strong>84</strong><span>балла недели</span></div>
      </section>

      {stats.length > 0 && <div className={`stats-grid ${stats.length < 4 ? 'stats-grid-adaptive' : ''}`}>
        {stats.map(stat => <StatCard key={stat.label} {...stat}/>)}
      </div>}

      <div className="two-column">
        {hasTraining && <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Следующий шаг</span><h3>Тренировка A</h3></div><Dumbbell/></div>
          <div className="next-action">
            <strong>4 упражнения · ~55 минут</strong>
            <p>Начни с прошлых рабочих весов. Добавляй только если остаётся заданный запас повторов.</p>
            <button className="primary-button compact">Открыть тренировку <ChevronRight size={17}/></button>
          </div>
        </section>}

        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">На этой неделе</span><h3>Ритм процесса</h3></div><CalendarDays/></div>
          <ul className="check-list">
            {hasTraining && <li><CircleCheck/>2 силовые тренировки</li>}
            {hasProgress && <li><CircleCheck/>3 взвешивания</li>}
            {hasNutrition && <li><CircleCheck/>Белок ≥ цели: 6 из 7 дней</li>}
            {hasProgress && <li className="pending"><span className="empty-check"/>Замер талии — завтра</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}
