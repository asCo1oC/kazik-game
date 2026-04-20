import { useCallback, useEffect, useMemo, useState } from 'react'
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

type Winner = { talisman: string; displayName: string }
type RoundLaneParticipant = { participantId: number; displayName: string; talisman: string }
const DEFAULT_WIN_INDEX = 30
const DEFAULT_STRIP_SIZE = 70
const RARITY_PALETTE = ['#b0c3d9', '#5e98d9', '#4b69ff', '#8847ff', '#d32ce6', '#eb4b4b', '#ffd700']
const RARITY_LABELS = ['Consumer', 'Industrial', 'Mil-Spec', 'Restricted', 'Classified', 'Covert', 'Extraordinary']

function rarityFromSeed(seedText: string, index: number) {
  const seed = [...seedText].reduce((acc, char) => acc + char.charCodeAt(0), 0) + index
  const paletteIndex = seed % RARITY_PALETTE.length
  return { rarityColor: RARITY_PALETTE[paletteIndex], rarity: RARITY_LABELS[paletteIndex] }
}

function participantToRouletteItem(participant: { displayName: string; talisman: string }, index: number): CaseRouletteItem {
  const rarity = rarityFromSeed(participant.displayName, index)
  return {
    name: participant.displayName,
    icon: participant.talisman || '🎲',
    rarity: rarity.rarity,
    rarityColor: rarity.rarityColor,
  }
}

function buildFallbackStrip(participants: RoomParticipant[], total: number): CaseRouletteItem[] {
  const base = participants.map((participant, index) => participantToRouletteItem({
    displayName: participant.display_name || participant.username,
    talisman: participant.talisman || (participant.is_bot ? '🤖' : '🦊'),
  }, index))
  const source = base.length ? base : [{ name: 'Участник', icon: '🎲', rarity: 'Consumer', rarityColor: '#b0c3d9' }]
  return Array.from({ length: total }, (_, index) => source[index % source.length])
}

function buildRoundStrip(
  laneParticipants: RoundLaneParticipant[],
  winnerParticipantId: number | undefined,
  winIndex: number,
): { strip: CaseRouletteItem[]; winner: RoundLaneParticipant | null } {
  const requiredLength = Math.max(DEFAULT_STRIP_SIZE, winIndex + 5)
  const winnerParticipant = laneParticipants.find((participant) => participant.participantId === winnerParticipantId) || null
  if (!laneParticipants.length) return { strip: [], winner: winnerParticipant }

  const mappedPool = laneParticipants.map((participant, index) => participantToRouletteItem(participant, index))
  const winnerItem = winnerParticipant
    ? participantToRouletteItem(winnerParticipant, winIndex)
    : mappedPool[winIndex % mappedPool.length]

  const strip = Array.from({ length: requiredLength }, (_, index) => {
    if (index === winIndex) return winnerItem
    const poolIndex = (index * 7 + 3) % mappedPool.length
    return mappedPool[poolIndex]
  })

  return { strip, winner: winnerParticipant }
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

  const refreshRoom = useCallback(async () => {
    const data = await api.getRoom(roomId)
    setRoom(data)
    setParticipants(data.participants || [])
    if (typeof data.time_remaining === 'number') setTimer(data.time_remaining)
    const amParticipant = (data.participants || []).some((p) => p.user_id === userId && !p.is_bot)
    if (!amParticipant) onExit()
  }, [api, roomId, userId, onExit])

  useEffect(() => {
    refreshRoom().catch((e: Error) => {
      toast(e.message, 'error')
      onExit()
    })
  }, [refreshRoom, toast, onExit])

  useEffect(() => {
    if (roundStripLocked || isSpinning || room?.status === 'locked' || room?.status === 'running' || room?.status === 'finished') {
      return
    }
    setRouletteItems(buildFallbackStrip(participants, DEFAULT_STRIP_SIZE))
  }, [participants, isSpinning, room?.status, roundStripLocked])

  const wsHandlers = useMemo(() => ({
    TIMER_TICK: (data: { secondsLeft?: number }) => setTimer(Number(data.secondsLeft) || 0),
    BOTS_ADDED: () => refreshRoom().catch(() => undefined),
    ROOM_LOCKED: () => setRoom((prev) => (prev ? { ...prev, status: 'locked' } : prev)),
    ROUND_RESULT: (data: { laneParticipants?: RoundLaneParticipant[]; winIndex?: number; winnerParticipantId?: number }) => {
      const laneParticipants = data.laneParticipants || []
      const nextWinIndex = typeof data.winIndex === 'number' ? data.winIndex : DEFAULT_WIN_INDEX
      setWinIndex(nextWinIndex)
      setRoundStripLocked(true)
      if (laneParticipants.length) {
        const prepared = buildRoundStrip(laneParticipants, data.winnerParticipantId, nextWinIndex)
        setRouletteItems(prepared.strip)
        if (prepared.winner) {
          setWinner({ talisman: prepared.winner.talisman, displayName: prepared.winner.displayName })
        } else {
          setWinner(null)
        }
      } else {
        setRouletteItems(buildFallbackStrip(participants, Math.max(DEFAULT_STRIP_SIZE, nextWinIndex + 5)))
        setWinner(null)
      }
      setWinnerVisible(false)
      setIsSpinning(true)
    },
    ROUND_FINISHED: (data: { lingerSeconds?: number; winnerUsername?: string }) => {
      setIsSpinning(false)
      setRoundStripLocked(false)
      setRoom((prev) => (prev ? { ...prev, status: 'finished' } : prev))
      const linger = Number(data.lingerSeconds) || 30
      setTimer(linger)
      toast(`Победитель: ${data.winnerUsername}`, 'success')
      setWinnerVisible(true)
      window.setTimeout(() => setWinnerVisible(false), 3000)
      window.setTimeout(() => onExit(), linger * 1000)
    },
  }), [participants, refreshRoom, toast, onExit])

  useRoomRealtime(roomId, userId, wsHandlers)

  useEffect(() => {
    if (timer <= 0) return
    const id = window.setInterval(() => setTimer((v) => Math.max(0, v - 1)), 1000)
    return () => window.clearInterval(id)
  }, [timer])

  const leaveRoom = async () => {
    try {
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
      <aside className="room-sidebar shell-card">
        <div className="room-sidebar__top">
          <button className="btn btn-secondary" onClick={leaveRoom}>← Выйти из комнаты</button>
          <div>
            <p className="eyebrow">Комната (React)</p>
            <h2>{room.name}</h2>
          </div>
        </div>
        <div className="room-stat-grid">
          <div className="stat-tile"><span className="stat-label">Фонд</span><strong>{room.total_pool}</strong></div>
          <div className="stat-tile"><span className="stat-label">Статус</span><strong>{room.status}</strong></div>
          <div className="stat-tile"><span className="stat-label">Вход</span><strong>{room.entry_fee}</strong></div>
          <div className="stat-tile"><span className="stat-label">Мест</span><strong>{participants.length} / {room.max_players}</strong></div>
        </div>
        {canBoost && (
          <div className="boost-controls shell-card shell-card--inner">
            <p className="eyebrow">Усиление шанса</p>
            <button className="btn btn-boost" disabled={boostActivated} onClick={activateBoost}>
              {boostActivated ? 'Буст активирован' : `Купить буст (+${Math.round(room.boost_multiplier * 100)}% шанс)`}
            </button>
            <span className="boost-cost">Стоимость: {room.boost_cost} бонусов</span>
          </div>
        )}
      </aside>
      <div className="room-stage shell-card">
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
              setIsSpinning(false)
              setWinnerVisible(true)
              window.setTimeout(() => setWinnerVisible(false), 3000)
            }}
          />
          <WinnerCelebration
            visible={winnerVisible}
            talisman={winner?.talisman || '🏆'}
            displayName={winner?.displayName || 'Победитель'}
          />
        </div>
      </div>
    </div>
  )
}
