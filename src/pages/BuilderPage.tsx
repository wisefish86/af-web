import { Apple, ChevronRight, Dumbbell, LibraryBig, Plus, Sparkles } from 'lucide-react'

export function BuilderPage() {
  return (
    <div className="page-stack">
      <section className="section-intro builder-intro">
        <div>
          <span className="eyebrow">Конструктор</span>
          <h2>Создавай один раз — используй для разных клиентов</h2>
          <p>Шаблоны не меняют историю клиента. Новая версия программы создаётся отдельно и назначается тогда, когда ты готов.</p>
        </div>
        <button className="primary-button compact"><Plus size={17}/>Новый шаблон</button>
      </section>

      <div className="builder-grid">
        <article className="builder-card">
          <div className="builder-card-icon"><Dumbbell size={22}/></div>
          <div className="builder-card-copy">
            <span className="eyebrow">Тренировки</span>
            <h3>Full Body · 3 дня</h3>
            <p>3 тренировочных дня · 18 упражнений · замены настроены</p>
            <div className="builder-meta"><span>v3</span><span className="status-pill">Активная</span></div>
          </div>
          <button className="icon-button"><ChevronRight/></button>
        </article>

        <article className="builder-card">
          <div className="builder-card-icon warm"><Apple size={22}/></div>
          <div className="builder-card-copy">
            <span className="eyebrow">Питание</span>
            <h3>Гибкий план · 4 приёма</h3>
            <p>Завтрак · обед · ужин · перекус, продукты выбираются по категориям</p>
            <div className="builder-meta"><span>2300 ккал</span><span className="status-pill">Активный</span></div>
          </div>
          <button className="icon-button"><ChevronRight/></button>
        </article>
      </div>

      <section className="panel library-panel">
        <div className="panel-head">
          <div><span className="eyebrow">Библиотека</span><h3>Основа конструктора</h3></div>
          <button className="ghost-button"><Plus size={15}/>Добавить</button>
        </div>
        <div className="library-stats">
          <div><LibraryBig size={18}/><strong>34</strong><span>упражнения</span></div>
          <div><Sparkles size={18}/><strong>14</strong><span>групп мышц</span></div>
          <div><Dumbbell size={18}/><strong>11</strong><span>групп замен</span></div>
          <div><Apple size={18}/><strong>198</strong><span>продуктов</span></div>
        </div>
        <div className="library-example">
          <div><strong>Жим гантелей на наклонной скамье</strong><span>Грудь · основное упражнение</span></div>
          <div className="chip-row"><span className="soft-chip">Главное</span><span className="soft-chip">Замены: 2</span><span className="soft-chip">8–12 повторов</span></div>
        </div>
      </section>
    </div>
  )
}
