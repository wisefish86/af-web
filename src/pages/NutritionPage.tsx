import { demoMeals } from '../data/demo'

export function NutritionPage() {
  return <div className="page-stack">
    <section className="section-intro"><div><span className="eyebrow">Меню-план</span><h2>Собери день из привычных продуктов</h2><p>Выбирай продукты — граммы подстроятся под калорийность приёма пищи. Ручную порцию можно зафиксировать.</p></div><div className="target-ring"><strong>2 099</strong><span>из 2 300 ккал</span></div></section>
    <div className="meal-grid">{demoMeals.map((meal)=><article className="meal-card" key={meal.name}><div className="meal-card-head"><div><span>{meal.name}</span><strong>{meal.total} ккал</strong></div><small>цель {meal.target}</small></div><div className="progress-line"><span style={{width:`${Math.min(100, meal.total/meal.target*100)}%`}}/></div><ul>{meal.items.map(i=><li key={i}>{i}</li>)}</ul><button className="ghost-button">Изменить продукты</button></article>)}</div>
  </div>
}
