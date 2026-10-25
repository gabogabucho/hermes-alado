// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
//
// Thin client over the server-side hosted-room engine (`groups.*` JSON-RPC on
// /api/ws, `tui_gateway/methods_groups.py`), mirroring the desktop's canonical
// client (`apps/desktop/src/plugins/hermes-bots/canonical-groups.ts`). No React:
// features/groups/* build the stores and screens on top of this.
import { request } from './connection'
import type {
  GroupsApproveResult,
  GroupsCapabilitiesResult,
  GroupsCreateResult,
  GroupsDisbandResult,
  GroupsLogResult,
  GroupsRenameResult,
  GroupsRetryResult,
  GroupsSendResult,
  GroupsStateResult,
  GroupsStopResult,
  Room,
} from './vendor/gateway-contract.generated'

export type {
  Room,
  RoomActor,
  RoomDriverStatus,
  RoomEvent,
  RoomMember,
  RoomMemberActivity,
} from './vendor/gateway-contract.generated'

/** Roster row as the New Group screen proposes it; `create` normalizes it into
 *  the exact shape `hosted_room_discussion.validate_roster` accepts. */
export interface GroupMemberInput {
  profile: string
  handle?: string
  displayName?: string
}

/** One `driver_status.pending_actions` row (`RoomDriverStatus`): `{kind: retry,
 *  task_id}` or the driver's approval action (`kind: approval` + run/session/
 *  approval context). The /api/ws surface has no `groups.discard`. */
export interface GroupPendingAction {
  kind: string
  member_id?: string
  task_id?: string
  execution_generation?: number
  request_id?: string
}

export type GroupApprovalChoice = 'once' | 'deny'

const LIST_PAGE_LIMIT = 100
const LOG_PAGE_LIMIT = 100

function uuid(): string {
  return crypto.randomUUID()
}

export class HostedGroupEngine {
  /** Probe the hosted-room protocol; `driver: true` means the server-side
   *  Discussion driver is live and `groups.create/send/…` will work. */
  capabilities(): Promise<GroupsCapabilitiesResult> {
    return request('groups.capabilities', {})
  }

  /** True when the process-owned hosted-room driver is running. */
  async driverAvailable(): Promise<boolean> {
    const capabilities = await this.capabilities()
    return capabilities.driver === true
  }

  /** All rooms hosted by this gateway, most recently changed first. */
  async list(): Promise<Room[]> {
    const rooms: Room[] = []
    let offset = 0
    for (;;) {
      const page = await request('groups.list', { limit: LIST_PAGE_LIMIT, offset })
      rooms.push(...page.rooms)
      if (page.next_offset === null || page.next_offset === undefined) break
      if (!Number.isSafeInteger(page.next_offset) || page.next_offset <= offset) {
        throw new Error('Cursor de paginación de grupos inválido')
      }
      offset = page.next_offset
    }
    return rooms
  }

  /** Create a hosted room idempotently; same member rules as the desktop's
   *  `createCanonicalGroup`: a name, two to six members with unique profiles
   *  and non-reserved handles (`@all`/`@everyone` are reserved). */
  create(name: string, members: GroupMemberInput[]): Promise<GroupsCreateResult> {
    const trimmed = (name ?? '').trim()
    if (!trimmed) throw new Error('El grupo necesita un nombre')
    if (members.length < 2 || members.length > 6) {
      throw new Error('Un grupo necesita entre dos y seis miembros')
    }

    const profiles = new Set<string>()
    const handles = new Set(['all', 'everyone'])

    const roster = members.map(member => {
      const profile = (member.profile ?? '').trim()
      const handle = (member.handle ?? profile).trim()
      if (!profile || !handle || profiles.has(profile.toLowerCase()) || handles.has(handle.toLowerCase())) {
        throw new Error('Los miembros necesitan perfiles únicos y handles no reservados')
      }
      profiles.add(profile.toLowerCase())
      handles.add(handle.toLowerCase())
      return {
        member_id: profile,
        profile,
        handle,
        target: { kind: 'local', profile },
        ...(member.displayName ? { display_name: member.displayName } : {}),
      }
    })

    return request('groups.create', { room_id: uuid(), name: trimmed, members: roster })
  }

  /** One room's replay cursor, fenced authority state and live driver status. */
  state(roomId: string): Promise<GroupsStateResult> {
    return request('groups.state', { room_id: roomId })
  }

  /** Monotonic room-log delta after `sinceSeq`. */
  log(roomId: string, sinceSeq = 0, limit = LOG_PAGE_LIMIT): Promise<GroupsLogResult> {
    return request('groups.log', { room_id: roomId, since_seq: sinceSeq, limit })
  }

  /** Send the user's message into the room. The driver accepts an inert
   *  `message.user` only: `{ text, thread_id }`, the actor is server-owned
   *  (`methods_groups.py:385`). `thread_id` defaults to the event id, exactly
   *  like the desktop's prepared submission (`canonical-group-send.ts`). */
  send(roomId: string, text: string): Promise<GroupsSendResult> {
    const eventId = uuid()
    return request('groups.send', {
      room_id: roomId,
      event_id: eventId,
      payload: { text, thread_id: eventId },
    })
  }

  /** Durably cancel queued or running work for one room. */
  stop(roomId: string): Promise<GroupsStopResult> {
    return request('groups.stop', { room_id: roomId, cancel_id: uuid() })
  }

  /** Resolve one exact pending approval. The canonical path only accepts
   *  `once`/`deny` (`session_group_controls.py:254-260`). */
  approve(roomId: string, action: GroupPendingAction, choice: GroupApprovalChoice): Promise<GroupsApproveResult> {
    if (action.kind !== 'approval') throw new Error('La acción pendiente no es una aprobación')
    if (!action.member_id || !action.task_id ||
      !Number.isSafeInteger(action.execution_generation) || (action.execution_generation ?? 0) < 1) {
      throw new Error('Acción de aprobación inválida')
    }
    if (!action.request_id) throw new Error('La aprobación requiere su request_id exacto')

    return request('groups.approve', {
      room_id: roomId,
      member_id: action.member_id,
      task_id: action.task_id,
      execution_generation: action.execution_generation ?? 0,
      choice,
      request_id: action.request_id,
    })
  }

  /** Retry one indeterminate room task after explicit user confirmation. The
   *  /api/ws contract needs only `{room_id, task_id}` (`methods_groups.py:448`). */
  retry(roomId: string, taskId: string): Promise<GroupsRetryResult> {
    if (!taskId) throw new Error('El reintento requiere el task_id')
    return request('groups.retry', { room_id: roomId, task_id: taskId })
  }

  /** Rename one hosted room atomically with its replay event. */
  rename(roomId: string, name: string): Promise<GroupsRenameResult> {
    const trimmed = (name ?? '').trim()
    if (!trimmed) throw new Error('El grupo necesita un nombre')
    return request('groups.rename', { room_id: roomId, event_id: uuid(), name: trimmed })
  }

  /** Permanently tombstone a hosted room id. */
  disband(roomId: string): Promise<GroupsDisbandResult> {
    return request('groups.disband', { room_id: roomId, cancel_id: uuid() })
  }
}

export const groupEngine = new HostedGroupEngine()
