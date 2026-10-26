import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildChatTimeline,
  dayKey,
  formatDayLabel,
  formatTime,
  monthKey,
  parseChatExport,
  senderColor,
  type ChatMessage,
  type TimelineYear,
} from './parseChatExport'
import * as storage from './storage'
import './App.css'

const INCOMING_NAME_COLORS = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#db2777',
  '#7c3aed',
  '#0891b2',
]

function participantsInOrder(messages: ChatMessage[]): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  for (const m of messages) {
    if (m.isSystem || !m.sender || seen.has(m.sender)) continue
    seen.add(m.sender)
    order.push(m.sender)
  }
  return order
}

function FileDropzone({
  onFile,
}: {
  onFile: (name: string, text: string) => void
}) {
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return
      file.text().then((text) => onFile(file.name, text))
    },
    [onFile],
  )

  return (
    <label
      className={`dropzone${dragOver ? ' dropzone--active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        handleFiles(e.dataTransfer.files)
      }}
    >
      <input
        type="file"
        accept=".txt,text/plain"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <span className="dropzone__title">Import chat export</span>
      <span className="dropzone__hint">
        Drop a WhatsApp <code>.txt</code> export here, or click to browse
      </span>
    </label>
  )
}

function TimelineNav({
  timeline,
  expandedYears,
  onToggleYear,
  activeMonth,
  onJumpToMonth,
}: {
  timeline: TimelineYear[]
  expandedYears: Set<number>
  onToggleYear: (year: number) => void
  activeMonth: string | null
  onJumpToMonth: (monthKey: string) => void
}) {
  if (timeline.length === 0) return null

  return (
    <nav className="timeline-nav" aria-label="Jump to month">
      <h2 className="timeline-nav__title">Timeline</h2>
      <ul className="timeline-nav__years">
        {timeline.map(({ year, months }) => {
          const open = expandedYears.has(year)
          return (
            <li key={year} className="timeline-nav__year">
              <button
                type="button"
                className={`timeline-nav__year-btn${open ? ' timeline-nav__year-btn--open' : ''}`}
                aria-expanded={open}
                onClick={() => onToggleYear(year)}
              >
                <span className="timeline-nav__chevron" aria-hidden />
                {year}
              </button>
              {open && (
                <ul className="timeline-nav__months">
                  {months.map(({ key, label }) => (
                    <li key={key}>
                      <button
                        type="button"
                        className={`timeline-nav__month-btn${activeMonth === key ? ' timeline-nav__month-btn--active' : ''}`}
                        onClick={() => onJumpToMonth(key)}
                      >
                        {label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function BookmarkPanel({
  messages,
  bookmarks,
  onJump,
  onRemove,
}: {
  messages: ChatMessage[]
  bookmarks: Set<string>
  onJump: (id: string) => void
  onRemove: (id: string) => void
}) {
  const items = useMemo(
    () => messages.filter((m) => bookmarks.has(m.id)),
    [messages, bookmarks],
  )

  return (
    <nav className="bookmark-panel" aria-label="Bookmarked messages">
      <h2 className="bookmark-panel__title">Bookmarks</h2>
      {items.length === 0 ? (
        <p className="bookmark-panel__hint">
          Double-click a message to bookmark it.
        </p>
      ) : (
        <ul className="bookmark-panel__list">
          {items.map((m) => (
            <li key={m.id} className="bookmark-panel__item">
              <button
                type="button"
                className="bookmark-panel__jump"
                onClick={() => onJump(m.id)}
              >
                <span className="bookmark-panel__sender">{m.sender}</span>
                <span className="bookmark-panel__snippet">{m.body}</span>
                <time className="bookmark-panel__time">
                  {formatTime(m.timestamp)}
                </time>
              </button>
              <button
                type="button"
                className="bookmark-panel__remove"
                aria-label="Remove bookmark"
                onClick={() => onRemove(m.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}

function MessageRow({
  msg,
  isOutgoing,
  showNameInBubble,
  bookmarked,
  onToggleBookmark,
}: {
  msg: ChatMessage
  isOutgoing: boolean
  showNameInBubble: boolean
  bookmarked: boolean
  onToggleBookmark: (id: string) => void
}) {
  if (msg.isSystem) {
    return (
      <div className="message message--system">
        <span>{msg.body}</span>
      </div>
    )
  }

  const nameColor = senderColor(msg.sender, INCOMING_NAME_COLORS)

  return (
    <div
      id={`msg-${msg.id}`}
      className={`message${isOutgoing ? ' message--outgoing' : ' message--incoming'}${bookmarked ? ' message--bookmarked' : ''}`}
      onDoubleClick={() => onToggleBookmark(msg.id)}
    >
      <div className="message__bubble">
        {showNameInBubble && (
          <div className="message__name" style={{ color: nameColor }}>
            {msg.sender}
          </div>
        )}
        <p className="message__body" dir="auto">
          {msg.body}
        </p>
        <time className="message__time" dateTime={msg.timestamp.toISOString()}>
          {formatTime(msg.timestamp)}
        </time>
      </div>
    </div>
  )
}

function ChatView({
  messages,
  meSender,
  participants,
  scrollToMonth,
  onScrollToMonthDone,
  scrollToMessageId,
  onScrollToMessageDone,
  bookmarks,
  onToggleBookmark,
}: {
  messages: ChatMessage[]
  meSender: string
  participants: string[]
  scrollToMonth: string | null
  onScrollToMonthDone: () => void
  scrollToMessageId: string | null
  onScrollToMessageDone: () => void
  bookmarks: Set<string>
  onToggleBookmark: (id: string) => void
}) {
  const paneRef = useRef<HTMLDivElement>(null)
  const isGroup = participants.length > 2

  const rows = useMemo(() => {
    const out: {
      kind: 'day' | 'msg'
      key: string
      label?: string
      monthAnchor?: string
      msg?: ChatMessage
      showNameInBubble?: boolean
    }[] = []
    let lastDay = ''
    let lastSender = ''
    let lastMonth = ''

    for (const msg of messages) {
      const mk = monthKey(msg.timestamp)
      let anchor: string | undefined
      if (mk !== lastMonth) {
        anchor = mk
        lastMonth = mk
      }

      const dk = dayKey(msg.timestamp)
      if (dk !== lastDay) {
        out.push({
          kind: 'day',
          key: `day-${dk}`,
          label: formatDayLabel(msg.timestamp),
          monthAnchor: anchor,
        })
        lastDay = dk
        lastSender = ''
      }

      const senderChanged = !msg.isSystem && msg.sender !== lastSender
      const isOutgoing = !msg.isSystem && msg.sender === meSender
      const showNameInBubble =
        isGroup && !isOutgoing && !msg.isSystem && senderChanged

      out.push({
        kind: 'msg',
        key: msg.id,
        msg,
        showNameInBubble,
      })
      if (!msg.isSystem) lastSender = msg.sender
    }
    return out
  }, [messages, meSender, isGroup])

  useEffect(() => {
    if (!scrollToMonth || !paneRef.current) return
    const el = paneRef.current.querySelector<HTMLElement>(
      `#month-${CSS.escape(scrollToMonth)}`,
    )
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    onScrollToMonthDone()
  }, [scrollToMonth, messages, onScrollToMonthDone])

  useEffect(() => {
    if (!scrollToMessageId || !paneRef.current) return
    const el = paneRef.current.querySelector<HTMLElement>(
      `#msg-${CSS.escape(scrollToMessageId)}`,
    )
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    onScrollToMessageDone()
  }, [scrollToMessageId, messages, onScrollToMessageDone])

  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    storage.loadScroll().then((pos) => {
      if (pos) pane.scrollTop = pos
    })
    let timer: ReturnType<typeof setTimeout>
    const onScroll = () => {
      clearTimeout(timer)
      timer = setTimeout(() => storage.saveScroll(pane.scrollTop), 250)
    }
    pane.addEventListener('scroll', onScroll)
    return () => {
      clearTimeout(timer)
      pane.removeEventListener('scroll', onScroll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="chat-pane" ref={paneRef}>
      <div className="chat">
        {rows.map((row) =>
          row.kind === 'day' ? (
            <div
              key={row.key}
              id={row.monthAnchor ? `month-${row.monthAnchor}` : undefined}
              className="day-divider"
            >
              {row.label}
            </div>
          ) : (
            <MessageRow
              key={row.key}
              msg={row.msg!}
              isOutgoing={row.msg!.sender === meSender}
              showNameInBubble={row.showNameInBubble ?? false}
              bookmarked={bookmarks.has(row.msg!.id)}
              onToggleBookmark={onToggleBookmark}
            />
          ),
        )}
      </div>
    </div>
  )
}

function App() {
  const [fileName, setFileName] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [unparsed, setUnparsed] = useState(0)
  const [query, setQuery] = useState('')
  const [meSender, setMeSender] = useState<string>('')
  const [expandedYears, setExpandedYears] = useState<Set<number>>(
    () => new Set(),
  )
  const [scrollToMonth, setScrollToMonth] = useState<string | null>(null)
  const [activeMonth, setActiveMonth] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => new Set())
  const [scrollToMessage, setScrollToMessage] = useState<string | null>(null)

  const participants = useMemo(
    () => (messages ? participantsInOrder(messages) : []),
    [messages],
  )

  const timeline = useMemo(
    () => (messages ? buildChatTimeline(messages) : []),
    [messages],
  )

  const onFile = useCallback((name: string, text: string, persist = true) => {
    const result = parseChatExport(text)
    const people = participantsInOrder(result.messages)
    const tl = buildChatTimeline(result.messages)
    const latestYear = tl.length > 0 ? tl[tl.length - 1].year : null
    setFileName(name)
    setMessages(result.messages)
    setUnparsed(result.unparsedLineCount)
    setQuery('')
    setMeSender(people[0] ?? '')
    setExpandedYears(latestYear != null ? new Set([latestYear]) : new Set())
    setScrollToMonth(null)
    setActiveMonth(null)
    if (persist) {
      setBookmarks(new Set())
      storage.saveFile({ name, text })
      storage.saveScroll(0)
      storage.saveBookmarks([])
    }
  }, [])

  useEffect(() => {
    Promise.all([storage.loadFile(), storage.loadBookmarks()]).then(
      ([saved, ids]) => {
        if (saved) onFile(saved.name, saved.text, false)
        if (ids) setBookmarks(new Set(ids))
        setReady(true)
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    if (!messages) return null
    const q = query.trim().toLowerCase()
    if (!q) return messages
    return messages.filter(
      (m) =>
        m.body.toLowerCase().includes(q) ||
        m.sender.toLowerCase().includes(q),
    )
  }, [messages, query])

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }

  const jumpToMonth = (key: string) => {
    const year = parseInt(key.split('-')[0], 10)
    setExpandedYears((prev) => new Set(prev).add(year))
    setQuery('')
    setActiveMonth(key)
    setScrollToMonth(key)
  }

  const onScrollToMonthDone = useCallback(() => {
    setScrollToMonth(null)
  }, [])

  const toggleBookmark = useCallback((id: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      storage.saveBookmarks([...next])
      return next
    })
  }, [])

  const jumpToBookmark = (id: string) => {
    setQuery('')
    setScrollToMessage(id)
  }

  const onScrollToMessageDone = useCallback(() => {
    setScrollToMessage(null)
  }, [])

  const swapSides = () => {
    if (participants.length !== 2) return
    const other = participants.find((p) => p !== meSender)
    if (other) setMeSender(other)
  }

  const reset = () => {
    setFileName(null)
    setMessages(null)
    setUnparsed(0)
    setQuery('')
    setMeSender('')
    setExpandedYears(new Set())
    setScrollToMonth(null)
    setActiveMonth(null)
    setBookmarks(new Set())
    storage.clearFile()
    storage.saveScroll(0)
    storage.saveBookmarks([])
  }

  if (!ready) return <div className="app" />

  return (
    <div className="app">
      <header className="header">
        <h1>Chat Reader</h1>
        <p className="header__sub">
          Turn WhatsApp text exports into an easy-to-read conversation
        </p>
      </header>

      {!messages ? (
        <FileDropzone onFile={onFile} />
      ) : (
        <div className="app-shell">
          <TimelineNav
            timeline={timeline}
            expandedYears={expandedYears}
            onToggleYear={toggleYear}
            activeMonth={activeMonth}
            onJumpToMonth={jumpToMonth}
          />
          <div className="app-main">
            <div className="toolbar">
              <div className="toolbar__meta">
                <strong>{fileName}</strong>
                <span>
                  {messages.length} messages
                  {unparsed > 0 &&
                    ` · ${unparsed} unparsed line(s) at start`}
                </span>
              </div>
              {participants.length > 0 && (
                <div className="toolbar__identity">
                  <label className="toolbar__label">
                    You are
                    <select
                      className="toolbar__select"
                      value={meSender}
                      onChange={(e) => setMeSender(e.target.value)}
                    >
                      {participants.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                  {participants.length === 2 && (
                    <button
                      type="button"
                      className="toolbar__swap"
                      onClick={swapSides}
                      title="Flip which side each person appears on"
                    >
                      Swap sides
                    </button>
                  )}
                </div>
              )}
              <input
                type="search"
                className="toolbar__search"
                placeholder="Search messages or senders…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="button" className="toolbar__reset" onClick={reset}>
                Import another
              </button>
            </div>
            <p className="legend">
              <span className="legend__incoming">Their messages</span>
              <span className="legend__outgoing">Your messages</span>
            </p>
            {filtered && filtered.length > 0 && meSender ? (
              <ChatView
                messages={filtered}
                meSender={meSender}
                participants={participants}
                scrollToMonth={scrollToMonth}
                onScrollToMonthDone={onScrollToMonthDone}
                scrollToMessageId={scrollToMessage}
                onScrollToMessageDone={onScrollToMessageDone}
                bookmarks={bookmarks}
                onToggleBookmark={toggleBookmark}
              />
            ) : (
              <p className="empty-search">No messages match your search.</p>
            )}
          </div>
          <BookmarkPanel
            messages={messages}
            bookmarks={bookmarks}
            onJump={jumpToBookmark}
            onRemove={toggleBookmark}
          />
        </div>
      )}
    </div>
  )
}

export default App
