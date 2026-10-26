import { describe, expect, it } from 'vitest'
import { buildChatTimeline, parseChatExport } from './parseChatExport'

const SAMPLE = `24/02/2016, 12:43 pm - hesham: Hi
24/02/2016, 7:22 pm - Mohamed: Hi Back
25/02/2016, 1:33 am - hesham: Are you comming
25/02/2016, 1:34 am - Mohamed: yes
25/02/2016, 1:34 am - hesham: Oki`

describe('parseChatExport', () => {
  it('parses WhatsApp-style lines with Arabic text', () => {
    const { messages, unparsedLineCount } = parseChatExport(SAMPLE)
    expect(unparsedLineCount).toBe(0)
    expect(messages).toHaveLength(5)
    expect(messages[0].sender).toBe('hesham')
    expect(messages[0].body).toBe('HI')
    expect(messages[1].sender).toBe('Mohamed')
    expect(messages[1].body).toBe('Hi Back')
    expect(messages[4].body).toBe('Oki')
  })

  it('merges continuation lines into the previous message', () => {
    const raw = `24/02/2016, 12:43 pm - hesham: line one
second line`
    const { messages } = parseChatExport(raw)
    expect(messages).toHaveLength(1)
    expect(messages[0].body).toBe('line one\nsecond line')
  })

  it('normalizes narrow no-break space before am/pm', () => {
    const raw = '24/02/2016, 12:43\u202fpm - hesham: hi'
    const { messages } = parseChatExport(raw)
    expect(messages).toHaveLength(1)
    expect(messages[0].body).toBe('hi')
  })

  it('builds year/month timeline from messages', () => {
    const { messages } = parseChatExport(SAMPLE)
    const timeline = buildChatTimeline(messages)
    expect(timeline).toHaveLength(1)
    expect(timeline[0].year).toBe(2016)
    expect(timeline[0].months.map((m) => m.key)).toEqual(['2016-02'])
    expect(timeline[0].months[0].label.length).toBeGreaterThan(0)
  })
})
