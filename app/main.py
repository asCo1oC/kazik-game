import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.config import settings
from app.database import init_db, get_db, AsyncSessionLocal
from app.models.models import User, Room, RoomStatus
from app.schemas.room import (
    RoomCreate, RoomUpdate, RoomResponse, RoomDetailResponse,
    RoomJoinRequest, RoomJoinResponse, BoostActivateRequest, BoostActivateResponse,
    ParticipantInfo, RoomListFilter, RoomLeaveRequest, RoomLeaveResponse
)
from app.schemas.admin import (
    AdminConfigCreate, AdminConfigUpdate, AdminConfigResponse,
    ConfigValidationResponse, HistoryEntry
)
from app.schemas.common import ErrorResponse, SuccessResponse
from app.services.rooms_service import RoomsService
from app.services.bonus_service import BonusService
from app.services.rng_service import RngService
from app.services.config_service import ConfigService
from app.services.history_service import HistoryService
from app.ws.manager import manager
from app.integrations.stoloto_adapter import stoloto_adapter
from app.room_tiers import resolve_room_tier


room_tasks: dict[int, asyncio.Task] = {}
room_db_lock = asyncio.Lock()
ROOM_POOL_TARGET = 10


def build_rooms_service(db: AsyncSession) -> RoomsService:
    bonus = BonusService(db)
    rng = RngService(db, bonus)
    return RoomsService(db, bonus, rng)


def _build_replacement_payload(room: Room | object) -> dict:
    data = room if isinstance(room, dict) else room.__dict__
    return {
        "name": data["name"],
        "tier": data["tier"],
        "max_players": data["max_players"],
        "entry_fee": data["entry_fee"],
        "prize_pool_pct": data["prize_pool_pct"],
        "boost_enabled": data["boost_enabled"],
        "boost_cost": data["boost_cost"],
        "boost_multiplier": data["boost_multiplier"],
    }


async def _create_replacement_room(payload: dict):
    async with room_db_lock:
        async with AsyncSessionLocal() as db:
            service = build_rooms_service(db)
            await service.create_room(payload["name"], None, payload)


async def ensure_waiting_room_pool():
    async with room_db_lock:
        async with AsyncSessionLocal() as db:
            rooms_service = build_rooms_service(db)
            current_waiting = await rooms_service.list_rooms({"status": "waiting"})
            waiting_count = len(current_waiting)
            if waiting_count > ROOM_POOL_TARGET:
                excess = waiting_count - ROOM_POOL_TARGET
                for room in current_waiting[:excess]:
                    real_players = await rooms_service.count_real_players(room.id)
                    if real_players == 0:
                        await rooms_service.delete_room_and_bot_users(room.id)
                current_waiting = await rooms_service.list_rooms({"status": "waiting"})
                waiting_count = len(current_waiting)

            if waiting_count >= ROOM_POOL_TARGET:
                return
            templates = current_waiting
            if not templates:
                templates = [
                    {
                        "name": "Auto Bronze",
                        "tier": "bronze",
                        "max_players": settings.default_max_players,
                        "entry_fee": 300,
                        "prize_pool_pct": settings.default_prize_pool_pct,
                        "boost_enabled": settings.default_boost_enabled,
                        "boost_cost": 60,
                        "boost_multiplier": 0.10
                    },
                    {
                        "name": "Auto Silver",
                        "tier": "silver",
                        "max_players": settings.default_max_players,
                        "entry_fee": 1200,
                        "prize_pool_pct": settings.default_prize_pool_pct,
                        "boost_enabled": settings.default_boost_enabled,
                        "boost_cost": 180,
                        "boost_multiplier": 0.15
                    },
                    {
                        "name": "Auto Gold",
                        "tier": "gold",
                        "max_players": settings.default_max_players,
                        "entry_fee": 2800,
                        "prize_pool_pct": settings.default_prize_pool_pct,
                        "boost_enabled": settings.default_boost_enabled,
                        "boost_cost": 320,
                        "boost_multiplier": 0.20
                    },
                    {
                        "name": "Auto Platinum",
                        "tier": "platinum",
                        "max_players": settings.default_max_players,
                        "entry_fee": 4500,
                        "prize_pool_pct": settings.default_prize_pool_pct,
                        "boost_enabled": settings.default_boost_enabled,
                        "boost_cost": 450,
                        "boost_multiplier": 0.25
                    },
                ]
            to_create = max(0, ROOM_POOL_TARGET - waiting_count)
            for idx in range(max(0, to_create)):
                template = templates[idx % len(templates)]
                payload = _build_replacement_payload(template)
                await rooms_service.create_room(payload["name"], None, payload)


async def cleanup_inactive_rooms():
    async with room_db_lock:
        async with AsyncSessionLocal() as db:
            service = build_rooms_service(db)
            inactive_room_ids = (await db.execute(
                select(Room.id).where(Room.status != RoomStatus.WAITING)
            )).scalars().all()
            for room_id in inactive_room_ids:
                await service.delete_room_and_bot_users(room_id)
            orphaned_bots = (await db.execute(
                select(User.id).where(User.username.like("bot_%"))
            )).scalars().all()
            if orphaned_bots:
                await db.execute(delete(User).where(User.id.in_(orphaned_bots)))
                await db.commit()


async def maybe_start_room_timer(room_id: int, service: RoomsService):
    if room_id in room_tasks:
        return
    room = await service.db.get(Room, room_id)
    if not room or room.status != RoomStatus.WAITING:
        return
    real_players = await service.count_real_players(room_id)
    if real_players > 0:
        room_tasks[room_id] = asyncio.create_task(room_timer_task(room_id))

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await cleanup_inactive_rooms()
    await ensure_waiting_room_pool()
    async with AsyncSessionLocal() as db:
        service = build_rooms_service(db)
        room_ids = (await db.execute(select(Room.id).where(Room.status == RoomStatus.WAITING))).scalars().all()
        for room_id in room_ids:
            await maybe_start_room_timer(room_id, service)
    yield

app = FastAPI(title=settings.app_name, lifespan=lifespan)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Calculate paths relative to this file's location
PROJECT_ROOT = Path(__file__).parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"

# Serve static frontend
app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")

@app.get("/")
async def serve_index():
    return FileResponse(str(FRONTEND_DIR / "index.html"))

# Dependency helpers
async def get_rooms_service(db: AsyncSession = Depends(get_db)) -> RoomsService:
    return build_rooms_service(db)

async def get_config_service(db: AsyncSession = Depends(get_db)) -> ConfigService:
    return ConfigService(db)

async def get_history_service(db: AsyncSession = Depends(get_db)) -> HistoryService:
    return HistoryService(db)

# ============ ROOM / LOBBY ENDPOINTS ============

@app.get("/api/rooms")
async def list_rooms(
    entry_fee_min: int | None = Query(None),
    entry_fee_max: int | None = Query(None),
    seats_min: int | None = Query(None),
    seats_max: int | None = Query(None),
    tier: str | None = Query(None),
    status: str | None = Query(None),
    service: RoomsService = Depends(get_rooms_service)
):
    filters = {
        "entry_fee_min": entry_fee_min,
        "entry_fee_max": entry_fee_max,
        "seats_min": seats_min,
        "seats_max": seats_max,
        "tier": tier,
        "status": status
    }
    rooms = await service.list_rooms(filters)
    return [RoomResponse.model_validate(r) for r in rooms]

@app.get("/api/rooms/{room_id}")
async def get_room(room_id: int, service: RoomsService = Depends(get_rooms_service)):
    data = await service.get_room_with_participants(room_id)
    if not data:
        raise HTTPException(status_code=404, detail="Room not found")
    room = data["room"]
    participants = data["participants"]
    time_remaining = None
    if room.status == RoomStatus.FINISHED and room.finished_at:
        elapsed = int((datetime.utcnow() - room.finished_at).total_seconds())
        time_remaining = max(0, 30 - elapsed)
    return RoomDetailResponse(
        **RoomResponse.model_validate(room).model_dump(),
        participants_count=len(participants),
        bots_count=sum(1 for p in participants if p["is_bot"]),
        time_remaining=time_remaining,
        participants=[ParticipantInfo(**p) for p in participants]
    )


@app.get("/api/users/{user_id}/active-room")
async def get_user_active_room(user_id: int, service: RoomsService = Depends(get_rooms_service)):
    room_id = await service.get_active_room_for_user(user_id)
    return {"room_id": room_id}

@app.post("/api/rooms")
async def create_room(
    room: RoomCreate,
    creator_id: int = Query(..., description="ID of the user creating the room"),
    service: RoomsService = Depends(get_rooms_service)
):
    payload = room.model_dump()
    payload["tier"] = payload.get("tier") or resolve_room_tier(payload["entry_fee"])
    room_obj = await service.create_room(room.name, creator_id, payload)
    await maybe_start_room_timer(room_obj.id, service)
    return RoomResponse.model_validate(room_obj)

@app.post("/api/rooms/{room_id}/join")
async def join_room(
    room_id: int,
    request: RoomJoinRequest,
    service: RoomsService = Depends(get_rooms_service)
):
    try:
        participant, msg = await service.join_room(room_id, request.user_id)
        await maybe_start_room_timer(room_id, service)
        room_data = await service.get_room_with_participants(room_id)
        pool = room_data["room"].total_pool
        seats_taken = len(room_data["participants"])
        return RoomJoinResponse(
            room_id=room_id,
            participant_id=participant.id,
            reserved_amount=participant.reserved_amount,
            seats_taken=seats_taken,
            total_pool=pool,
            message=msg
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/rooms/{room_id}/leave")
async def leave_room(
    room_id: int,
    request: RoomLeaveRequest,
    service: RoomsService = Depends(get_rooms_service)
):
    try:
        result = await service.leave_room(room_id, request.user_id)
        room = await service.db.get(Room, room_id)
        task = room_tasks.get(room_id)
        if result["participants_count"] == 0:
            if room and room.status == RoomStatus.FINISHED:
                replacement_payload = _build_replacement_payload(room)
                await service.delete_room_and_bot_users(room_id)
                if task:
                    task.cancel()
                    room_tasks.pop(room_id, None)
                await _create_replacement_room(replacement_payload)
            elif task:
                task.cancel()
                room_tasks.pop(room_id, None)
            await ensure_waiting_room_pool()
        return RoomLeaveResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/rooms/{room_id}/boost")
async def activate_boost(
    room_id: int,
    request: BoostActivateRequest,
    service: RoomsService = Depends(get_rooms_service)
):
    try:
        boost = await service.activate_boost(room_id, request.user_id)
        return BoostActivateResponse(
            participant_id=boost.participant_id,
            boost_multiplier=boost.multiplier,
            cost=boost.cost,
            message="Boost activated"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# ============ ADMIN CONFIG ENDPOINTS ============

@app.get("/api/admin/config")
async def get_admin_config(
    room_id: int | None = Query(None),
    service: ConfigService = Depends(get_config_service)
):
    config = await service.get_config(room_id)
    if not config:
        raise HTTPException(status_code=404, detail="Config not found")
    return AdminConfigResponse.model_validate(config)

@app.post("/api/admin/config")
async def update_admin_config(
    config: AdminConfigCreate,
    service: ConfigService = Depends(get_config_service)
):
    try:
        saved, validation = await service.create_or_update_config(
            config.model_dump(),
            room_id=config.room_id
        )
        return {
            "config": AdminConfigResponse.model_validate(saved),
            "validation": validation
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/admin/config/validate")
async def validate_config(
    config: AdminConfigCreate,
    service: ConfigService = Depends(get_config_service)
):
    validation = await service.validate_config(config.model_dump())
    return validation

# ============ HISTORY ENDPOINTS ============

@app.get("/api/history")
async def get_history(
    limit: int = Query(50, le=100),
    room_id: int | None = Query(None),
    service: HistoryService = Depends(get_history_service)
):
    entries = await service.get_round_history(limit, room_id)
    return [HistoryEntry.model_validate(e) for e in entries]

# ============ WEBSOCKET ENDPOINT ============

@app.websocket("/ws/room/{room_id}")
async def websocket_room(websocket: WebSocket, room_id: int, user_id: int = Query(...)):
    await manager.connect(websocket, room_id, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            # For MVP we only push from server; client messages are no-ops
            pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id, user_id)

# ============ BACKGROUND TASKS ============

async def room_timer_task(room_id: int):
    """Background task that ticks room timer and manages state transitions."""
    try:
        async with AsyncSessionLocal() as db:
            service = build_rooms_service(db)
        # Ожидание набора (default_wait_seconds, сейчас 15 с)
            for remaining in range(settings.default_wait_seconds, 0, -1):
                await manager.broadcast_to_room(room_id, "TIMER_TICK", {"secondsLeft": remaining})
                await asyncio.sleep(1)

        # Lock room
            async with room_db_lock:
                locked = await service.lock_room(room_id)
            if not locked:
                return
            await manager.broadcast_to_room(room_id, "ROOM_LOCKED", {"roomId": room_id})

        # Fill bots
            async with room_db_lock:
                bot_count = await service.fill_bots(room_id)
            if bot_count > 0:
                await manager.broadcast_to_room(room_id, "BOTS_ADDED", {"count": bot_count})

        # Small delay before start
            await asyncio.sleep(3)

        # Start round and send precomputed result
            async with room_db_lock:
                result = await service.start_round(room_id)
            await manager.broadcast_to_room(
                room_id,
                "ROUND_RESULT",
                {
                    "winIndex": result.get("win_index"),
                    "winnerParticipantId": result.get("winner_participant_id"),
                    "itemData": {
                        "id": result.get("item", {}).get("id"),
                        "name": result.get("item", {}).get("name"),
                        "rarity": result.get("item", {}).get("rarity"),
                        "icon": result.get("item", {}).get("icon"),
                    },
                    "comboString": result.get("item", {}).get("combo", ""),
                    "laneParticipants": [
                        {
                            "participantId": p["id"],
                            "displayName": p["display_name"],
                            "talisman": p["talisman"],
                            "isBot": p["is_bot"]
                        }
                        for p in (await service.get_room_with_participants(room_id))["participants"]
                    ]
                }
            )

            await asyncio.sleep(settings.opencase_animation_seconds)

        # Finish round
            async with room_db_lock:
                round_obj = await service.finish_round(room_id)
                room_data = await service.get_room_with_participants(room_id)
                winner_id = round_obj.winner_user_id
                winner_participant = next(
                    (p for p in room_data["participants"] if p["id"] == round_obj.winner_participant_id),
                    None
                )
                is_bot_winner = winner_participant["is_bot"] if winner_participant else True
                awarded = round_obj.item_value if not is_bot_winner else 0

            await manager.broadcast_to_room(
                room_id,
                "ROUND_FINISHED",
                {
                    "winnerId": winner_id,
                    "winnerUsername": winner_participant["username"] if winner_participant else "Unknown",
                    "isBot": is_bot_winner,
                    "awardedAmount": awarded,
                    "itemName": round_obj.item_name,
                    "itemRarity": round_obj.item_rarity,
                    "comboString": round_obj.combo_string,
                    "lingerSeconds": 30
                }
            )

            linger_seconds = 30
            deadline = asyncio.get_running_loop().time() + linger_seconds
            while asyncio.get_running_loop().time() < deadline:
                await asyncio.sleep(1)
                async with room_db_lock:
                    room = await service.db.get(Room, room_id)
                    if not room:
                        return
                    real_players = await service.count_real_players(room_id)
                    if real_players == 0:
                        break
            async with room_db_lock:
                room = await service.db.get(Room, room_id)
                if not room:
                    return
                replacement_payload = _build_replacement_payload(room)
                await service.delete_room_and_bot_users(room_id)
        await _create_replacement_room(replacement_payload)
        await ensure_waiting_room_pool()

    except asyncio.CancelledError:
        logger.info(f"Room timer task cancelled for room {room_id}")
    except Exception as e:
        logger.error(f"Room timer task failed for room {room_id}: {e}")
    finally:
        room_tasks.pop(room_id, None)

# ============ ERROR HANDLERS ============

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    payload = ErrorResponse(
        code=exc.detail if isinstance(exc.detail, str) else "HTTP_ERROR",
        message=str(exc.detail),
        trace_id=request.headers.get("X-Request-ID")
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=payload.model_dump(),
        headers=exc.headers
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
