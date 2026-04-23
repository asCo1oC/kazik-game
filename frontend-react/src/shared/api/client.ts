export type RoomParticipant = {
  id: number
  user_id: number
  username: string
  display_name: string
  is_bot: boolean
  avatar: string
  talisman: string
  reserved_amount: number
  boost_multiplier: number
}

export type RoomDetail = {
  id: number
  name: string
  tier: string
  status: 'waiting' | 'locked' | 'running' | 'finished' | 'archived'
  max_players: number
  entry_fee: number
  boost_enabled: boolean
  boost_cost: number
  boost_multiplier: number
  total_pool: number
  prize_pool: number
  time_remaining: number | null
  participants: RoomParticipant[]
  active_spin?: any
}

export type RoomListItem = {
  id: number
  name: string
  tier: string
  status: 'waiting' | 'locked' | 'running' | 'finished' | 'archived'
  max_players: number
  entry_fee: number
  boost_enabled: boolean
  total_pool: number
  prize_pool_pct: number
  created_at: string
}

export type AdminConfig = {
  max_players: number
  entry_fee: number
  prize_pool_pct: number
  boost_enabled: boolean
  boost_cost: number
  boost_multiplier: number
  bot_win_policy: 'return_pool' | 'burn'
}

export type ConfigValidation = {
  can_save: boolean
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH'
  explanation?: string
  warnings: string[]
  errors: string[]
}

export type AdminRoomItem = {
  id: number
  name: string
  status: 'waiting' | 'locked' | 'running' | 'finished' | 'archived'
  tier: string
  entry_fee: number
  max_players: number
  prize_pool_pct: number
  boost_enabled: boolean
  boost_cost: number
  boost_multiplier: number
  participants_count: number
  created_at: string | null
}

export type UserProfileEntry = {
  round_id: number
  room_id: number | null
  room_name: string
  status: 'win' | 'lose'
  item_name: string
  item_rarity: string
  awarded_amount: number
  finished_at: string
}

export type UserProfile = {
  user_id: number
  username: string
  avatar: string
  bonus_balance: number
  rounds_played: number
  wins_count: number
  history: UserProfileEntry[]
}

type ApiOptions = Omit<RequestInit, 'body'> & { payload?: unknown }

export class ApiClient {
  private apiBase: string

  constructor(apiBase = window.location.origin) {
    this.apiBase = apiBase
  }

  async request<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const init: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    }
    if (options.payload !== undefined) {
      init.body = JSON.stringify(options.payload)
    }

    const response = await fetch(`${this.apiBase}${path}`, init)
    const contentType = response.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text()

    if (!response.ok) {
      const message = (payload as { detail?: string; message?: string })?.detail
        ?? (payload as { detail?: string; message?: string })?.message
        ?? 'Request failed'
      throw new Error(message)
    }
    return payload as T
  }

  getRoom(roomId: number) {
    return this.request<RoomDetail>(`/api/rooms/${roomId}`)
  }

  getRooms(filters: Record<string, string | number | null | undefined> = {}) {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) {
        params.set(key, String(value))
      }
    })
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return this.request<RoomListItem[]>(`/api/rooms${suffix}`)
  }

  getActiveRoom(userId: number) {
    return this.request<{ room_id: number | null }>(`/api/users/${userId}/active-room`)
  }

  getUserProfile(userId: number, limit = 20) {
    return this.request<UserProfile>(`/api/users/${userId}/profile?limit=${limit}`)
  }

  createRoom(payload: {
    name: string
    max_players: number
    entry_fee: number
    prize_pool_pct: number
    boost_enabled: boolean
    boost_cost: number
    boost_multiplier: number
  }, userId: number) {
    return this.request<RoomListItem>(`/api/rooms?creator_id=${userId}`, {
      method: 'POST',
      payload,
    })
  }

  joinRoom(roomId: number, userId: number) {
    return this.request(`/api/rooms/${roomId}/join`, {
      method: 'POST',
      payload: { user_id: userId },
    })
  }

  leaveRoom(roomId: number, userId: number) {
    return this.request<{ message: string; refunded_amount: number }>(`/api/rooms/${roomId}/leave`, {
      method: 'POST',
      payload: { user_id: userId },
    })
  }

  activateBoost(roomId: number, userId: number) {
    return this.request(`/api/rooms/${roomId}/boost`, {
      method: 'POST',
      payload: { user_id: userId },
    })
  }

  getConfig() {
    return this.request<AdminConfig>('/api/admin/config')
  }

  validateConfig(payload: AdminConfig) {
    return this.request<ConfigValidation>('/api/admin/config/validate', {
      method: 'POST',
      payload,
    })
  }

  saveConfig(payload: AdminConfig) {
    return this.request('/api/admin/config', {
      method: 'POST',
      payload,
    })
  }

  getAdminRooms() {
    return this.request<AdminRoomItem[]>('/api/admin/rooms')
  }

  updateRoomConfig(roomId: number, payload: Partial<Pick<AdminConfig, 'max_players' | 'entry_fee' | 'prize_pool_pct' | 'boost_enabled' | 'boost_cost' | 'boost_multiplier'>>) {
    return this.request<RoomListItem>(`/api/admin/rooms/${roomId}/config`, {
      method: 'PUT',
      payload,
    })
  }
}
