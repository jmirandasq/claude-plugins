import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren, SessionRateLimit } from 'claude-code'

import type { Limit } from '../types'

const limits = atom({ plugin: 'usage-meter', key: 'limits' } as const, [] as Limit[])
const view = atom({ plugin: 'usage-meter', key: 'view' } as const, 0)

const WINDOWS = ['five_hour', 'seven_day']
const LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'week' }
const ROTATE_MS = 8000
const CELLS = 10
const NARROW = 80
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

/** Where the meter goes: the band above the prompt, the footer's right side, or the hint line's end. */
type Position = 'above' | 'footer' | 'hint'
const POSITIONS: readonly string[] = ['above', 'footer', 'hint']

/** The window on show, ready to draw. */
type Meter = { label: string; percent: number; resetsIn?: string }

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
    resetsIn: resetsIn !== undefined && !hasReset ? until(resetsIn) : undefined
  }
}

/** A narrow screen gets a shorter bar. */
const cellsFor = (columns: number | undefined) => (columns !== undefined && columns < NARROW ? CELLS / 2 : CELLS)

type Ui = ReturnType<EngineInterface['ui']['resolve']>

/**
 * The meter as blocks that never break inside, the bar and the time until it resets: on a narrow screen
 * a whole block moves to the next line. `lead` puts a separator before the bar, for blocks that follow something else.
 */
function blocksOf (meter: Meter, accent: string, cells: number, lead: boolean, { Box, Text }: Ui) {
  const filled = Math.round((Math.min(Math.max(meter.percent, 0), 100) / 100) * cells)
  return [
    <Box key="meter" flexDirection="row" flexShrink={0}>
      {lead ? <Text dimColor> · </Text> : null}
      <Text dimColor>{meter.label} </Text>
      <Text color={colorFor(meter.percent, accent)}>{'━'.repeat(filled)}</Text>
      <Text dimColor>{'─'.repeat(cells - filled)}</Text>
      <Text> {Math.round(meter.percent)}%</Text>
    </Box>,
    meter.resetsIn
      ? <Box key="resets" flexDirection="row" flexShrink={0}><Text dimColor> · {meter.resetsIn}</Text></Box>
      : null
  ].filter(block => block !== null)
}

/** What another plugin or the engine drew before, as blocks: a wrapping row's own children, so both wrap as one line. */
const blocksBefore = (node: RenderChildren): RenderChildren[] => {
  const row = node as { type?: string; props?: Record<string, unknown>; children?: RenderChildren }
  return row !== null && typeof row === 'object' && row.type === 'Box' && row.props?.flexWrap === 'wrap' && Array.isArray(row.children)
    ? row.children
    : [node]
}

/** One line that wraps by blocks. */
const rowOf = ({ Box }: Ui, children: RenderChildren[]) => <Box flexDirection="row" flexWrap="wrap">{children}</Box>

export const register: Register = (on, options) => {
  const hideCycleHint = options.hideCycleHint !== false
  const accent = ACCENTS[String(options.accentColor)] ?? DEFAULT_ACCENT
  const position = (POSITIONS.includes(String(options.position)) ? options.position : 'footer') as Position

  on('session.start', async ($, e, next) => {
    // 0.3.0 could pin the meter as a status line; an update leaves none behind.
    $.ui.status(undefined)

    const saved = await $.store.get('limits')
    if (Array.isArray(saved)) await update($, limits, () => saved as Limit[])

    const usage = await $.session.usage()
    await remember($, windowsOf(usage.rateLimits))

    $.clock.every(ROTATE_MS, () => { void update($, view, n => n + 1) })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await remember($, windowsOf(e.rateLimits))
    return next(e)
  })

  // The band above the prompt: the meter on one line, over whatever another plugin draws there.
  if (position === 'above') {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      const meter = await meterOf($)
      if (e.props.hasSurvey || meter === null) return next(e)

      const ui = $.ui.resolve(e)
      const row = rowOf(ui, blocksOf(meter, accent, cellsFor(e.viewport?.columns), false, ui))
      const below = await next(e)
      if (!hasText(below)) return row
      return <ui.Box flexDirection="column">{row}{below}</ui.Box>
    })
  }

  // Bottom right of the prompt footer: the engine's mode labels (and any other plugin's part), then the meter.
  if (position === 'footer') {
    on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
      const meter = await meterOf($)
      if (meter === null) return next(e)

      const ui = $.ui.resolve(e)
      const cells = cellsFor(e.viewport?.columns)
      const labels = await next(e)
      if (e.props.modes.length === 0 && !hasText(labels)) return rowOf(ui, blocksOf(meter, accent, cells, false, ui))
      return rowOf(ui, [...blocksBefore(labels), ...blocksOf(meter, accent, cells, true, ui)])
    })
  }

  // The hint line under the prompt: without "(shift+tab to cycle)", and in the hint position with the meter after it, in its colors.
  if (hideCycleHint || position === 'hint') {
    on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
      const meter = position === 'hint' && 'isDraft' in e.props ? await meterOf($) : null
      const hasHint = hideCycleHint && CYCLE_HINT.test(e.props.hint)
      if (!hasHint && meter === null) return next(e)

      // A rewritten hint drops the tail, so a tail another plugin added joins the hint itself.
      const { tail, ...rest } = e.props as typeof e.props & { tail?: string }
      const hint = [e.props.hint.replace(CYCLE_HINT, ' · '), tail]
        .join('·')
        .split('·')
        .map(part => part.trim())
        .filter(Boolean)
        .join(' · ')
      const line = await next(hasHint ? { ...e, props: { ...rest, hint } } : e)
      if (meter === null) return line

      const ui = $.ui.resolve(e)
      const cells = cellsFor(e.viewport?.columns)
      if (!hint && !hasText(line)) return rowOf(ui, blocksOf(meter, accent, cells, false, ui))
      return rowOf(ui, [...blocksBefore(line), ...blocksOf(meter, accent, cells, true, ui)])
    })
  }
}
