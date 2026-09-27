import { Apple, ChevronRight, Dumbbell, LibraryBig, Plus, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

export function BuilderPage() {
  return (
    <div className="page-stack">
      <section className="section-intro builder-intro">
        <div>
          <span className="eyebrow">Конструктор</span>
          <h2>Создавай один раз — используй для разных клиентов</h2>
          <p>Библиотека упражнений, шаблоны тренировок и планы питания отделены от истории клиента. Можно развивать систему без потери прошлых данных.</p>
        </div>
        <button className="primary-button compact"><Plus size={17}/>Новый шаблон</button>
      </section>

      <div className="builder-grid">
        <article className="builder-card">
          <div className="builder-card-icon"><Dumbbell size={22}/></div>
          <div className="builder-card-copy">
            <span className="eyebrow">Тренировки</span>
            <h3>Программы тренировок</h3>
            <p>Дни, упражнения, диапазоны повторов, RIR, отдых и разрешённые замены.</p>
            <div className="builder-meta"><span>Шаблоны и версии</span><span className="status-pill">В работе</span></div>
          </div>
          <button className="icon-button"><ChevronRight/></button>
        </article>

        <article className="builder-card">
          <div className="builder-card-icon warm"><Apple size={22}/></div>
          <div className="builder-card-copy">
            <span className="eyebrow">Питание</span>
            <h3>Планы питания</h3>
            <p>Гибкие приёмы пищи, категории продуктов, индивидуальные исключения и порции.</p>
            <div className="builder-meta"><span>Меню-планы</span><span className="status-pill">Основа готова</span></div>
          </div>
          <button className="icon-button"><ChevronRight/></button>
        </article>
      </div>

      <section className="panel library-panel">
        <div className="panel-head">
          <div><span className="eyebrow">Библиотека</span><h3>Основа тренировочного конструктора</h3></div>
          <Link className="primary-button compact" to="/builder/exercises"><Plus size={15}/>Упражнение</Link>
        </div>

        <div className="library-stats">
          <Link to="/builder/exercises"><LibraryBig size={18}/><strong>Упражнения</strong><span>Мышцы, техника, теги, отдых</span></Link>
          <div><Sparkles size={18}/><strong>14</strong><span>групп мышц</span></div>
          <div><Dumbbell size={18}/><strong>Замены</strong><span>Группы взаимозаменяемых движений</span></div>
          <div><Apple size={18}/><strong>Продукты</strong><span>Следующий модуль после тренировок</span></div>
        </div>

        <Link className="library-example library-example-link" to="/builder/exercises">
          <div>
            <strong>Открыть библиотеку упражнений</strong>
            <span>Поиск, фильтры, chips, техника, стандартный отдых и группы замен</span>
          </div>
          <ChevronRight size={18}/>
        </Link>
      </section>
    </div>
  )
}
