import { Search, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { demoClients } from '../data/demo'

export function AdminPage() {
  return (
    <div className="page-stack">
      <section className="admin-toolbar">
        <div className="search-box"><Search size={18}/><input placeholder="Найти клиента"/></div>
        <button className="primary-button compact"><UserPlus size={17}/>Добавить клиента</button>
      </section>

      <section className="panel clients-panel">
        <div className="client-table header">
          <span>Клиент</span><span>Цель</span><span>Последняя активность</span><span>Следование плану</span><span></span>
        </div>
        {demoClients.map((c, index) => (
          <div className="client-table" key={c.name}>
            <div className="client-name">
              <div className="avatar small">{c.name[0]}</div>
              <div><strong>{c.name}</strong><small>{c.status}</small></div>
            </div>
            <span>{c.goal}</span>
            <span>{c.last}</span>
            <strong>{c.adherence}</strong>
            <Link className="ghost-button small" to={`/clients/${index === 0 ? 'sergey' : 'vlada'}`}>Открыть</Link>
          </div>
        ))}
      </section>
    </div>
  )
}
