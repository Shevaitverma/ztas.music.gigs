'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers'
import { authApi } from '@/lib/api'
import toast from 'react-hot-toast'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws/bids'

type MessageType =
  | 'BID_PLACED'
  | 'BID_UPDATED'
  | 'BID_STATUS_UPDATED'
  | 'NEW_LOWER_BID'
  | 'BID_ACCEPTED'
  | 'BID_REJECTED'
  | 'JOINED'
  | 'LEFT'
  | 'PONG'

interface WSMessage {
  type: MessageType
  data?: any
  room?: string
}

interface UseBidsSocketOptions {
  gigId?: string
  asArtist?: boolean
  onBidPlaced?: (bid: any) => void
  onBidUpdated?: (bid: any) => void
  onOutbid?: (data: { gigId: string; lowestAmount: number }) => void
  onBidAccepted?: (bid: any) => void
  onBidRejected?: (bid: any) => void
}

// Singleton WebSocket manager to prevent multiple connections
let globalWs: WebSocket | null = null
let globalWsListeners: Set<(message: WSMessage) => void> = new Set()
let globalWsReconnectTimeout: NodeJS.Timeout | null = null
let globalWsConnecting = false

// Exponential-backoff state. Reset to 0 on successful onopen; capped at 10
// attempts to avoid hammering a permanently-down backend.
let globalWsReconnectAttempts = 0
const WS_RECONNECT_MAX_ATTEMPTS = 10
const WS_RECONNECT_BASE_MS = 1000
const WS_RECONNECT_CAP_MS = 30000

function nextReconnectDelay(attempt: number): number {
  // Exponential growth (1s, 2s, 4s, ...) capped at 30s, with +/-20% jitter.
  const exp = Math.min(WS_RECONNECT_CAP_MS, WS_RECONNECT_BASE_MS * 2 ** attempt)
  const jitter = exp * 0.2 * (Math.random() * 2 - 1)
  return Math.max(WS_RECONNECT_BASE_MS, Math.round(exp + jitter))
}

// Per-room refcounts so multiple components mounting useBidsSocket for the
// same gigId/userId share the join and only LEAVE on last unmount.
// Each entry stores the desired join state so we can re-issue JOIN_* messages
// after a reconnect without each hook needing to re-mount.
interface RoomRef {
  count: number
  joinType: 'JOIN_GIG' | 'JOIN_GIG_AS_ARTIST' | 'JOIN_USER'
  leaveType: 'LEAVE_GIG' | 'LEAVE_USER' | null
  payload: Record<string, unknown>
}
const globalRooms: Map<string, RoomRef> = new Map()

/**
 * Fetch a fresh, short-lived ws-ticket from the API. The httpOnly auth cookie
 * is sent automatically. Returns null on 401 (user not logged in) or any
 * other failure so callers can skip connecting cleanly.
 */
async function fetchWsTicket(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  try {
    const { ticket } = await authApi.getWsTicket()
    if (!ticket || typeof ticket !== 'string') return null
    return ticket
  } catch {
    // 401 → user not authenticated yet; any other error → skip this attempt.
    return null
  }
}

function getOrCreateWebSocket(): WebSocket | null {
  if (globalWs?.readyState === WebSocket.OPEN) {
    return globalWs
  }

  if (globalWsConnecting) {
    return null
  }

  if (globalWs?.readyState === WebSocket.CONNECTING) {
    return globalWs
  }

  // Browsers cannot attach httpOnly cookies (or auth headers) to a WebSocket
  // handshake, so we mint a short-lived ticket via /auth/ws-ticket (cookies
  // travel with that fetch) and pass it as ?ticket=. The ticket expires in
  // ~30s, so every reconnect attempt fetches a brand-new one.
  globalWsConnecting = true

  void (async () => {
    const ticket = await fetchWsTicket()
    if (!ticket) {
      // No ticket → user is logged out or backend unavailable. Bail; the
      // hook will retry on next mount/visibility-change/login.
      globalWsConnecting = false
      return
    }

    // Re-check in case state changed while we awaited.
    if (globalWs?.readyState === WebSocket.OPEN || globalWs?.readyState === WebSocket.CONNECTING) {
      globalWsConnecting = false
      return
    }

    const url = `${WS_URL}${WS_URL.includes('?') ? '&' : '?'}ticket=${encodeURIComponent(ticket)}`
    const ws = new WebSocket(url)
    globalWs = ws

    ws.onopen = () => {
      console.log('[WS] Connected')
      globalWsConnecting = false
      // Reset backoff once we're cleanly connected.
      globalWsReconnectAttempts = 0
      if (globalWsReconnectTimeout) {
        clearTimeout(globalWsReconnectTimeout)
        globalWsReconnectTimeout = null
      }
      // Re-issue JOIN for every room still desired by mounted hooks. Server
      // tracks join state per-connection, so reconnects must replay joins.
      globalRooms.forEach((ref) => {
        if (ref.count > 0) {
          ws.send(JSON.stringify({ type: ref.joinType, payload: ref.payload }))
        }
      })
    }

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data)
        globalWsListeners.forEach((listener) => listener(message))
      } catch (e) {
        console.error('[WS] Failed to parse message:', e)
      }
    }

    ws.onclose = () => {
      console.log('[WS] Disconnected')
      globalWsConnecting = false
      globalWs = null
      // NOTE: do NOT clear globalRooms — the refcounts represent intent from
      // still-mounted hooks. onopen replays JOIN for every desired room.

      // Only reconnect if there are active listeners and the page is visible.
      // We can't synchronously check auth state here (would require an async
      // ws-ticket fetch), so we delegate that to getOrCreateWebSocket — if
      // the ticket fetch returns 401, it will simply skip the reconnect.
      if (
        globalWsListeners.size > 0 &&
        document.visibilityState === 'visible' &&
        globalWsReconnectAttempts < WS_RECONNECT_MAX_ATTEMPTS
      ) {
        if (globalWsReconnectTimeout) {
          clearTimeout(globalWsReconnectTimeout)
        }
        const delay = nextReconnectDelay(globalWsReconnectAttempts)
        globalWsReconnectAttempts += 1
        console.log(
          `[WS] Reconnect attempt ${globalWsReconnectAttempts}/${WS_RECONNECT_MAX_ATTEMPTS} in ${delay}ms`
        )
        globalWsReconnectTimeout = setTimeout(() => {
          globalWsReconnectTimeout = null
          getOrCreateWebSocket()
        }, delay)
      } else if (globalWsReconnectAttempts >= WS_RECONNECT_MAX_ATTEMPTS) {
        console.warn('[WS] Reconnect attempts exhausted; giving up.')
      }
    }

    ws.onerror = () => {
      globalWsConnecting = false
    }
  })().catch((e) => {
    globalWsConnecting = false
    console.error('[WS] Connection error:', e)
  })

  // We can't synchronously return the socket because we needed to await the
  // ticket fetch. Callers that need the socket should re-check `globalWs`
  // (and the `isConnected` state in the hook below already handles this).
  return globalWs
}

function sendMessage(type: string, payload?: any) {
  if (globalWs?.readyState === WebSocket.OPEN) {
    globalWs.send(JSON.stringify({ type, payload }))
  }
}

export function useBidsSocket(options: UseBidsSocketOptions = {}) {
  const { gigId, asArtist = false } = options
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // Store callbacks in refs to avoid dependency issues
  const callbacksRef = useRef(options)
  callbacksRef.current = options

  const [isConnected, setIsConnected] = useState(false)
  const joinedRoomsRef = useRef<Set<string>>(new Set())

  const handleMessage = useCallback((message: WSMessage) => {
    const { onBidPlaced, onBidUpdated, onOutbid, onBidAccepted, onBidRejected } = callbacksRef.current

    switch (message.type) {
      case 'BID_PLACED':
        if (message.data?.gigId) {
          queryClient.invalidateQueries({ queryKey: ['bids', 'gig', message.data.gigId] })
          queryClient.invalidateQueries({ queryKey: ['gig', message.data.gigId] })
        }
        onBidPlaced?.(message.data)
        break

      case 'BID_UPDATED':
        if (message.data?.gigId) {
          queryClient.invalidateQueries({ queryKey: ['bids', 'gig', message.data.gigId] })
        }
        onBidUpdated?.(message.data)
        break

      case 'NEW_LOWER_BID':
        queryClient.invalidateQueries({ queryKey: ['bids', 'my'] })
        queryClient.invalidateQueries({ queryKey: ['bidStatus'] })
        if (message.data) {
          toast('You have been outbid! Update your bid to stay competitive.', {
            icon: '⚠️',
            duration: 5000,
          })
          onOutbid?.(message.data)
        }
        break

      case 'BID_ACCEPTED':
        queryClient.invalidateQueries({ queryKey: ['bids', 'my'] })
        toast.success('Congratulations! Your bid was accepted!')
        onBidAccepted?.(message.data)
        break

      case 'BID_REJECTED':
        queryClient.invalidateQueries({ queryKey: ['bids', 'my'] })
        toast('Your bid was not selected for this gig.', { icon: '😔' })
        onBidRejected?.(message.data)
        break

      case 'BID_STATUS_UPDATED':
        if (message.data?.gigId) {
          queryClient.invalidateQueries({ queryKey: ['bids', 'gig', message.data.gigId] })
          queryClient.invalidateQueries({ queryKey: ['gig', message.data.gigId] })
        }
        break

      case 'JOINED':
        setIsConnected(true)
        break

      case 'PONG':
        break
    }
  }, [queryClient])

  // Register/unregister message listener
  useEffect(() => {
    globalWsListeners.add(handleMessage)
    getOrCreateWebSocket()

    // Check connection status
    const checkConnection = () => {
      setIsConnected(globalWs?.readyState === WebSocket.OPEN)
    }
    const interval = setInterval(checkConnection, 1000)

    return () => {
      globalWsListeners.delete(handleMessage)
      clearInterval(interval)

      // If no more listeners, close the connection
      if (globalWsListeners.size === 0) {
        // Clear any pending reconnect timer so we don't fire a zombie
        // reconnect after the user logs out / unmounts everything.
        if (globalWsReconnectTimeout) {
          clearTimeout(globalWsReconnectTimeout)
          globalWsReconnectTimeout = null
        }
        globalWsReconnectAttempts = 0
        globalRooms.clear()
        globalWs?.close()
        globalWs = null
      }
    }
  }, [handleMessage])

  // Join rooms when connected — refcounted across hook instances so multiple
  // components subscribed to the same gig/user only emit JOIN once and only
  // emit LEAVE on the last unmount.
  useEffect(() => {
    if (!isConnected) return

    const acquired: Array<{ roomKey: string }> = []

    const acquire = (
      joinType: 'JOIN_GIG' | 'JOIN_GIG_AS_ARTIST' | 'JOIN_USER',
      leaveType: 'LEAVE_GIG' | 'LEAVE_USER' | null,
      payload: Record<string, unknown>,
      roomKey: string
    ) => {
      // Per-hook guard: don't double-acquire if effect re-runs without dep change
      if (joinedRoomsRef.current.has(roomKey)) return
      const existing = globalRooms.get(roomKey)
      if (existing) {
        existing.count += 1
      } else {
        globalRooms.set(roomKey, { count: 1, joinType, leaveType, payload })
        sendMessage(joinType, payload)
      }
      joinedRoomsRef.current.add(roomKey)
      acquired.push({ roomKey })
    }

    if (gigId) {
      const joinType: 'JOIN_GIG_AS_ARTIST' | 'JOIN_GIG' = asArtist
        ? 'JOIN_GIG_AS_ARTIST'
        : 'JOIN_GIG'
      acquire(joinType, 'LEAVE_GIG', { gigId }, `${joinType}:${gigId}`)
    }

    if (user?.id) {
      // TODO(server): derive userId from authenticated session, drop from payload
      acquire('JOIN_USER', null, { userId: user.id }, `JOIN_USER:${user.id}`)
    }

    return () => {
      // Release each refcount this hook acquired; only emit LEAVE on the
      // last release so we don't detach OTHER mounted listeners.
      acquired.forEach(({ roomKey }) => {
        joinedRoomsRef.current.delete(roomKey)
        const ref = globalRooms.get(roomKey)
        if (!ref) return
        ref.count -= 1
        if (ref.count <= 0) {
          globalRooms.delete(roomKey)
          if (ref.leaveType) {
            sendMessage(ref.leaveType, ref.payload)
          }
        }
      })
    }
  }, [isConnected, gigId, asArtist, user?.id])

  // Handle visibility change - reconnect when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Re-establish connection if needed
        if (globalWs?.readyState !== WebSocket.OPEN && globalWsListeners.size > 0) {
          getOrCreateWebSocket()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // Heartbeat
  useEffect(() => {
    if (!isConnected) return

    const interval = setInterval(() => {
      sendMessage('PING')
    }, 30000)

    return () => clearInterval(interval)
  }, [isConnected])

  const send = useCallback((type: string, payload?: any) => {
    sendMessage(type, payload)
  }, [])

  return {
    isConnected,
    send,
  }
}
