type Props = {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}

export function ToggleSwitch({ checked, onChange, disabled = false, label }: Props) {
  return (
    <button
      type="button"
      className={`toggle-switch ${checked ? 'is-on' : ''}`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span />
    </button>
  )
}
