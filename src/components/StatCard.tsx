type Props = { label: string; value: string; unit: string; trend: string }

export function StatCard({ label, value, unit, trend }: Props) {
  return (
    <article className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-unit">{unit}</div>
      <div className="stat-trend"><span />{trend}</div>
    </article>
  )
}
