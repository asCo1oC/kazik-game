import { useEffect, useMemo, useState } from 'react'
import { LobbyPage } from '../features/lobby/LobbyPage'
import { RoomPage } from '../features/room/RoomPage'
import { AdminPage } from '../features/admin/AdminPage'
import { ProfilePage } from '../features/profile/ProfilePage'
import { WelcomePage } from '../features/welcome/WelcomePage'
import { ApiClient, type UserProfile } from '../shared/api/client'

type View = 'lobby' | 'room' | 'admin' | 'profile'

function resolveViewFromPath(pathname: string): View {
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/profile')) return 'profile'
  return 'lobby'
}

export function App() {
  const api = useMemo(() => new ApiClient(), [])
  const [view, setView] = useState<View>(() => resolveViewFromPath(window.location.pathname))
  const [roomId, setRoomId] = useState<number | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null)
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    return !sessionStorage.getItem('hasSeenWelcome')
  })
  const userId = 1
  const isRoomActive = view === 'room' && roomId !== null

  const handleEnterWelcome = () => {
    sessionStorage.setItem('hasSeenWelcome', '1')
    setShowWelcome(false)
  }

  useEffect(() => {
    api.getActiveRoom(userId).then((active) => {
      if (active.room_id) {
        setRoomId(active.room_id)
        setView('room')
      }
    }).catch(() => undefined)
    api.getUserProfile(userId).then(setProfile).catch(() => undefined)
  }, [api, userId])

  useEffect(() => {
    const onPopstate = () => {
      if (roomId) {
        setView('room')
        return
      }
      const nextView = resolveViewFromPath(window.location.pathname)
      setView(nextView)
      if (nextView !== 'room') setRoomId(null)
    }
    window.addEventListener('popstate', onPopstate)
    return () => window.removeEventListener('popstate', onPopstate)
  }, [roomId])

  const navigateTo = (path: string, nextView: View, force = false) => {
    if (!force && roomId && nextView !== 'room') {
      return
    }
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path)
    }
    setView(nextView)
  }

  useEffect(() => {
    if (view === 'room' && roomId === null) {
      setView('lobby')
    }
  }, [view, roomId])

  const showToast = (message: string, type = 'info') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 3500)
  }

  if (showWelcome) {
    return <WelcomePage onEnter={handleEnterWelcome} />
  }

  return (
    <div id="app">
      {!isRoomActive && (
        <header className="header shell-card">
          <div className="brand-block">
            <p className="eyebrow">Столото</p>
            <h1>Opencase Lobby</h1>
            <p className="brand-subtitle">Премиальные комнаты, прозрачный розыгрыш и быстрый вход в игру.</p>
          </div>
          <div className="header-actions">
            <div className="user-info shell-card shell-card--compact">
              <span>Бонусы: {profile?.bonus_balance ?? 0}</span>
              <span className="user-id">User ID: {userId}</span>
            </div>
            <button className="btn btn-secondary" onClick={() => navigateTo('/profile', 'profile')}>Профиль</button>
          </div>
        </header>
      )}

      <main className="main">
        {toast && <section className="toast" data-type={toast.type}>{toast.message}</section>}

        {view === 'lobby' && (
          <LobbyPage
            userId={userId}
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
                navigateTo('/', 'lobby', true)
                api.getUserProfile(userId).then(setProfile).catch(() => undefined)
              }}
              toast={showToast}
            />
          </section>
        )}

        {view === 'profile' && (
          <ProfilePage
            userId={userId}
            onBack={() => navigateTo('/', 'lobby')}
            toast={showToast}
          />
        )}
        {view === 'admin' && <AdminPage onBack={() => navigateTo('/', 'lobby')} toast={showToast} />}
      </main>
    </div>
  )
}
