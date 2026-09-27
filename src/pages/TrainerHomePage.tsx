import { BookOpen, ChevronRight, CircleCheck, Layers3, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'

export function TrainerHomePage() {
  return (
    <div className="page-stack">
      <section className="hero-card trainer-hero">
        <div>
          <span className="eyebrow light">Сегодня</span>
          <h2>Кабинет тренера</h2>
          <p>Всё важное — клиенты, программы, питание и контроль — в одном месте. Без лишних таблиц.</p>
        </div>
        <div className="hero-score"><strong>2</strong><span>активных клиента</span></div>
      </section>

      <div className="trainer-quick-grid">
        <Link to="/clients" className="quick-action-card">
          <div className="quick-icon"><UsersRound size={22}/></div>
          <div><strong>Клиенты</strong><span>Настроить сопровождение и посмотреть прогресс</span></div>
          <ChevronRight size={18}/>
        </Link>
        <Link to="/builder" className="quick-action-card">
          <div className="quick-icon"><Layers3 size={22}/></div>
          <div><strong>Конструктор</strong><span>Программы тренировок и планы питания</span></div>
          <ChevronRight size={18}/>
        </Link>
      </div>

      <div className="two-column">
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Требует внимания</span><h3>На сегодня</h3></div></div>
          <ul className="activity-list">
            <li><span className="activity-dot warning"/><div><strong>Сергей</strong><span>Сегодня ещё не внёс вес</span></div><small>08:00</small></li>
            <li><span className="activity-dot good"/><div><strong>Влада</strong><span>Закрыла тренировку B</span></div><small>вчера</small></li>
          </ul>
        </section>
        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Система</span><h3>Готово к работе</h3></div><BookOpen size={20}/></div>
          <ul className="check-list compact-list">
            <li><CircleCheck/>Модульное подключение услуг</li>
            <li><CircleCheck/>Настраиваемые поля клиента</li>
            <li><CircleCheck/>Шаблоны тренировок и питания</li>
            <li><CircleCheck/>Контур Telegram-напоминаний</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
