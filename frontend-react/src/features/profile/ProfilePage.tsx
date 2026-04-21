import { useEffect, useMemo, useState } from 'react'
import { ApiClient, type UserProfile } from '../../shared/api/client'

type Props = {
  userId: number
  onBack: () => void
  toast: (message: string, type?: string) => void
}

export function ProfilePage({ userId, onBack, toast }: Props) {
  const api = useMemo(() => new ApiClient(), [])
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    api.getUserProfile(userId)
      .then(setProfile)
      .catch((e: Error) => toast(e.message, 'error'))
  }, [api, toast, userId])

  if (!profile) {
    return (
      <section className="view active">
        <div className="shell-card profile-header">
          <p>Загрузка профиля...</p>
        </div>
      </section>
    )
  }

  return (
    <section className="view active">
      <div className="shell-card profile-header">
        <div>
          <p className="eyebrow">Профиль игрока</p>
          <h2>{profile.avatar} {profile.username}</h2>
        </div>
        <button className="btn btn-secondary" onClick={onBack}>← В лобби</button>
      </div>

      <div className="profile-stats">
        <article className="shell-card stat-tile">
          <span className="stat-label">Баланс</span>
          <strong>{profile.bonus_balance}</strong>
        </article>
        <article className="shell-card stat-tile">
          <span className="stat-label">Игр сыграно</span>
          <strong>{profile.rounds_played}</strong>
        </article>
        <article className="shell-card stat-tile">
          <span className="stat-label">Побед</span>
          <strong>{profile.wins_count}</strong>
        </article>
      </div>

      <div className="shell-card profile-history">
        <div className="section-title-row compact">
          <h3>История игр</h3>
          <span className="section-note">Записей: {profile.history.length}</span>
        </div>
        {profile.history.length === 0 ? (
          <div className="empty-state">Пока нет сыгранных раундов.</div>
        ) : (
          <div className="history-list">
            {profile.history.map((entry) => (
              <article className="history-item" key={entry.round_id}>
                <div>
                  <strong>{entry.room_name}</strong>
                  <p className="section-note">{new Date(entry.finished_at).toLocaleString('ru-RU')}</p>
                </div>
                <div>
                  <strong>{entry.item_name}</strong>
                  <p className="section-note">{entry.item_rarity}</p>
                </div>
                <div>
                  <strong className={entry.status === 'win' ? 'history-win' : 'history-lose'}>
                    {entry.status === 'win' ? 'Победа' : 'Поражение'}
                  </strong>
                  <p className="section-note">Выигрыш: {entry.awarded_amount}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
