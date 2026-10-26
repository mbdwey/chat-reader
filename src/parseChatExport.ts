export type ChatMessage = {
  id: string
  timestamp: Date
  sender: string
  body: string
  isSystem?: boolean
}

export type ParseResult = {
  messages: ChatMessage[]
  unparsedLineCount: number
}

const MESSAGE_LINE =
  /^(\d{1,2}\/\d{1,2}\/\d{4}),\s*(\d{1,2}:\d{2}\s*[ap]m)\s*-\s([^:]+):\s(.*)$/i

const SYSTEM_LINE =
  /^(\d{1,2}\/\d{1,2}\/\d{4}),\s*(\d{1,2}:\d{2}\s*[ap]m)\s*-\s(.+)$/i

function normalizeRaw(text: string): string {
  return text.replace(/\u202f/g, ' ').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function parseTimestamp(datePart: string, timePart: string): Date {
  const [day, month, year] = datePart.split('/').map((n) => parseInt(n, 10))
  const match = timePart.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i)
  if (!match) {
    return new Date(year, month - 1, day)
  }
  let hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const meridiem = match[3].toLowerCase()
  if (meridiem === 'pm' && hours !== 12) hours += 12
  if (meridiem === 'am' && hours === 12) hours = 0
  return new Date(year, month - 1, day, hours, minutes)
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function formatDayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export { dayKey }

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export type TimelineYear = {
  year: number
  months: { key: string; label: string }[]
}

export function buildChatTimeline(messages: ChatMessage[]): TimelineYear[] {
  const byYear = new Map<number, Map<string, string>>()

  for (const m of messages) {
    const y = m.timestamp.getFullYear()
    const mk = monthKey(m.timestamp)
    if (!byYear.has(y)) byYear.set(y, new Map())
    const months = byYear.get(y)!
    if (!months.has(mk)) {
      months.set(
        mk,
        m.timestamp.toLocaleDateString(undefined, { month: 'long' }),
      )
    }
  }

  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, monthsMap]) => ({
      year,
      months: [...monthsMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, label]) => ({ key, label })),
    }))
}

export function parseChatExport(raw: string): ParseResult {
  const text = normalizeRaw(raw)
  const lines = text.split('\n')
  const messages: ChatMessage[] = []
  let unparsedLineCount = 0
  let id = 0

  for (const line of lines) {
    const trimmed = line.trimEnd()
    if (trimmed === '') continue

    const msgMatch = trimmed.match(MESSAGE_LINE)
    if (msgMatch) {
      const [, datePart, timePart, sender, body] = msgMatch
      messages.push({
        id: String(id++),
        timestamp: parseTimestamp(datePart, timePart),
        sender: sender.trim(),
        body,
      })
      continue
    }

    const sysMatch = trimmed.match(SYSTEM_LINE)
    if (sysMatch) {
      const [, datePart, timePart, rest] = sysMatch
      messages.push({
        id: String(id++),
        timestamp: parseTimestamp(datePart, timePart),
        sender: '',
        body: rest.trim(),
        isSystem: true,
      })
      continue
    }

    if (messages.length > 0) {
      const last = messages[messages.length - 1]
      last.body += (last.body ? '\n' : '') + trimmed
    } else {
      unparsedLineCount++
    }
  }

  return { messages, unparsedLineCount }
}

export function senderColor(sender: string, palette: string[]): string {
  if (!sender) return palette[0]
  let hash = 0
  for (let i = 0; i < sender.length; i++) {
    hash = (hash * 31 + sender.charCodeAt(i)) | 0
  }
  return palette[Math.abs(hash) % palette.length]
}
