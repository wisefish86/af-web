import { Bell, Palette, Settings2, UserRound } from 'lucide-react'
import { HubLinkCard } from '../components/HubLinkCard'
import { UiStack } from '../ui/primitives'

export function SettingsHubPage(){
  return <UiStack className="settings-page hub-page">
    <section className="section-intro hub-hero">
      <div>
        <span className="eyebrow">Настройки</span>
        <h2>Что хочешь изменить</h2>
        <p>Настройки разделены по смыслу, чтобы не искать нужный переключатель в длинной ленте.</p>
      </div>
    </section>

    <div className="hub-link-list">
      <HubLinkCard
        to="/settings/profile"
        eyebrow="Аккаунт"
        title="Профиль"
        description="Имя, город, часовой пояс и постоянные исходные данные."
        icon={<UserRound size={22}/>}
      />
      <HubLinkCard
        to="/settings/notifications"
        eyebrow="Связь"
        title="Уведомления"
        description="Напоминания внутри приложения, Telegram и категории сообщений."
        icon={<Bell size={22}/>}
      />
      <HubLinkCard
        to="/settings/personalization"
        eyebrow="Под себя"
        title="Персонализация"
        description="Какие вопросы и замеры показывать в ежедневных и контрольных формах."
        icon={<Palette size={22}/>}
      />
      <HubLinkCard
        to="/settings/app"
        eyebrow="Устройство"
        title="Приложение"
        description="Установка PWA и служебные настройки приложения."
        icon={<Settings2 size={22}/>}
      />
    </div>
  </UiStack>
}
