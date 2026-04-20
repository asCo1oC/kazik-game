type Props = {
  talisman: string
  displayName: string
  visible: boolean
}

export function WinnerCelebration({ talisman, displayName, visible }: Props) {
  if (!visible) return null
  return (
    <div className="winner-celebration">
      <div className="winner-celebration__content">
        <div className="winner-celebration__badge">ВЫИГРЫШ</div>
        <div className="winner-celebration__icon">{talisman || '🏆'}</div>
        <div className="winner-celebration__name">{displayName || 'Победитель'}</div>
      </div>
    </div>
  )
}
