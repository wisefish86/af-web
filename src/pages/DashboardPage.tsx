import { useEffect, useState } from 'react'
import { BookOpen, CalendarDays, CheckCircle2, ChevronRight, Circle, Dumbbell, TrendingUp, UtensilsCrossed } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DailyCheckinCard } from '../components/DailyCheckinCard'
import { loadDashboardSnapshot, loadOverdueProgressTasks, loadTodayTasks, type DashboardSnapshot, type OverdueProgressTask, type TodayTask } from '../features/tracking/service'
import { UiCard, UiNotice, UiSectionHeader, UiStack } from '../ui/primitives'

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
  const [overdueTasks,setOverdueTasks]=useState<OverdueProgressTask[]>([])
  const [loading,setLoading]=useState(!preview)
  const [snapshotLoaded,setSnapshotLoaded]=useState(preview)
  const [tasksLoaded,setTasksLoaded]=useState(preview)
  const [notice,setNotice]=useState('')

  useEffect(()=>{
    let cancelled=false
    const pageReady=()=>{
      ;(window as Window & {__andreyFitPageReady?:boolean}).__andreyFitPageReady=true
      window.dispatchEvent(new Event('andrey-fit-page-ready'))
    }
    const fail=(label:string)=>setNotice(current=>{
      const prefix='Часть главной не загрузилась: '
      const existing=current.startsWith(prefix)?current.slice(prefix.length).replace(/\. Остальные разделы можно использовать\.$/,'').split(', ').filter(Boolean):[]
      return prefix+[...new Set([...existing,label])].join(', ')+'. Остальные разделы можно использовать.'
    })
    if(preview){setLoading(false);pageReady();return}

    loadTodayTasks()
      .then(value=>{if(!cancelled){setTasks(value);setTasksLoaded(true)}})
      .catch(()=>{if(!cancelled){setTasksLoaded(false);fail('задачи на сегодня')}})
      .finally(()=>{if(!cancelled){setLoading(false);pageReady()}})

    loadDashboardSnapshot()
      .then(value=>{if(!cancelled){setSnapshot(value);setSnapshotLoaded(true)}})
      .catch(()=>{if(!cancelled){setSnapshotLoaded(false);fail('сводка прогресса')}})

    if(enabledModules.includes('progress')){
      loadOverdueProgressTasks()
        .then(value=>{if(!cancelled)setOverdueTasks(value)})
        .catch(()=>{if(!cancelled)fail('просроченные замеры')})
    }else{
      setOverdueTasks([])
    }

    return()=>{cancelled=true}
  },[preview,enabledModules])

  const hasTraining=enabledModules.includes('training')
  const hasNutrition=enabledModules.includes('nutrition')
  const hasProgress=enabledModules.includes('progress')
  const hasCheckins=enabledModules.includes('checkins')
  const overdueTypes=new Set(overdueTasks.map(task=>task.type))
  const displayTasks=[...overdueTasks,...tasks.filter(task=>!overdueTypes.has(task.type))]
  const openTasks=displayTasks.filter(t=>!t.completed)
  const heroText=!loading&&!tasksLoaded
    ? 'Не удалось проверить задачи на сегодня. Остальные разделы доступны.'
    : overdueTasks.length
      ? 'Есть '+overdueTasks.length+' '+(overdueTasks.length===1?'просроченное действие':'просроченных действия')+'. Лучше закрыть их сегодня.'
      : openTasks.length
        ? 'На сегодня осталось '+openTasks.length+' '+(openTasks.length===1?'действие':'действия')+'. Всё остальное можно не трогать.'
        : 'На сегодня всё отмечено. Можно просто следовать плану.'

  return <UiStack>
    <section className="hero-card">
      <div>
        <span className="eyebrow light">Сегодня</span>
        <h2>Привет, {name}</h2>
        <p>{heroText}</p>
      </div>
      <div className="hero-score today-task-score"><strong>{!loading&&!tasksLoaded?'—':displayTasks.filter(t=>t.completed).length+'/'+(displayTasks.length||0)}</strong><span>дел на сегодня</span></div>
    </section>

    {notice&&<UiNotice tone="warning">{notice}</UiNotice>}

    <Link className="ui-card dashboard-materials-entry" to="/materials">
      <div className="dashboard-materials-icon"><BookOpen size={26}/></div>
      <div className="dashboard-materials-copy"><span className="eyebrow">База знаний</span><h3>Материалы</h3><p>Короткие статьи, инструкции и чек-листы по тренировкам, питанию и прогрессу.</p></div>
      <ChevronRight className="dashboard-materials-chevron" size={22}/>
    </Link>

    <div className="two-column dashboard-main-grid">
      <UiCard className={'today-actions-panel '+(tasks.length===0&&!loading?'is-empty':'')}>
        <UiSectionHeader kicker="На сегодня" title="Что нужно сделать" icon={<CalendarDays/>}/>
        {loading?<div className="library-empty">Проверяю план на сегодня…</div>:!tasksLoaded?<div className="library-empty">Не удалось загрузить задачи на сегодня.</div>:displayTasks.length===0?<div className="dashboard-empty-state">На сегодня отдельных напоминаний нет.</div>:<div className="today-task-list">
          {displayTasks.map(task=>{
            const content=<>
              <span className={'today-task-check '+(task.completed?'is-done':'')}>{task.completed?<CheckCircle2 size={18}/>:<Circle size={18}/>}</span>
              <span className="today-task-copy"><strong>{task.name}</strong><small>{task.completed?'готово':'overdue' in task&&task.overdue?'нужно заполнить':'ориентир '+task.time}</small></span>
              {!task.completed&&task.action_path&&<ChevronRight size={16}/>}
            </>
            return task.action_path?<Link key={task.id} to={task.action_path} className={'today-task-row '+(task.completed?'is-done':'')+(('overdue' in task&&task.overdue)?' is-overdue':'')}>{content}</Link>:<div key={task.id} className={'today-task-row '+(task.completed?'is-done':'')}>{content}</div>
          })}
        </div>}
      </UiCard>

    </div>

    <div className="dashboard-section-order">
      {hasNutrition&&<UiCard className="dashboard-nutrition-link">
      <UiSectionHeader kicker="Питание" title="Meal Plan и дневная отметка" icon={<UtensilsCrossed/>}/>
      <p>Если следовал Meal Plan, считать всё повторно не нужно. Достаточно отметить соблюдение и при необходимости перебор/недобор.</p>
      <Link className="ghost-button" to="/nutrition">Открыть питание <ChevronRight size={16}/></Link>
    </UiCard>}
      {hasTraining&&<UiCard>
        <UiSectionHeader kicker="Тренировки" title="Силовая программа" icon={<Dumbbell/>}/>
        <div className="next-action dashboard-training-action">
          <strong>Рабочие веса и история сохраняются автоматически</strong>
          <p>Открывай тренировку только когда готов начать. Выполненные тренировки остаются отдельными снимками истории.</p>
          <Link className="primary-button compact" to="/workouts">Открыть тренировки <ChevronRight size={17}/></Link>
        </div>
      </UiCard>}
      {hasProgress&&<UiCard className="dashboard-progress-link">
      <UiSectionHeader kicker="Прогресс" title="Вес, талия и динамика" icon={<TrendingUp/>}/>
      <div className="dashboard-progress-summary">
        <div><span>Последний вес</span><strong>{snapshot.weight==null?'—':snapshot.weight.toFixed(1).replace('.',',')+' кг'}</strong></div>
        <div><span>Талия</span><strong>{snapshot.waist==null?'—':snapshot.waist.toFixed(1).replace('.',',')+' см'}</strong></div>
        <div><span>Тренировок за неделю</span><strong>{snapshotLoaded?snapshot.workouts_this_week:'—'}</strong></div>
      </div>
      <Link className="ghost-button" to="/progress">Открыть весь прогресс <ChevronRight size={16}/></Link>
    </UiCard>}
    </div>

    {hasCheckins&&<DailyCheckinCard preview={preview}/>} 


  </UiStack>
}
