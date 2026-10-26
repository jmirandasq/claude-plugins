import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { Limit } from '../types'

const limits = atom({ plugin: 'usage-meter', key: 'limits' } as const, [] as Limit[])
const view = atom({ plugin: 'usage-meter', key: 'view' } as const, 0)

const WINDOWS = ['five_hour', 'seven_day']
const LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'week' }
const ROTATE_MS = 8000
const CELLS = 10
const CYCLE_HINT = /\s*\([^()]+ to cycle\)/

/** The subscription windows the meter shows, in order, from what the engine measured. */
const windowsOf = (rateLimits: readonly SessionRateLimit[]): Limit[] =>
  WINDOWS.flatMap(kind => {
    const found = rateLimits.find(limit => limit.kind === kind)
    return found ? [{ kind, percentUsed: found.percentUsed, resetsAt: found.resetsAt }] : []
  })

/** The accentColor choices: the brand green as is, the rest as theme keys so they follow the person's theme. */
const DEFAULT_ACCENT = '#00A859'
const ACCENTS: Record<string, string> = {
  green: DEFAULT_ACCENT,
  orange: 'claude',
  blue: 'suggestion',
  purple: 'autoAccept',
  teal: 'planMode'
}
const colorFor = (percent: number, accent: string) => (percent >= 90 ? 'error' : percent >= 75 ? 'warning' : accent)

/** "42m", "3h 5m", "2d 4h": how long until the window resets. */
function until (ms: number) {
  const minutes = Math.max(1, Math.round(ms / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** Keeps the latest reading for the meter, and for the next session until a response reports again. */
async function remember ($: EngineInterface, found: Limit[]) {
  if (found.length === 0) return
  await update($, limits, () => found)
  await $.store.set('limits', found)
}

/** Where the meter goes: the band above the prompt, the footer's right side, the hint line's end, or a pinned status line. */
type Position = 'above' | 'footer' | 'hint' | 'status'
const POSITIONS: readonly string[] = ['above', 'footer', 'hint', 'status']

/** The window on show, ready to draw. */
type Meter = { label: string; percent: number; filled: number; resetsIn?: string }

/** Whether a tree beneath draws any text of its own (a plugin's), as opposed to the engine's empty slot. */
const hasText = (node: unknown): boolean =>
  typeof node === 'string' ? node.trim() !== ''
    : Array.isArray(node) ? node.some(hasText)
      : typeof node === 'object' && node !== null && hasText((node as { children?: unknown }).children)

/** The window whose turn it is, with its fill and the time until it resets; null with no reading yet. */
async function meterOf ($: EngineInterface): Promise<Meter | null> {
  const all = await read($, limits)
  if (all.length === 0) return null

  const now = await $.clock.now()
  const shown = all[(await read($, view)) % all.length]
  if (shown === undefined) return null
  const resetsIn = shown.resetsAt === undefined ? undefined : Date.parse(shown.resetsAt) - now
  const hasReset = resetsIn !== undefined && resetsIn <= 0
  const percent = hasReset ? 0 : shown.percentUsed
  return {
    label: LABELS[shown.kind] ?? shown.kind,
    percent,
    filled: Math.round((Math.min(Math.max(percent, 0), 100) / 100) * CELLS),
    resetsIn: resetsIn !== undefined && !hasReset ? until(resetsIn) : undefined
  }
}

/** "5h ━━━━━━──── 58% · 2h 10m": the meter as plain text, for the hint and the status line. */
const lineOf = (meter: Meter) =>
  `${meter.label} ${'━'.repeat(meter.filled)}${'─'.repeat(CELLS - meter.filled)} ${Math.round(meter.percent)}%` +
  (meter.resetsIn ? ` · ${meter.resetsIn}` : '')

/** The meter as a styled row, for the band and the footer. */
function treeOf (meter: Meter, accent: string, { Box, Text }: ReturnType<EngineInterface['ui']['resolve']>) {
  return (
    <Box flexDirection="row">
      <Text dimColor>{meter.label} </Text>
      <Text color={colorFor(meter.percent, accent)}>{'━'.repeat(meter.filled)}</Text>
      <Text dimColor>{'─'.repeat(CELLS - meter.filled)}</Text>
      <Text> {Math.round(meter.percent)}%</Text>
      {meter.resetsIn ? <Text dimColor> · {meter.resetsIn}</Text> : null}
    </Box>
  )
}

// The status line is pinned, not drawn: it is set again whenever the meter changes.
let pinned: string | undefined

/** Pins the meter as the status line when that is the position, only when its text changed. */
async function pin ($: EngineInterface, position: Position) {
  const meter = position === 'status' ? await meterOf($) : null
  const text = meter ? lineOf(meter) : undefined
  if (text === pinned) return
  pinned = text
  $.ui.status(text)
}

export const register: Register = (on, options) => {
  const hideCycleHint = options.hideCycleHint !== false
  const accent = ACCENTS[String(options.accentColor)] ?? DEFAULT_ACCENT
  const position = (POSITIONS.includes(String(options.position)) ? options.position : 'footer') as Position

  on('session.start', async ($, e, next) => {
    // A reload with another position leaves no status line behind.
    if (position !== 'status') $.ui.status(undefined)

    const saved = await $.store.get('limits')
    if (Array.isArray(saved)) await update($, limits, () => saved as Limit[])

    const usage = await $.session.usage()
    await remember($, windowsOf(usage.rateLimits))
    await pin($, position)

    $.clock.every(ROTATE_MS, () => { void update($, view, n => n + 1).then(() => pin($, position)) })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await remember($, windowsOf(e.rateLimits))
    await pin($, position)
    return next(e)
  })

  // The band above the prompt: the meter on one line, over whatever another plugin draws there.
  if (position === 'above') {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      const meter = await meterOf($)
      if (e.props.hasSurvey || meter === null) return next(e)

      const tree = treeOf(meter, accent, $.ui.resolve(e))
      const below = await next(e)
      if (!hasText(below)) return tree
      const { Box } = $.ui.resolve(e)
      return <Box flexDirection="column">{tree}{below}</Box>
    })
  }

  // Bottom right of the prompt footer: the engine's mode labels (and any other plugin's part), then the meter.
  if (position === 'footer') {
    on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
      const meter = await meterOf($)
      if (meter === null) return next(e)

      const tree = treeOf(meter, accent, $.ui.resolve(e))
      const labels = await next(e)
      if (e.props.modes.length === 0 && !hasText(labels)) return tree
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="row">
          {labels}
          <Text dimColor> · </Text>
          {tree}
        </Box>
      )
    })
  }

  // The hint line under the prompt: without "(shift+tab to cycle)", and with the meter at its end in the hint position.
  if (hideCycleHint || position === 'hint') {
    on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
      const meter = position === 'hint' && 'isDraft' in e.props ? await meterOf($) : null
      const text = meter ? lineOf(meter) : ''
      const hasHint = hideCycleHint && CYCLE_HINT.test(e.props.hint)
      if (!hasHint && !text) return next(e)

      if (!hasHint) {
        const tail = 'tail' in e.props && e.props.tail ? `${e.props.tail} · ${text}` : text
        return next({ ...e, props: { ...e.props, tail } })
      }

      // A rewritten hint replaces the whole line, so what would go in the tail joins the hint itself.
      const { tail, ...rest } = e.props as typeof e.props & { tail?: string }
      const hint = [e.props.hint.replace(CYCLE_HINT, ' · '), tail, text]
        .join('·')
        .split('·')
        .map(part => part.trim())
        .filter(Boolean)
        .join(' · ')
      return next({ ...e, props: { ...rest, hint } })
    })
  }
}
