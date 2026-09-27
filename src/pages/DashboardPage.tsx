import { useEffect, useState } from 'react'
import { CalendarDays, CheckCircle2, ChevronRight, Circle, Dumbbell, Scale, UtensilsCrossed } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DailyCheckinCard } from '../components/DailyCheckinCard'
import { loadDashboardSnapshot, loadTodayTasks, type DashboardSnapshot, type TodayTask } from '../features/tracking/service'

type Props={name:string;enabledModules:string[];preview:boolean}

const previewSnapshot:DashboardSnapshot={weight:89.6,waist:96,workouts_this_week:2,nutrition_days_this_week:6}
const previewTasks:TodayTask[]=[
  {id:'t1',type:'weight',name:'Взвешивание',time:'08:00',action_path:'/progress',completed:true},
  {id:'t2',type:'nutrition',name:'Питание за день',time:'21:00',action_path:'/nutrition',completed:false},
  {id:'t3',type:'daily_checkin',name:'Самочувствие',time:'21:10',action_path:'/',completed:false},
]

export function DashboardPage({name,enabledModules,preview}:Props){
  const [snapshot,setSnapshot]=useState<DashboardSnapshot>(preview?previewSnapshot:{weight:null,waist:null,workouts_this_week:0,nutrition_days_this_week:0})
  const [tasks,setTasks]=useState<TodayTask[]>(preview?previewTasks:[])
  const [loading,setLoading]=useState(!preview)
  const [notice,setNotice]=useState('')

  useEffect(()=>{
    if(preview){setLoading(false);return}
    Promise.all([loadDashboardSnapshot(),loadTodayTasks()])
      .then(([s,t])=>{setSnapshot(s);setTasks(t)})
      .catch(e=>setNotice(e instanceof Error?e.message:'Не удалось загрузить главную'))
      .finally(()=>setLoading(false))
  },[preview])

  const hasTraining=enabledModules.includes('training')
  const hasNutrition=enabledModules.includes('nutrition')
  const hasProgress=enabledModules.includes('progress')
  const openTasks=tasks.filter(t=>!t.completed)
  const heroText=openTasks.length
    ? 'На сегодня осталось '+openTasks.length+' '+(openTasks.length===1?'действие':'действия')+'. Всё остальное можно не трогать.'
    : 'На сегодня всё отмечено. Можно просто следовать плану.'

  return <div className="page-stack">
    <section className="hero-card">
      <div>
        <span className="eyebrow light">Сегодня</span>
        <h2>Привет, {name}</h2>
        <p>{heroText}</p>
      </div>
      <div className="hero-score today-task-score"><strong>{tasks.filter(t=>t.completed).length}/{tasks.length||0}</strong><span>дел на сегодня</span></div>
    </section>

    {notice&&<div className="drawer-notice">{notice}</div>}

    {!loading&&<div className="stats-grid">
      {hasProgress&&<article className="stat-card"><div className="stat-label">Последний вес</div><div className="stat-value">{snapshot.weight==null?'—':snapshot.weight.toFixed(1).replace('.',',')+' кг'}</div><div className="stat-unit"><Scale size={13}/>из истории замеров</div></article>}
      {hasProgress&&<article className="stat-card"><div className="stat-label">Последняя талия</div><div className="stat-value">{snapshot.waist==null?'—':snapshot.waist.toFixed(1).replace('.',',')+' см'}</div><div className="stat-unit">последний сохранённый замер</div></article>}
      {hasTraining&&<article className="stat-card"><div className="stat-label">Тренировки</div><div className="stat-value">{snapshot.workouts_this_week}</div><div className="stat-unit">за текущую неделю</div></article>}
      {hasNutrition&&<article className="stat-card"><div className="stat-label">Питание</div><div className="stat-value">{snapshot.nutrition_days_this_week}</div><div className="stat-unit">дней отмечено на этой неделе</div></article>}
    </div>}

    <div className="two-column dashboard-main-grid">
      <section className="panel today-actions-panel">
        <div className="panel-head"><div><span className="eyebrow">На сегодня</span><h3>Что нужно сделать</h3></div><CalendarDays/></div>
        {loading?<div className="library-empty">Проверяю план на сегодня…</div>:tasks.length===0?<div className="library-empty">На сегодня отдельных напоминаний нет.</div>:<div className="today-task-list">
          {tasks.map(task=>{
            const content=<>
              <span className={'today-task-check '+(task.completed?'is-done':'')}>{task.completed?<CheckCircle2 size={18}/>:<Circle size={18}/>}</span>
              <span className="today-task-copy"><strong>{task.name}</strong><small>{task.completed?'готово':'ориентир '+task.time}</small></span>
              {!task.completed&&task.action_path&&<ChevronRight size={16}/>}
            </>
            return task.action_path?<Link key={task.id} to={task.action_path} className={'today-task-row '+(task.completed?'is-done':'')}>{content}</Link>:<div key={task.id} className={'today-task-row '+(task.completed?'is-done':'')}>{content}</div>
          })}
        </div>}
      </section>

      {hasTraining&&<section className="panel">
        <div className="panel-head"><div><span className="eyebrow">Тренировки</span><h3>Силовая программа</h3></div><Dumbbell/></div>
        <div className="next-action">
          <strong>Рабочие веса и история сохраняются автоматически</strong>
          <p>Открывай тренировку только когда готов начать. Выполненные тренировки остаются отдельными снимками истории.</p>
          <Link className="primary-button compact" to="/workouts">Открыть тренировки <ChevronRight size={17}/></Link>
        </div>
      </section>}
    </div>

    <DailyCheckinCard preview={preview}/>

    {hasNutrition&&<section className="panel dashboard-nutrition-link">
      <div className="panel-head"><div><span className="eyebrow">Питание</span><h3>Meal Plan и дневная отметка</h3></div><UtensilsCrossed/></div>
      <p>Если следовал Meal Plan, считать всё повторно не нужно. Достаточно отметить соблюдение и при необходимости перебор/недобор.</p>
      <Link className="ghost-button" to="/nutrition">Открыть питание <ChevronRight size={16}/></Link>
    </section>}
  </div>
}
