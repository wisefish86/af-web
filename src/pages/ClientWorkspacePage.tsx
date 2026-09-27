import { useMemo, useState } from 'react'
import { Apple, Bell, ChevronLeft, Dumbbell, EyeOff, Gauge, Save } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { reminderPresets, serviceModules, trackingGroups } from '../data/platformDemo'

const moduleIcons = {
  nutrition: Apple,
  training: Dumbbell,
  progress: Gauge,
  checkins: Gauge,
  notifications: Bell,
}

export function ClientWorkspacePage() {
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>({
    nutrition: true,
    training: true,
    progress: true,
    checkins: true,
    notifications: true,
  })

  const initialFields = useMemo(
    () => Object.fromEntries(trackingGroups.flatMap(group => group.items.map(item => [item.code, { ...item }]))),
    [],
  )
  const [fields, setFields] = useState(initialFields)

  function patchField(code: string, patch: Record<string, boolean>) {
    setFields(prev => ({ ...prev, [code]: { ...prev[code], ...patch } }))
  }

  return (
    <div className="page-stack">
      <div className="workspace-back"><Link to="/clients"><ChevronLeft size={17}/>Все клиенты</Link></div>

      <section className="client-workspace-head">
        <div className="client-identity">
          <div className="avatar xl">С</div>
          <div>
            <div className="chip-row"><span className="status-pill">Активен</span><span className="soft-chip">Снижение веса</span></div>
            <h2>Сергей</h2>
            <p>Настрой только то, что реально нужно этому клиенту. Остальное не будет мешать ни ему, ни тебе.</p>
          </div>
        </div>
        <button className="primary-button compact"><Save size={16}/>Сохранить изменения</button>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <div><span className="eyebrow">01 · Сопровождение</span><h3>Что входит в программу</h3><p>Разделы, которые клиент увидит в своём кабинете.</p></div>
        </div>
        <div className="module-grid">
          {serviceModules.map(module => {
            const Icon = moduleIcons[module.code]
            const checked = enabledModules[module.code]
            return <article className={`module-card ${checked ? 'is-enabled' : ''}`} key={module.code}>
              <div className="module-icon"><Icon size={20}/></div>
              <div className="module-copy"><strong>{module.name}</strong><span>{module.description}</span></div>
              <ToggleSwitch
                label={`Модуль ${module.name}`}
                checked={checked}
                onChange={value => setEnabledModules(prev => ({...prev, [module.code]: value}))}
              />
            </article>
          })}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <div><span className="eyebrow">02 · Поля</span><h3>Что клиент будет заполнять</h3><p>Обязательные поля нельзя скрыть. Необязательные клиент сможет убрать у себя, если ты это разрешил.</p></div>
        </div>

        <div className="tracking-groups">
          {trackingGroups.map(group => (
            <article className="tracking-group" key={group.title}>
              <div className="tracking-group-head"><div><h4>{group.title}</h4><p>{group.description}</p></div></div>
              <div className="tracking-table">
                <div className="tracking-row tracking-header">
                  <span>Показатель</span><span>Показывать</span><span>Обязательное</span><span>Клиент может скрыть</span>
                </div>
                {group.items.map(item => {
                  const current = fields[item.code]
                  return <div className={`tracking-row ${current.enabled ? '' : 'is-muted'}`} key={item.code}>
                    <strong>{item.label}</strong>
                    <ToggleSwitch checked={current.enabled} onChange={enabled => patchField(item.code, { enabled })} label={`Показывать ${item.label}`}/>
                    <ToggleSwitch
                      checked={current.required}
                      disabled={!current.enabled}
                      onChange={required => patchField(item.code, { required })}
                      label={`Обязательное поле ${item.label}`}
                    />
                    <div className="permission-cell">
                      {current.clientCanHide && current.enabled && !current.required
                        ? <span className="permission-ok"><EyeOff size={14}/>Да</span>
                        : <span className="permission-no">Нет</span>}
                    </div>
                  </div>
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <div><span className="eyebrow">03 · Напоминания</span><h3>Когда напомнить клиенту</h3><p>Уведомление пропускается, если действие уже выполнено.</p></div>
          <button className="ghost-button">+ Добавить правило</button>
        </div>
        <div className="reminder-list">
          {reminderPresets.map(item => <div className="reminder-card" key={item.name}>
            <div className="reminder-icon"><Bell size={18}/></div>
            <div><strong>{item.name}</strong><span>{item.schedule}</span><small>{item.note}</small></div>
            <ToggleSwitch checked={true} onChange={()=>{}} label={`Напоминание ${item.name}`}/>
          </div>)}
        </div>
      </section>
    </div>
  )
}
