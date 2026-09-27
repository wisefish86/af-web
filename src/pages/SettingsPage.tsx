import { useEffect, useMemo, useState } from 'react'
import { Bell, Eye, EyeOff, MessageCircle, ShieldCheck } from 'lucide-react'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { trackingGroups } from '../data/platformDemo'

const STORAGE_KEY = 'andrey-fitness-preview-preferences'

type Preferences = Record<string, boolean>

export function SettingsPage() {
  const optionalFields = useMemo(
    () => trackingGroups.flatMap(group => group.items).filter(item => item.enabled && item.clientCanHide && !item.required),
    [],
  )

  const [visible, setVisible] = useState<Preferences>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    return Object.fromEntries(optionalFields.map(item => [item.code, true]))
  })

  const [notifications, setNotifications] = useState({ weight: true, waist: true, workout: true })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visible))
  }, [visible])

  return (
    <div className="page-stack settings-page">
      <section className="section-intro settings-hero">
        <div>
          <span className="eyebrow">Мой кабинет</span>
          <h2>Оставь только то, что полезно тебе</h2>
          <p>Скрытые пункты просто исчезнут из форм. История уже внесённых данных никуда не пропадает.</p>
        </div>
        <div className="calm-badge"><ShieldCheck size={18}/><span>Безопасно: можно вернуть в любой момент</span></div>
      </section>

      <section className="panel preference-panel">
        <div className="panel-head">
          <div><span className="eyebrow">Отображение</span><h3>Что показывать в дневнике</h3></div>
          <Eye size={19}/>
        </div>
        <p className="panel-description">Обязательные показатели всегда остаются. Здесь только необязательные поля.</p>

        <div className="preference-list">
          {optionalFields.map(item => {
            const isVisible = visible[item.code] ?? true
            return <div className="preference-row" key={item.code}>
              <div className="preference-icon">{isVisible ? <Eye size={17}/> : <EyeOff size={17}/>}</div>
              <div><strong>{item.label}</strong><span>{isVisible ? 'Будет показываться' : 'Скрыто из форм'}</span></div>
              <ToggleSwitch
                checked={isVisible}
                onChange={value => setVisible(prev => ({...prev, [item.code]: value}))}
                label={`Показывать ${item.label}`}
              />
            </div>
          })}
        </div>
      </section>

      <section className="panel telegram-card">
        <div className="telegram-main">
          <div className="telegram-icon"><MessageCircle size={22}/></div>
          <div><span className="eyebrow">Telegram</span><h3>Напоминания без лишнего шума</h3><p>Бот будет писать только по включённым правилам и не станет напоминать о том, что уже сделано.</p></div>
        </div>
        <button className="primary-button compact">Подключить Telegram</button>
      </section>

      <section className="panel preference-panel">
        <div className="panel-head"><div><span className="eyebrow">Уведомления</span><h3>О чём мне напоминать</h3></div><Bell size={19}/></div>
        <div className="preference-list">
          {[
            ['weight','Взвешивание','ПН · СР · СБ утром'],
            ['waist','Замер талии','Раз в неделю'],
            ['workout','Тренировка','В тренировочный день'],
          ].map(([code,label,note]) => <div className="preference-row" key={code}>
            <div className="preference-icon"><Bell size={17}/></div>
            <div><strong>{label}</strong><span>{note}</span></div>
            <ToggleSwitch
              checked={notifications[code as keyof typeof notifications]}
              onChange={value => setNotifications(prev => ({...prev,[code]:value}))}
              label={`Напоминать: ${label}`}
            />
          </div>)}
        </div>
      </section>
    </div>
  )
}
