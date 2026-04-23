import { useEffect, useRef } from 'react'

type WsPayload = Record<string, unknown>
type WsHandlers = Partial<Record<'TIMER_TICK' | 'ROOM_LOCKED' | 'BOTS_ADDED' | 'ROUND_RESULT' | 'ROUND_FINISHED' | 'PARTICIPANTS_SYNC', (data: WsPayload) => void>>

export function useRoomRealtime(roomId: number, userId: number, handlers: WsHandlers) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef(0)
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  useEffect(() => {
    let closedManually = false

    const connect = () => {
      const wsBase = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
      wsRef.current = new WebSocket(`${wsBase}/ws/room/${roomId}?user_id=${userId}`)

      wsRef.current.onopen = () => {
        reconnectRef.current = 0
      }
      wsRef.current.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const handler = handlersRef.current[msg.event as keyof WsHandlers]
          handler?.(msg.data)
        } catch {
          // ignore malformed payloads
        }
      }
      wsRef.current.onclose = () => {
        if (closedManually) return
        reconnectRef.current += 1
        const delay = Math.min(1000 * Math.pow(2, reconnectRef.current), 8000)
        window.setTimeout(connect, delay)
      }
    }

    connect()
    return () => {
      closedManually = true
      wsRef.current?.close()
    }
  }, [roomId, userId])
}
