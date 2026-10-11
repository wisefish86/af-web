import { useEffect, useState } from 'react'
import { Apple, ChevronRight, Dumbbell, LibraryBig, Plus, Repeat2, Sparkles, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { deleteUnusedTrainingProgram, loadTrainerPrograms, type TrainerProgramSummary } from '../features/programs/service'
import { ConfirmActionSheet } from '../components/ConfirmActionSheet'

type Props={preview:boolean}

const previewPrograms:TrainerProgramSummary[]=[
  {id:'preview-program-active',name:'Full Body · Сергей',client_id:'sergey',client_name:'Сергей',status:'active',is_active:true,is_template:false,version:2,weekly_frequency:3,created_at:'2026-10-01T10:00:00Z',workout_count:3,can_delete:false},
  {id:'preview-program-template',name:'Full Body · шаблон',client_id:null,client_name:null,status:'draft',is_active:false,is_template:true,version:1,weekly_frequency:3,created_at:'2026-09-25T10:00:00Z',workout_count:0,can_delete:true},
]

export function BuilderPage({preview}:Props) {
  const [programs,setPrograms]=useState<TrainerProgramSummary[]>(preview?previewPrograms:[])
  const [notice,setNotice]=useState('')
  const [pendingDelete,setPendingDelete]=useState<TrainerProgramSummary|null>(null)
  const [deleting,setDeleting]=useState(false)

  async function refreshPrograms(){
    if(preview){setPrograms(previewPrograms);setNotice('');return}
    try{setPrograms(await loadTrainerPrograms());setNotice('')}
    catch(e){setNotice(e instanceof Error?e.message:'Не удалось загрузить программы')}
  }

  useEffect(()=>{void refreshPrograms()},[preview])

  async function deleteProgram(){
    if(!pendingDelete||deleting)return
    setDeleting(true)
    setNotice('')
    try{
      if(!preview)await deleteUnusedTrainingProgram(pendingDelete.id)
      setPrograms(current=>current.filter(program=>program.id!==pendingDelete.id))
      setPendingDelete(null)
    }catch(e){
      setNotice(e instanceof Error?e.message:'Не удалось удалить программу')
    }finally{
      setDeleting(false)
    }
  }
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
            <div className="program-row-actions">
              <div className="program-row-status">{program.status==='archived'?'Предыдущая версия':program.is_active?`Назначена: ${program.client_name??'клиенту'}`:program.client_name?`Черновик: ${program.client_name}`:'Черновик'}</div>
              {program.status!=='archived'&&<Link className="ghost-button compact" to={'/builder/programs/'+program.id+'/edit'}>{program.is_active?'Редактировать':'Продолжить'}</Link>}
              {program.can_delete&&<button type="button" className="ghost-button compact danger-text-button" onClick={()=>setPendingDelete(program)}><Trash2 size={15}/>Удалить</button>}
            </div>
          </article>)}
        </div>}
      </section>

      <ConfirmActionSheet
        open={Boolean(pendingDelete)}
        title="Удалить программу?"
        message={pendingDelete ? pendingDelete.name+' · v'+pendingDelete.version+'. По этой версии нет тренировок, и сейчас она никому не назначена. Программа и её содержимое будут удалены безвозвратно.' : ''}
        confirmLabel="Удалить программу"
        destructive
        busy={deleting}
        onCancel={()=>{if(!deleting)setPendingDelete(null)}}
        onConfirm={()=>void deleteProgram()}
      />

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
