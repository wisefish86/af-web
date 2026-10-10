import { BookOpen, Calculator } from 'lucide-react'
import { HubLinkCard } from '../components/HubLinkCard'
import { UiStack } from '../ui/primitives'

export function UsefulPage(){
  return <UiStack className="settings-page hub-page">
    <section className="section-intro hub-hero">
      <div>
        <span className="eyebrow">Полезное</span>
        <h2>Полезное</h2>
        <p>Материалы, расчёты и подсказки, к которым можно вернуться в нужный момент.</p>
      </div>
    </section>

    <div className="hub-link-list">
      <HubLinkCard
        to="/materials"
        eyebrow="База знаний"
        title="Материалы"
        description="Питание, тренировки, восстановление, прогресс и привычки — коротко и по делу."
        icon={<BookOpen size={22}/>}
      />
      <HubLinkCard
        to="/useful/body-composition"
        eyebrow="Расчёты"
        title="Каркас и композиция тела"
        description="Рост, талия, запястье, ИМТ и ориентиры пропорций тела."
        icon={<Calculator size={22}/>}
      />
    </div>
  </UiStack>
}
