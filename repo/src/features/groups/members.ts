// Portions adapted from NousResearch/hermes-agent (MIT License, Copyright (c) 2025 Nous Research).
//
// Shared roster helpers for the group screens, mirroring the desktop's
// canonical-room rendering (`canonical-group-activity.tsx`,
// `canonical-group-history.tsx`).
import type { RoomDriverStatus, RoomMember } from '../../lib/hermes/groups'
import { botDisplayName, homeProfiles } from '../home/store'

export type MemberPhase = 'queued' | 'working'

/** The label a room log/member row shows for one roster row. */
export function memberName(member: RoomMember | undefined): string {
  if (!member) return ''
  // Prefer the bot's CURRENT name (renames after the room was created must show up).
  const live = liveBotName(member.profile || member.member_id)
  return live || member.display_name || member.handle || member.member_id || ''
}

function liveBotName(profile: string | null | undefined): string {
  if (!profile) return ''
  const row = homeProfiles.get().find(p => p.name === profile)
  return row ? botDisplayName(row) : ''
}

/** The profile name an avatar resolves against (appearances are keyed by
 *  profile name, not handle). */
export function memberProfile(member: RoomMember): string {
  return member.profile || member.member_id || ''
}

/** One phase per member: a running (or stopping) task outranks one still
 *  queued behind it. Same semantics as `canonicalMemberPhases`. */
export function memberPhases(driver: RoomDriverStatus | null): Map<string, MemberPhase> {
  const phases = new Map<string, MemberPhase>()
  for (const { member_id, status } of driver?.member_activity ?? []) {
    if (status !== 'queued') {
      phases.set(member_id, 'working')
    } else if (!phases.has(member_id)) {
      phases.set(member_id, 'queued')
    }
  }
  return phases
}

export function rosterById(members: RoomMember[]): Map<string, RoomMember> {
  return new Map(members.filter(m => m.member_id).map(m => [m.member_id as string, m]))
}
