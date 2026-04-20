# Stoloto VIP Opencase — MVP

Рабочий прототип быстрых игровых комнат на бонусные баллы для VIP-аудитории «Столото».

## Стек

- **Backend**: Python 3.11 + FastAPI
- **Database**: SQLite (aiosqlite)
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **Realtime**: WebSocket (native)
- **Deployment**: локально, без Docker

## Быстрый старт

### 1. Установка зависимостей

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Инициализация БД и демо-данные

```bash
python seed.py
```

Скрипт создаст SQLite-файл `vip_opencase.db` и добавит:
- 4 демо-пользователя с балансом 8 000–15 000 бонусов
- 1 демо-комнату «VIP Demo Room»
- глобальную конфигурацию админки

### 3. Запуск сервера

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Открытие фронтенда

Откройте в браузере: `http://localhost:8000/frontend/index.html`

Или просто `http://localhost:8000` — статика раздается из `frontend/`.

## Пользовательский сценарий

1. **Лобби** — список комнат. Можно фильтровать по входу и количеству мест.
2. **Вход** — нажмите «Войти» в демо-комнате. Бонусы резервируются автоматически.
3. **Ожидание** — таймер 60 секунд. Можно купить буст (кнопка «Купить буст»).
4. **Запуск** — backend заранее определил победителя. Анимация Opencase начинается.
5. **Результат** — после анимации отображается выигрыш. Если победил бот, фонд возвращается в `promo_pool`.

## Админ-панель

Ссылка: `http://localhost:8000/frontend/index.html#admin` (или кнопка в интерфейсе, если добавлена).

Параметры:
- `max_players` — максимальное количество игроков (2–10)
- `entry_fee` — входной взнос в бонусах (100–5000)
- `prize_pool_pct` — доля фонда, идущая в приз (50–95%)
- `boost_enabled` — включить/выключить бусты
- `boost_cost` — стоимость буста (50–1000)
- `boost_multiplier` — прибавка к весу (10–50%)
- `bot_win_policy` — `return_pool` (возврат в пул) или `burn` (сжигание)

Система валидации оценивает риск конфигурации:
- **LOW** — можно сохранять
- **MEDIUM** — предупреждение, но сохранение разрешено
- **HIGH** — сохранение заблокировано

## API Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/rooms` | Список комнат (фильтры: `entry_fee_min`, `entry_fee_max`, `seats_min`, `status`) |
| `POST` | `/api/rooms?user_id={id}` | Создать комнату |
| `GET` | `/api/rooms/{id}` | Детали комнаты |
| `POST` | `/api/rooms/{id}/join?user_id={id}` | Войти в комнату (резерв бонусов) |
| `POST` | `/api/rooms/{id}/boost?user_id={id}` | Купить буст (1 раз) |
| `GET` | `/api/admin/config?room_id={id}` | Получить конфигурацию |
| `POST` | `/api/admin/config` | Сохранить конфигурацию (с валидацией) |
| `POST` | `/api/admin/config/validate` | Проверить конфиг без сохранения |
| `GET` | `/api/history?limit=50&room_id={id}` | История раундов |

### WebSocket

```
ws://localhost:8000/ws/room/{room_id}?user_id={id}
```

События:
- `TIMER_TICK` — тик таймера
- `BOT_ADDED` — бот заполнил слот
- `BOOST_ACTIVATED` — кто-то активировал буст
- `ROOM_LOCKED` — набор завершен
- `ROUND_RESULT` — **предопределенный** результат (winIndex, itemData, comboString)
- `ROUND_FINISHED` — итоги, начисление/возврат

## Архитектура

```
app/
├── main.py              # FastAPI приложение, маршруты, фоновые задачи
├── config.py            # Настройки
├── database.py          # Async engine + сессии
├── models/
│   └── models.py        # SQLAlchemy сущности
├── schemas/
│   ├── room.py          # Pydantic схемы комнат
│   ├── admin.py         # Схемы конфигуратора
│   └── common.py        # Error/Success ответы
├── services/
│   ├── rooms_service.py # Жизненный цикл комнат, matchmaking, боты
│   ├── bonus_service.py # Резерв/начисление/возврат бонусов
│   ├── rng_service.py   # Backend-only RNG + precomputed winner
│   ├── config_service.py# Валидация конфигураций
│   └── history_service.py# История раундов
├── ws/
│   └── manager.py       # WebSocket connection manager
└── integrations/
    └── stoloto_adapter.py # Mock-адаптер для интеграции

frontend/
├── index.html
├── css/style.css
└── js/
    ├── config.js
    ├── app.js
    ├── views/
    │   ├── lobby.js
    │   ├── room.js
    │   └── admin.js
    ├── realtime/
    │   └── ws-client.js
    └── opencase/
        └── animation.js
```

## Бизнес-логика

### State Machine комнаты
```
WAITING → LOCKED → RUNNING → FINISHED → ARCHIVED
```

### RNG (только backend)
- Вес участника: `1.0` (база) + `boost_multiplier` (если куплен буст)
- Боты имеют тот же вес, что и игроки
- Победитель определяется **до** старта анимации
- Результат отправляется фронтенду через `ROUND_RESULT`

### Экономика
- При входе резервируется `entry_fee`
- При покупке буста резервируется `boost_cost`
- Общий фонд: `total_pool = sum(entry_fees) + sum(boost_costs)`
- Призовой фонд: `prize_pool = total_pool * prize_pool_pct`
- Если победитель — реальный пользователь: начисляется `item_value` из призового фонда
- Если победитель — бот: в зависимости от `bot_win_policy`:
  - `return_pool` — `prize_pool` возвращается в `promo_pool_ledger`
  - `burn` — средства сжигаются (ничего не делается)

### Анимация Opencase
- Лента из 60–80 предметов
- `winIndex` — индекс выигрышного предмета (0-based)
- Смещение: `offset = (winIndex * itemWidth) + (itemWidth/2) - (containerWidth/2) + randomOffset`
- Фазы: `launch → accel → decel → near-miss → stop → climax`
- Клиент **не вычисляет** результат

## Acceptance Criteria

- [x] Победитель определяется только backend до анимации
- [x] Frontend получает `ROUND_RESULT` до старта визуала
- [x] Буст покупается максимум 1 раз на пользователя
- [x] При победе бота фонд отражается в `promo_pool_ledger` (при `return_pool`)
- [x] Невалидный конфиг (`HIGH` риск) не сохраняется
- [x] Недостаток бонусов блокирует вход/буст с понятной ошибкой
- [x] История раундов и бонусные транзакции аудируются

## Масштабирование (продакшен-концепт)

- Замена SQLite → PostgreSQL
- Redis для pub/sub и кэширования
- Вынос RNG в сертифицированный микросервис
- Интеграция с реальными API «Столото» через `StolotoApiAdapter`
- Docker Compose + health checks
- Мониторинг: Prometheus + Grafana (метрики: RPS, latency, room throughput)

## Лицензии

Все используемые библиотеки — Open Source (MIT/Apache 2.0).

---

**Статус MVP**: Готов к демонстрации.  
**Время на запуск**: ~5 минут.
