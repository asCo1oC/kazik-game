import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiClient, type RoomDetail, type RoomParticipant } from '../../shared/api/client'
import { useRoomRealtime } from './hooks/useRoomRealtime'
import { CaseRoulette, type CaseRouletteItem } from './components/CaseRoulette'
import { WinnerCelebration } from './components/WinnerCelebration'

type Props = {
  roomId: number
  userId: number
  onExit: () => void
  toast: (message: string, type?: string) => void
}

type Winner = { avatar: string; displayName: string }
type RoundLaneParticipant = { participantId: number; displayName: string; avatar: string }
type RoundLaneItem = CaseRouletteItem & { participantId: number }
type CoinParticle = { id: number; left: number; delay: number; duration: number; size: number; drift: number }
type RoundFinishedPayload = { lingerSeconds?: number; winnerUsername?: string; winnerId?: number | null; awardedAmount?: number }
const DEFAULT_WIN_INDEX = 30
const DEFAULT_STRIP_SIZE = 80
const RARITY_PALETTE = ['#b0c3d9', '#5e98d9', '#4b69ff', '#8847ff', '#d32ce6', '#eb4b4b', '#ffd700']
const RARITY_LABELS = ['Consumer', 'Industrial', 'Mil-Spec', 'Restricted', 'Classified', 'Covert', 'Extraordinary']

function rarityFromSeed(seedText: string, index: number) {
  const seed = [...seedText].reduce((acc, char) => acc + char.charCodeAt(0), 0) + index
  const paletteIndex = seed % RARITY_PALETTE.length
  return { rarityColor: RARITY_PALETTE[paletteIndex], rarity: RARITY_LABELS[paletteIndex] }
}

function participantToRouletteItem(participant: { displayName: string; avatar: string }, index: number): CaseRouletteItem {
  const rarity = rarityFromSeed(participant.displayName, index)
  return {
    name: participant.displayName,
    icon: participant.avatar || '🎲',
    rarity: rarity.rarity,
    rarityColor: rarity.rarityColor,
  }
}

function laneParticipantToRouletteItem(participant: RoundLaneParticipant, index: number): RoundLaneItem {
  const rarity = rarityFromSeed(participant.displayName, index)
  return {
    participantId: participant.participantId,
    name: participant.displayName,
    icon: participant.avatar || '🎲',
    rarity: rarity.rarity,
    rarityColor: rarity.rarityColor,
  }
}

function buildFallbackStrip(participants: RoomParticipant[], total: number): CaseRouletteItem[] {
  const base = participants.map((participant, index) => participantToRouletteItem({
    displayName: participant.display_name || participant.username,
    avatar: participant.avatar || participant.talisman || (participant.is_bot ? '🤖' : '🦊'),
  }, index))
  const source = base.length ? base : [{ name: 'Участник', icon: '🎲', rarity: 'Consumer', rarityColor: '#b0c3d9' }]
  return Array.from({ length: total }, (_, index) => source[index % source.length])
}

export function RoomPage({ roomId, userId, onExit, toast }: Props) {
  const api = useMemo(() => new ApiClient(), [])
  const [room, setRoom] = useState<RoomDetail | null>(null)
  const [participants, setParticipants] = useState<RoomParticipant[]>([])
  const [timer, setTimer] = useState<number>(15)
  const [winner, setWinner] = useState<Winner | null>(null)
  const [winnerVisible, setWinnerVisible] = useState(false)
  const [isSpinning, setIsSpinning] = useState(false)
  const [rouletteItems, setRouletteItems] = useState<CaseRouletteItem[]>([])
  const [winIndex, setWinIndex] = useState<number | null>(DEFAULT_WIN_INDEX)
  const [roundStripLocked, setRoundStripLocked] = useState(false)
  const [spinCompleted, setSpinCompleted] = useState(false)
  const [roundFinishedReceived, setRoundFinishedReceived] = useState(false)
  const [animatedBalance, setAnimatedBalance] = useState(0)
  const [balanceGainFx, setBalanceGainFx] = useState<number | null>(null)
  const [coinRain, setCoinRain] = useState<CoinParticle[]>([])
  const roomCloseTimeoutRef = useRef<number | null>(null)
  const winnerHideTimeoutRef = useRef<number | null>(null)
  const balanceFxTimeoutRef = useRef<number | null>(null)
  const coinRainTimeoutRef = useRef<number | null>(null)
  const pendingRoundFinishRef = useRef<RoundFinishedPayload | null>(null)

  const refreshRoom = useCallback(async () => {
    const data = await api.getRoom(roomId)
    setRoom(data)
    setParticipants(data.participants || [])
    if (typeof data.time_remaining === 'number') setTimer(data.time_remaining)
    const amParticipant = (data.participants || []).some((p) => p.user_id === userId && !p.is_bot)
    if (!amParticipant) onExit()
  }, [api, roomId, userId, onExit])

  const refreshBalance = useCallback(async () => {
    const profile = await api.getUserProfile(userId, 1)
    setAnimatedBalance(profile.bonus_balance)
  }, [api, userId])

  useEffect(() => {
    refreshRoom().catch((e: Error) => {
      toast(e.message, 'error')
      onExit()
    })
    refreshBalance().catch(() => undefined)
  }, [refreshRoom, refreshBalance, toast, onExit])

  useEffect(() => {
    return () => {
      if (roomCloseTimeoutRef.current) {
        window.clearTimeout(roomCloseTimeoutRef.current)
      }
      if (winnerHideTimeoutRef.current) {
        window.clearTimeout(winnerHideTimeoutRef.current)
      }
      if (balanceFxTimeoutRef.current) {
        window.clearTimeout(balanceFxTimeoutRef.current)
      }
      if (coinRainTimeoutRef.current) {
        window.clearTimeout(coinRainTimeoutRef.current)
      }
    }
  }, [])

  const applyRoundFinished = useCallback((data: RoundFinishedPayload) => {
    setIsSpinning(false)
    setRoundStripLocked(false)
    setRoundFinishedReceived(true)
    setRoom((prev) => (prev ? { ...prev, status: 'finished' } : prev))
    const linger = Number(data.lingerSeconds) || 30
    setTimer(linger)
    toast(`Победитель: ${data.winnerUsername}`, 'success')
    setWinnerVisible(true)
    const awardedAmount = Number(data.awardedAmount) || 0
    if (data.winnerId === userId && awardedAmount > 0) {
      const from = animatedBalance
      const to = from + awardedAmount
      const startAt = performance.now()
      const duration = 1700
      const tick = (ts: number) => {
        const progress = Math.min(1, (ts - startAt) / duration)
        const eased = 1 - Math.pow(1 - progress, 3)
        setAnimatedBalance(Math.round(from + (to - from) * eased))
        if (progress < 1) {
          requestAnimationFrame(tick)
        } else {
          setAnimatedBalance(to)
        }
      }
      requestAnimationFrame(tick)
      setBalanceGainFx(awardedAmount)
      setCoinRain(Array.from({ length: 30 }, (_, idx) => ({
        id: idx,
        left: Math.random() * 100,
        delay: Math.random() * 0.55,
        duration: 1.8 + Math.random() * 1.5,
        size: 16 + Math.floor(Math.random() * 14),
        drift: -24 + Math.random() * 48,
      })))
      if (balanceFxTimeoutRef.current) window.clearTimeout(balanceFxTimeoutRef.current)
      balanceFxTimeoutRef.current = window.setTimeout(() => setBalanceGainFx(null), 2600)
      if (coinRainTimeoutRef.current) window.clearTimeout(coinRainTimeoutRef.current)
      coinRainTimeoutRef.current = window.setTimeout(() => setCoinRain([]), 3200)
    } else {
      refreshBalance().catch(() => undefined)
    }
    if (winnerHideTimeoutRef.current) window.clearTimeout(winnerHideTimeoutRef.current)
    winnerHideTimeoutRef.current = window.setTimeout(() => setWinnerVisible(false), 3000)
    if (roomCloseTimeoutRef.current) window.clearTimeout(roomCloseTimeoutRef.current)
    roomCloseTimeoutRef.current = window.setTimeout(() => onExit(), linger * 1000)
  }, [animatedBalance, onExit, refreshBalance, toast, userId])

  useEffect(() => {
    if (roundStripLocked || isSpinning || room?.status === 'locked' || room?.status === 'running' || room?.status === 'finished') {
      return
    }
    setRouletteItems(buildFallbackStrip(participants, DEFAULT_STRIP_SIZE))
  }, [participants, isSpinning, room?.status, roundStripLocked])

  const wsHandlers = useMemo(() => ({
    TIMER_TICK: (data: { secondsLeft?: number }) => setTimer(Number(data.secondsLeft) || 0),
    BOTS_ADDED: () => refreshRoom().catch(() => undefined),
    PARTICIPANTS_SYNC: (data: { participants?: RoomParticipant[] }) => {
      setParticipants(data.participants || [])
    },
    ROOM_LOCKED: () => setRoom((prev) => (prev ? { ...prev, status: 'locked' } : prev)),
    ROUND_RESULT: (data: { laneStrip?: RoundLaneParticipant[]; winIndex?: number; winnerParticipantId?: number }) => {
      setRoundStripLocked(true)
      setSpinCompleted(false)
      setRoundFinishedReceived(false)
      pendingRoundFinishRef.current = null
      const laneStrip = data.laneStrip || []
      const nextWinIndex = typeof data.winIndex === 'number' ? data.winIndex : DEFAULT_WIN_INDEX
      console.debug('[RoomPage] ROUND_RESULT received', {
        roomId,
        winnerParticipantId: data.winnerParticipantId,
        winIndex: nextWinIndex,
        laneStripCount: laneStrip.length,
      })
      setWinIndex(nextWinIndex)
      if (laneStrip.length > nextWinIndex) {
        const preparedStrip = laneStrip.map((participant, index) => laneParticipantToRouletteItem(participant, index))
        setRouletteItems(preparedStrip)

        const winnerByIndex = laneStrip[nextWinIndex] || null
        const winnerById = typeof data.winnerParticipantId === 'number'
          ? laneStrip.find((participant) => participant.participantId === data.winnerParticipantId) || null
          : null

        if (winnerByIndex && winnerById && winnerByIndex.participantId !== winnerById.participantId) {
          console.error('[RoomPage] Backend ROUND_RESULT mismatch: winnerParticipantId != laneStrip[winIndex]', {
            winnerParticipantId: winnerById.participantId,
            laneWinnerParticipantId: winnerByIndex.participantId,
            winIndex: nextWinIndex,
          })
        }

        const resolvedWinner = winnerByIndex || winnerById
        if (resolvedWinner) {
          console.debug('[RoomPage] Winner resolved from server laneStrip', {
            participantId: resolvedWinner.participantId,
            displayName: resolvedWinner.displayName,
          })
          setWinner({ avatar: resolvedWinner.avatar, displayName: resolvedWinner.displayName })
        } else {
          console.warn('[RoomPage] Winner is unresolved for ROUND_RESULT', { winIndex: nextWinIndex })
          setWinner(null)
        }
      } else {
        console.warn('[RoomPage] ROUND_RESULT has invalid laneStrip, using fallback strip', {
          participantSnapshotCount: participants.length,
          winIndex: nextWinIndex,
          laneStripCount: laneStrip.length,
        })
        setRouletteItems(buildFallbackStrip(participants, Math.max(DEFAULT_STRIP_SIZE, nextWinIndex + 5)))
        setWinner(null)
      }
      setWinnerVisible(false)
      setIsSpinning(true)
    },
    ROUND_FINISHED: (data: RoundFinishedPayload) => {
      if (spinCompleted) {
        applyRoundFinished(data)
      } else {
        pendingRoundFinishRef.current = data
      }
    },
  }), [participants, refreshRoom, spinCompleted, applyRoundFinished])

  useRoomRealtime(roomId, userId, wsHandlers)

  useEffect(() => {
    if (timer <= 0) return
    const id = window.setInterval(() => setTimer((v) => Math.max(0, v - 1)), 1000)
    return () => window.clearInterval(id)
  }, [timer])

  const leaveRoom = async () => {
    try {
      if (roomCloseTimeoutRef.current) {
        window.clearTimeout(roomCloseTimeoutRef.current)
        roomCloseTimeoutRef.current = null
      }
      if (winnerHideTimeoutRef.current) {
        window.clearTimeout(winnerHideTimeoutRef.current)
        winnerHideTimeoutRef.current = null
      }
      if (balanceFxTimeoutRef.current) {
        window.clearTimeout(balanceFxTimeoutRef.current)
        balanceFxTimeoutRef.current = null
      }
      if (coinRainTimeoutRef.current) {
        window.clearTimeout(coinRainTimeoutRef.current)
        coinRainTimeoutRef.current = null
      }
      const result = await api.leaveRoom(roomId, userId)
      toast(`${result.message}. Возвращено: ${result.refunded_amount}`, 'success')
      onExit()
    } catch (error) {
      toast((error as Error).message, 'error')
    }
  }

  const activateBoost = async () => {
    try {
      await api.activateBoost(roomId, userId)
      await refreshRoom()
      toast('Буст активирован', 'success')
    } catch (error) {
      toast((error as Error).message, 'error')
    }
  }

  if (!room) return null
  const me = participants.find((p) => p.user_id === userId && !p.is_bot)
  const canBoost = Boolean(me) && room.status === 'waiting' && room.boost_enabled
  const boostActivated = Boolean(me?.boost_multiplier && me.boost_multiplier > 0)

  return (
    <div className="room-layout">
      {coinRain.length > 0 && (
        <div className="coin-rain" aria-hidden="true">
          {coinRain.map((coin) => (
            <span
              key={coin.id}
              className="coin-rain__coin"
              style={{
                left: `${coin.left}%`,
                animationDelay: `${coin.delay}s`,
                animationDuration: `${coin.duration}s`,
                fontSize: `${coin.size}px`,
                ['--coin-drift' as string]: `${coin.drift}px`,
              }}
            >
              🪙
            </span>
          ))}
        </div>
      )}
      <aside className="room-sidebar shell-card">
        <div className="room-sidebar__top">
          <button className="btn btn-secondary" onClick={leaveRoom}>← Выйти из комнаты</button>
          <div>
            <p className="eyebrow">Комната (React)</p>
            <h2>{room.name}</h2>
          </div>
        </div>
        <div className="room-stat-grid">
          <div className={`stat-tile ${balanceGainFx ? 'stat-tile--jackpot' : ''}`}>
            <span className="stat-label">Баланс</span>
            <strong>{animatedBalance}</strong>
            {balanceGainFx && <span className="balance-gain-fx">+{balanceGainFx}</span>}
          </div>
          <div className="stat-tile"><span className="stat-label">Фонд</span><strong>{room.total_pool}</strong></div>
          <div className="stat-tile"><span className="stat-label">Статус</span><strong>{room.status}</strong></div>
          <div className="stat-tile"><span className="stat-label">Вход</span><strong>{room.entry_fee}</strong></div>
          <div className="stat-tile"><span className="stat-label">Мест</span><strong>{participants.length} / {room.max_players}</strong></div>
        </div>
        {canBoost && (
          <div className={`boost-controls shell-card shell-card--inner ${boostActivated ? 'boost-controls--active' : ''}`}>
            <p className="eyebrow">Усиление шанса</p>
            <button className={`btn btn-boost ${boostActivated ? 'btn-boost--active' : ''}`} disabled={boostActivated} onClick={activateBoost}>
              {boostActivated ? 'Буст активирован' : `Активировать буст +${Math.round(room.boost_multiplier * 100)}%`}
            </button>
            <span className="boost-cost">Стоимость: {room.boost_cost} бонусов</span>
            <div className="participants-list">
              {participants.map((participant) => (
                <div className={`participant-item ${participant.user_id === userId && !participant.is_bot ? 'you' : ''} ${participant.is_bot ? 'bot' : ''} ${participant.boost_multiplier > 0 ? 'participant-item--boosted' : ''}`} key={participant.id}>
                  <div className="participant-main">
                    <strong>{participant.avatar || participant.talisman || '🎲'} {participant.display_name || participant.username}</strong>
                    <span className="participant-sub">{participant.is_bot ? 'Бот' : 'Игрок'}</span>
                  </div>
                  {participant.boost_multiplier > 0 && <span className="boost-badge">⚡ +{Math.round(participant.boost_multiplier * 100)}%</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
      <div className={`room-stage shell-card ${isSpinning ? 'room-stage--active' : ''}`}>
        <div className="room-stage__header">
          <div>
            <p className="eyebrow">Розыгрыш</p>
            <h3>Case Roulette</h3>
          </div>
          <div className="timer-display shell-card shell-card--compact">
            <span className="timer-label">Таймер</span>
            <span>{timer}с</span>
          </div>
        </div>
        <div className="room-state-message">
          {room.status === 'finished' ? 'Раунд завершён. Комната скоро закроется.' : 'Крутится лента участников.'}
        </div>
        <div className="opencase-container-wrap">
          <CaseRoulette
            items={rouletteItems}
            winnerIndex={winIndex}
            isSpinning={isSpinning}
            onSpinEnd={() => {
              setSpinCompleted(true)
              if (pendingRoundFinishRef.current) {
                applyRoundFinished(pendingRoundFinishRef.current)
                pendingRoundFinishRef.current = null
              } else if (!roundFinishedReceived) {
                setIsSpinning(false)
              }
              if (winnerHideTimeoutRef.current) window.clearTimeout(winnerHideTimeoutRef.current)
              winnerHideTimeoutRef.current = window.setTimeout(() => setWinnerVisible(false), 3000)
            }}
          />
          <WinnerCelebration
            visible={winnerVisible}
            avatar={winner?.avatar || '🏆'}
            displayName={winner?.displayName || 'Победитель'}
          />
        </div>
      </div>
    </div>
  )
}
