import { BookOpen, Calculator } from 'lucide-react'
import { HubLinkCard } from '../components/HubLinkCard'
import { UiStack } from '../ui/primitives'

export function UsefulPage(){
  return <UiStack className="settings-page hub-page">
    <section className="section-intro hub-hero">
      <div>
        <span className="eyebrow">Полезное</span>
        <h2>Материалы и небольшие помощники</h2>
        <p>Здесь собраны вещи, которые помогают разобраться, посчитать или проверить — но не относятся к ежедневным разделам приложения.</p>
      </div>
    </section>

    <div className="hub-link-list">
      <HubLinkCard
        to="/materials"
        eyebrow="База знаний"
        title="Материалы"
        description="Короткие статьи, инструкции и объяснения по тренировкам, питанию и прогрессу."
        icon={<BookOpen size={22}/>}
      />
      <HubLinkCard
        to="/useful/body-composition"
        eyebrow="Расчёты"
        title="Каркас и композиция тела"
        description="Талия относительно роста, размер каркаса, ИМТ и ориентиры пропорций."
        icon={<Calculator size={22}/>}
      />
    </div>
  </UiStack>
}
