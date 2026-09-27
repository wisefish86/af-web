export function normalizeDecimalInput(value: string): string {
  return value
    .replace(',', '.')
    .replace(/[^0-9.]/g, '')
    .replace(/(\..*)\./g, '$1')
}

export function parseDecimal(value: string): number | null {
  const normalized = normalizeDecimalInput(value).trim()
  if (!normalized || normalized === '.') return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

export function estimateOneRepMax(weight: number, reps: number): number | null {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return null
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}
