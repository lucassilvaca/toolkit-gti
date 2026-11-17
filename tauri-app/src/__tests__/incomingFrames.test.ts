import { describe, it, expect } from 'vitest'
import { parseIncoming } from '../features/chat/services/incomingFrames'
import { applyReceipt, setMessageStatus } from '../features/chat/utils/messageStatus'
import type { WsChatMessage } from '../shared/types/chat'

const parse = (obj: unknown) => parseIncoming(JSON.stringify(obj))

describe('parseIncoming', () => {
  it('returns null for invalid JSON and non-objects', () => {
    expect(parseIncoming('{nope')).toBeNull()
    expect(parseIncoming('null')).toBeNull()
    expect(parseIncoming('42')).toBeNull()
  })

  it('parses client_identity trimming the display name', () => {
    expect(parse({ msg_type: 'client_identity', role: 'user', display_name: '  joao  ' })).toEqual({
      kind: 'identity', msgId: null, role: 'user', displayName: 'joao',
    })
  })

  it('parses presence and nulls unknown presence values', () => {
    expect(parse({ msg_type: 'presence', role: 'tech', presence: 'away' })).toMatchObject({
      kind: 'presence', role: 'tech', presence: 'away',
    })
    expect(parse({ msg_type: 'presence', role: 'tech', presence: 'zzz' })).toMatchObject({
      kind: 'presence', presence: null,
    })
  })

  it('parses session_end and typing', () => {
    expect(parse({ msg_type: 'session_end', role: 'user' })).toMatchObject({ kind: 'session_end', role: 'user' })
    expect(parse({ msg_type: 'typing', role: 'user', state: 'start' })).toMatchObject({ kind: 'typing', isStart: true })
    expect(parse({ msg_type: 'typing', role: 'user', state: 'stop' })).toMatchObject({ kind: 'typing', isStart: false })
  })

  it('parses receipts from msg_ids or msg_id; invalid ones become unknown', () => {
    expect(parse({ msg_type: 'receipt', state: 'read', msg_ids: ['a', 1, 'b'] })).toMatchObject({
      kind: 'receipt', state: 'read', ids: ['a', 'b'],
    })
    expect(parse({ msg_type: 'receipt', state: 'delivered', msg_id: 'x' })).toMatchObject({
      kind: 'receipt', msgId: 'x', ids: ['x'],
    })
    expect(parse({ msg_type: 'receipt', state: 'bogus', msg_id: 'x' })).toMatchObject({ kind: 'unknown', msgId: 'x' })
    expect(parse({ msg_type: 'receipt', state: 'read', msg_ids: [] })).toMatchObject({ kind: 'unknown' })
  })

  it('parses text and file with defaults', () => {
    const text = parse({ msg_type: 'text', content: 'oi', timestamp: 5, msg_id: 'm1' })
    expect(text).toMatchObject({ kind: 'text', msgId: 'm1', content: 'oi', timestamp: 5 })
    expect(parse({ msg_type: 'text' })).toMatchObject({ kind: 'text', content: '', timestamp: 0, msgId: null })
    expect(parse({ msg_type: 'file', filename: 'a.pdf', mime_type: 'application/pdf', file_data: 'b64', timestamp: 7 }))
      .toMatchObject({ kind: 'file', filename: 'a.pdf', mime_type: 'application/pdf', file_data: 'b64', timestamp: 7 })
  })

  it('keeps the raw frame for echo detection', () => {
    const raw = { sender: 'me', msg_type: 'text', content: 'eco', timestamp: 1 }
    const frame = parse(raw)
    expect(frame?.kind === 'text' && frame.raw).toEqual(raw)
  })

  it('maps unknown msg_type to unknown, keeping msgId', () => {
    expect(parse({ msg_type: 'weird', msg_id: 'q' })).toEqual({ kind: 'unknown', msgId: 'q' })
  })
})

describe('messageStatus', () => {
  const mine = (id: string, status?: WsChatMessage['status']): WsChatMessage =>
    ({ id, sender: 'me', type: 'text', content: '', timestamp: 0, status })
  const theirs: WsChatMessage = { id: 'r', sender: 'remote', type: 'text', content: '', timestamp: 0 }

  it('setMessageStatus respects the onlyFrom guard', () => {
    const list = [mine('a', 'sending'), mine('b', 'delivered')]
    expect(setMessageStatus(list, 'a', 'sent', 'sending')[0].status).toBe('sent')
    expect(setMessageStatus(list, 'b', 'sent', 'sending')[1]).toBe(list[1])
    expect(setMessageStatus(list, 'b', 'sending')[1].status).toBe('sending')
  })

  it('applyReceipt never regresses and ignores remote messages', () => {
    const list = [mine('a'), mine('b', 'read'), theirs]
    const next = applyReceipt(list, ['a', 'b', 'r'], 'delivered')
    expect(next[0].status).toBe('delivered')
    expect(next[1]).toBe(list[1])
    expect(next[2]).toBe(theirs)
  })
})
