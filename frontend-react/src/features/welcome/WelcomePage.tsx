import { StolotoLogo } from '../../shared/ui/StolotoLogo'

export function WelcomePage({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="welcome-layout">
      <div className="welcome-content shell-card">
        <StolotoLogo className="welcome-logo mx-auto mb-4" />
        <h1 className="welcome-title">Премиальные Розыгрыши</h1>
        <p className="welcome-subtitle">
          Добро пожаловать в Opencase Lobby. Эксклюзивные комнаты для прозрачных и честных розыгрышей.
        </p>

        <div className="welcome-features">
          <div className="welcome-feature shell-card shell-card--inner">
            <div className="welcome-feature-num">I</div>
            <h3>Честная игра</h3>
            <p>Прозрачные алгоритмы, где победители определяются на стороне сервера.</p>
          </div>
          <div className="welcome-feature shell-card shell-card--inner">
            <div className="welcome-feature-num">II</div>
            <h3>Управление шансами</h3>
            <p>Увеличивайте «вес» вашего билета для повышения вероятности успеха.</p>
          </div>
          <div className="welcome-feature shell-card shell-card--inner">
            <div className="welcome-feature-num">III</div>
            <h3>Моментальные выплаты</h3>
            <p>Автоматическое зачисление средств на баланс после завершения раунда.</p>
          </div>
        </div>

        <button className="btn btn-primary btn-large welcome-enter-btn" onClick={onEnter}>
          Испытать удачу
        </button>
      </div>
    </div>
  )
}
