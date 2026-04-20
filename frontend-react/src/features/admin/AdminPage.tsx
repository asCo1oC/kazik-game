import { useEffect, useMemo, useState } from 'react'
import { ApiClient, type AdminConfig, type ConfigValidation } from '../../shared/api/client'

type Props = {
  onBack: () => void
  toast: (message: string, type?: string) => void
}

const initialConfig: AdminConfig = {
  max_players: 4,
  entry_fee: 1000,
  prize_pool_pct: 0.8,
  boost_enabled: true,
  boost_cost: 200,
  boost_multiplier: 0.2,
  bot_win_policy: 'return_pool',
}

export function AdminPage({ onBack, toast }: Props) {
  const api = useMemo(() => new ApiClient(), [])
  const [config, setConfig] = useState<AdminConfig>(initialConfig)
  const [validation, setValidation] = useState<ConfigValidation | null>(null)

  const validate = async (next = config) => {
    try {
      const v = await api.validateConfig(next)
      setValidation(v)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  useEffect(() => {
    api.getConfig()
      .then((cfg) => {
        setConfig(cfg)
        validate(cfg).catch(() => undefined)
      })
      .catch((e: Error) => toast(e.message, 'error'))
  }, [])

  const update = <K extends keyof AdminConfig>(key: K, value: AdminConfig[K]) => {
    const next = { ...config, [key]: value }
    setConfig(next)
    validate(next).catch(() => undefined)
  }

  return (
    <section id="admin-view" className="view active">
      <div className="admin-header shell-card">
        <div>
          <p className="eyebrow">Администрирование</p>
          <h2>Конфигуратор комнат</h2>
        </div>
        <button className="btn btn-secondary" onClick={onBack}>← Назад</button>
      </div>

      <div className="config-form shell-card">
        <div className="form-group">
          <label>Макс. игроков</label>
          <input type="range" min={2} max={10} value={config.max_players} onChange={(e) => update('max_players', Number(e.target.value))} />
          <span>{config.max_players}</span>
        </div>
        <div className="form-group">
          <label>Вход</label>
          <input type="range" min={100} max={5000} step={100} value={config.entry_fee} onChange={(e) => update('entry_fee', Number(e.target.value))} />
          <span>{config.entry_fee}</span>
        </div>
        <div className="form-group">
          <label>Призовой фонд (%)</label>
          <input type="range" min={50} max={95} value={Math.round(config.prize_pool_pct * 100)} onChange={(e) => update('prize_pool_pct', Number(e.target.value) / 100)} />
          <span>{Math.round(config.prize_pool_pct * 100)}%</span>
        </div>
        <div className="form-group">
          <label>Буст включен</label>
          <input type="checkbox" checked={config.boost_enabled} onChange={(e) => update('boost_enabled', e.target.checked)} />
        </div>
        <div className="form-group">
          <label>Стоимость буста</label>
          <input type="range" min={50} max={1000} step={50} value={config.boost_cost} onChange={(e) => update('boost_cost', Number(e.target.value))} />
          <span>{config.boost_cost}</span>
        </div>
        <div className="form-group">
          <label>Множитель буста</label>
          <input type="range" min={10} max={50} value={Math.round(config.boost_multiplier * 100)} onChange={(e) => update('boost_multiplier', Number(e.target.value) / 100)} />
          <span>{Math.round(config.boost_multiplier * 100)}%</span>
        </div>
        <div className="form-group">
          <label>Политика победы бота</label>
          <select value={config.bot_win_policy} onChange={(e) => update('bot_win_policy', e.target.value as AdminConfig['bot_win_policy'])}>
            <option value="return_pool">Возврат в пул</option>
            <option value="burn">Сжигание</option>
          </select>
        </div>

        <div className="risk-indicator">
          <span className={`risk-level ${validation?.risk_level || 'LOW'}`}>{validation?.risk_level || 'LOW'}</span>
          <p>{validation?.explanation || ''}</p>
          <ul className="risk-warnings">
            {[...(validation?.warnings || []), ...(validation?.errors || [])].map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>

        <button
          className="btn btn-primary"
          disabled={!validation?.can_save}
          onClick={async () => {
            try {
              await api.saveConfig(config)
              toast('Конфигурация сохранена', 'success')
            } catch (e) {
              toast((e as Error).message, 'error')
            }
          }}
        >
          Сохранить конфигурацию
        </button>
      </div>
    </section>
  )
}
