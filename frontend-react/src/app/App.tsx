import { useEffect, useMemo, useState } from 'react'
import { LobbyPage } from '../features/lobby/LobbyPage'
import { RoomPage } from '../features/room/RoomPage'
import { AdminPage } from '../features/admin/AdminPage'
import { ApiClient } from '../shared/api/client'

type View = 'lobby' | 'room' | 'admin'

export function App() {
  const api = useMemo(() => new ApiClient(), [])
  const [view, setView] = useState<View>('lobby')
  const [roomId, setRoomId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null)
  const userId = 1

  useEffect(() => {
    let timeout = 0
    api.getActiveRoom(userId).then((active) => {
      if (active.room_id) {
        setRoomId(active.room_id)
        setView('room')
      }
    }).catch(() => undefined)
    return () => window.clearTimeout(timeout)
  }, [])

  const showToast = (message: string, type = 'info') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 3500)
  }

  return (
    <div id="app">
      <header className="header shell-card">
        <div className="brand-block">
          <p className="eyebrow">Stoloto VIP experience</p>
          <h1>Opencase Lobby</h1>
          <p className="brand-subtitle">Премиальные комнаты, прозрачный розыгрыш и быстрый вход в игру.</p>
        </div>
        <div className="header-actions">
          <div className="user-info shell-card shell-card--compact">
            <span>Бонусы: 0</span>
            <span className="user-id">User ID: {userId}</span>
          </div>
          <button className="btn btn-secondary" onClick={() => setView('admin')}>Админ-конфиг</button>
        </div>
      </header>

      <main className="main">
        {toast && <section className="toast" data-type={toast.type}>{toast.message}</section>}

        {view === 'lobby' && (
          <LobbyPage
            userId={userId}
            onOpenAdmin={() => setView('admin')}
            onJoinRoom={(nextRoomId) => {
              setRoomId(nextRoomId)
              setView('room')
            }}
            toast={showToast}
          />
        )}

        {view === 'room' && roomId && (
          <section id="room-view" className="view active">
            <RoomPage
              roomId={roomId}
              userId={userId}
              onExit={() => {
                setRoomId(null)
                setView('lobby')
              }}
              toast={showToast}
            />
          </section>
        )}

        {view === 'admin' && <AdminPage onBack={() => setView('lobby')} toast={showToast} />}
      </main>
    </div>
  )
}
