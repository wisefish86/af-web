import { useEffect, useState } from 'react'
import { Apple, ChevronRight, Dumbbell, LibraryBig, Plus, Repeat2, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { loadTrainerPrograms, type TrainerProgramSummary } from '../features/programs/service'

export function BuilderPage() {
  const [programs,setPrograms]=useState<TrainerProgramSummary[]>([])
  const [notice,setNotice]=useState('')
  useEffect(()=>{loadTrainerPrograms().then(setPrograms).catch(e=>setNotice(e instanceof Error?e.message:'Не удалось загрузить программы'))},[])
  return (
    <div className="page-stack">
      <section className="section-intro builder-intro">
        <div>
          <span className="eyebrow">Конструктор</span>
          <h2>Создавай один раз — используй для разных клиентов</h2>
          <p>Библиотека упражнений, программы тренировок и планы питания отделены от истории клиента. Система остаётся гибкой и расширяемой.</p>
        </div>
      </section>

      <div className="builder-grid">
        <Link className="builder-card builder-card-link" to="/builder/programs/new">
          <div className="builder-card-icon"><Dumbbell size={22}/></div>
          <div className="builder-card-copy">
            <span className="eyebrow">Тренировки</span>
            <h3>Создать программу</h3>
            <p>Одна Full Body или несколько силовых, смешанных и кардио-сессий.</p>
            <div className="builder-meta"><span>Подходы · повторы · RIR · отдых</span><span className="status-pill">Новый</span></div>
          </div>
          <ChevronRight/>
        </Link>

        <Link className="builder-card builder-card-link" to="/builder/nutrition/new">
          <div className="builder-card-icon warm"><Apple size={22}/></div>
          <div className="builder-card-copy">
            <span className="eyebrow">Питание</span>
            <h3>Планы питания</h3>
            <p>2–4 основных приёма, лёгкие приёмы, варианты блюд и автоматическое перераспределение калорий.</p>
            <div className="builder-meta"><span>Калории · КБЖУ · порции · версии</span><span className="status-pill">Готово</span></div>
          </div>
          <ChevronRight/>
        </Link>
      </div>

      <section className="panel trainer-programs-panel">
        <div className="panel-head">
          <div><span className="eyebrow">Программы</span><h3>Программы тренировок</h3><p>Активные назначения и предыдущие версии клиентов.</p></div>
          <Link className="primary-button compact" to="/builder/programs/new"><Plus size={15}/>Новая программа</Link>
        </div>
        {notice&&<div className="drawer-notice">{notice}</div>}
        {programs.length===0&&!notice?<div className="library-empty">Программ пока нет.</div>:<div className="trainer-program-list">
          {programs.map(program=><article className={'trainer-program-row '+(program.is_active?'is-active':'')} key={program.id}>
            <div><div className="chip-row">{program.is_active&&<span className="status-pill">Активна</span>}<span className="soft-chip">v{program.version}</span></div>
            <strong>{program.name}</strong><span>{program.client_name??(program.is_template?'Шаблон':'Без клиента')} · {program.weekly_frequency}× в неделю</span></div>
            <div className="program-row-status">{program.status==='archived'?'Предыдущая версия':program.is_active?'Назначена клиенту':'Черновик'}</div>
          </article>)}
        </div>}
      </section>

      <section className="panel library-panel">
        <div className="panel-head">
          <div><span className="eyebrow">Библиотека</span><h3>Основа тренировочного конструктора</h3></div>
          <Link className="primary-button compact" to="/builder/exercises"><Plus size={15}/>Упражнение</Link>
        </div>

        <div className="library-stats">
          <Link to="/builder/exercises"><LibraryBig size={18}/><strong>Упражнения</strong><span>Мышцы, техника, теги, отдых</span></Link>
          <div><Sparkles size={18}/><strong>17</strong><span>групп и подгрупп мышц</span></div>
          <Link to="/builder/replacements"><Repeat2 size={18}/><strong>Замены</strong><span>Прямые, допустимые и запасные</span></Link>
          <Link to="/builder/programs/new"><Dumbbell size={18}/><strong>Программа</strong><span>Сессии, упражнения и кардио</span></Link>
        </div>

        <Link className="library-example library-example-link" to="/builder/exercises">
          <div>
            <strong>Открыть библиотеку упражнений</strong>
            <span>Поиск, фильтры, чипы, техника, стандартный отдых и группы замен</span>
          </div>
          <ChevronRight size={18}/>
        </Link>
      </section>
    </div>
  )
}
