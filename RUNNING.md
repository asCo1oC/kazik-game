# Запуск MVP Stoloto VIP Opencase

## Быстрый старт (один команда)

```bash
./setup.sh
```

Скрипт автоматически:
- создаст виртуальное окружение `venv/`
- установит зависимости из `requirements.txt`
- инициализирует базу данных через `seed.py`

## Ручная настройка

Если `setup.sh` не работает, выполните вручную:

```bash
# 1. Создать venv
python3 -m venv venv

# 2. Активировать
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. Установить зависимости
pip install --upgrade pip
pip install -r requirements.txt

# 4. Создать БД и демо-данные
python seed.py
# Должен быть вывод: ✅ Demo data seeded

# 5. Запустить сервер
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 6. Собрать React-бандл, который раздает backend
cd frontend-react
npm install
npm run build:app
cd ..

# 7. Открыть в браузере
# http://localhost:8000/
```

## Важно про React в этом проекте

- Backend раздает файл `frontend/index.html`.
- Этот HTML подключает собранный React-бандл из `frontend/react-app/`.
- Если меняете код в `frontend-react/src`, нужно заново выполнить:

```bash
cd frontend-react
npm run build:app
```

Иначе в браузере останется старая версия интерфейса.

## Версии Node.js

- Текущая сборка `build:app` настроена для Node.js `18.19+`.
- Если видите ошибку Vite про несовместимую версию Node, выполните `npm install` в `frontend-react` и повторите `npm run build:app`.

## Подготовка к push в GitHub

Перед push убедитесь, что:

1. React-бандл пересобран:
   - `cd frontend-react && npm run build:app`
2. Backend запускается без ошибок:
   - `python3 -m app.main`
3. В браузере открывается `http://localhost:8000/` и рулетка работает корректно.
4. Документация по инциденту добавлена:
   - `docs/ROULETTE_MISMATCH_INCIDENT.md`

## Проверка установки

После `python seed.py` должны появиться:
- Файл базы данных: `vip_opencase.db` (в корне проекта)
- 4 демо-пользователя в таблице `users`
- 1 комната `VIP Demo Room` в таблице `rooms`
- Глобальная конфигурация в `admin_configs`

## Если возникла ошибка

### `ModuleNotFoundError: No module named 'aiosqlite'`
Запустите `pip install -r requirements.txt` внутри активированного `venv`.

### `sqlite3.OperationalError: unable to open database file`
Убедитесь, что у вас есть права на запись в текущей директории. Скрипт `setup.sh` создаст БД в корне проекта.

### `port 8000 already in use`
Остановите другой процесс или используйте другой порт:
```bash
uvicorn app.main:app --reload --port 8001
```

## Структура проекта

- `app/` — FastAPI backend
- `frontend/` — HTML/CSS/JS SPA
- `docs/` — документация
- `requirements.txt` — Python зависимости
- `seed.py` — инициализация данных
- `vip_opencase.db` — SQLite база (создается при первом запуске)

## API Endpoints

- `GET  /api/rooms` — список комнат
- `POST /api/rooms?user_id=1` — создать комнату
- `GET  /api/rooms/{id}` — детали комнаты
- `POST /api/rooms/{id}/join?user_id=1` — войти
- `POST /api/rooms/{id}/boost?user_id=1` — купить буст
- `GET  /api/admin/config` — конфигурация
- `POST /api/admin/config` — сохранить конфиг
- `GET  /api/history` — история раундов
- `WS   /ws/room/{room_id}?user_id=1` — realtime события

## WebSocket события

- `TIMER_TICK` — тик таймера
- `BOT_ADDED` — добавление бота
- `BOOST_ACTIVATED` — кто-то купил буст
- `ROUND_RESULT` — **предопределенный** результат (winIndex, itemData)
- `ROUND_FINISHED` — итоги, начисление

---

**После успешного запуска** откройте `http://localhost:8000/frontend/index.html` и войдите в демо-комнату.
