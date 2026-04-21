import { useEffect, useRef, useState } from 'react'

export type CaseRouletteItem = {
  name: string
  icon: string
  rarity: string
  rarityColor: string
}

type Props = {
  items: CaseRouletteItem[]
  winnerIndex: number | null
  isSpinning: boolean
  onSpinEnd?: () => void
}

const CARD_WIDTH = 180
const CARD_MARGIN = 10
const ITEM_FULL_WIDTH = CARD_WIDTH + CARD_MARGIN
const MAIN_SPIN_MS = 20000
const SETTLE_MS = 1100

export function CaseRoulette({ items, winnerIndex, isSpinning, onSpinEnd }: Props) {
  const [offset, setOffset] = useState(0)
  const [transition, setTransition] = useState('none')
  const [isSlowingDown, setIsSlowingDown] = useState(false)
  const stripRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isSpinning || winnerIndex === null) return undefined
    if (items.length <= winnerIndex) return undefined

    setTransition('none')
    setOffset(0)
    setIsSlowingDown(false)

    const randomOffset = 0
    const overshoot = 10 + Math.floor(Math.random() * 9)
    // Strip has padding-left: 50%, so card center formula is:
    // x = containerCenter + index * ITEM_FULL_WIDTH + CARD_WIDTH / 2 + offset.
    // To align selected card center with pointer at containerCenter:
    // offset = -(index * ITEM_FULL_WIDTH + CARD_WIDTH / 2).
    const targetOffset = -((winnerIndex * ITEM_FULL_WIDTH) + (CARD_WIDTH / 2) + randomOffset)
    const mainStopOffset = targetOffset - overshoot
    const finalOffset = targetOffset

    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setTransition(`transform ${MAIN_SPIN_MS}ms cubic-bezier(0.08, 0.92, 0.2, 1)`)
        setOffset(mainStopOffset)
      })
    })

    const settleTimer = window.setTimeout(() => {
      setTransition(`transform ${SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`)
      setOffset(finalOffset)
    }, MAIN_SPIN_MS)

    // Turn on jitter shortly before settle to add tension.
    const slowdownLeadMs = 1100
    const slowDownTimer = window.setTimeout(() => {
      setIsSlowingDown(true)
    }, Math.max(0, MAIN_SPIN_MS - slowdownLeadMs))

    const doneTimer = window.setTimeout(() => {
      setIsSlowingDown(false)
      onSpinEnd?.()
    }, MAIN_SPIN_MS + SETTLE_MS)

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.clearTimeout(settleTimer)
      window.clearTimeout(slowDownTimer)
      window.clearTimeout(doneTimer)
      setIsSlowingDown(false)
    }
  }, [isSpinning, winnerIndex, items, onSpinEnd])

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '1240px',
        height: '230px',
        background: '#111827',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '2px solid rgba(202, 138, 4, 0.3)',
        boxShadow: '0 0 30px rgba(234, 179, 8, 0.1)',
        margin: '0 auto',
        animation: isSlowingDown ? 'rouletteSlowShake 120ms steps(2,end) infinite' : 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: '4px',
          background: '#eab308',
          zIndex: 20,
          transform: 'translateX(-50%)',
          boxShadow: '0 0 15px rgba(234, 179, 8, 0.8)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '12px solid #eab308',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderBottom: '12px solid #eab308',
          }}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '120px',
          background: 'linear-gradient(to right, #111827, transparent)',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '120px',
          background: 'linear-gradient(to left, #111827, transparent)',
          zIndex: 10,
          pointerEvents: 'none',
        }}
      />

      <div
        ref={stripRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          paddingLeft: '50%',
          transform: `translateX(${offset}px)`,
          transition,
        }}
      >
        {items.map((item, idx) => (
          <div
            key={`${item.name}-${idx}`}
            style={{
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: `${CARD_WIDTH}px`,
              height: `${CARD_WIDTH}px`,
              marginRight: `${CARD_MARGIN}px`,
              background: 'rgba(31, 41, 55, 0.8)',
              backdropFilter: 'blur(4px)',
              borderRadius: '8px',
              borderBottom: `4px solid ${item.rarityColor}`,
              transition: 'filter 0.3s',
              cursor: 'default',
            }}
          >
            <div
              style={{
              fontSize: '56px',
                marginBottom: '8px',
                filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))',
              }}
            >
              {item.icon}
            </div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 'bold',
                color: '#e5e7eb',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                width: '100%',
                textAlign: 'center',
                padding: '0 8px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.name}
            </div>
            {/* rarity line intentionally hidden to keep roulette clean */}
          </div>
        ))}
      </div>
    </div>
  )
}
