import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Info } from '../types'

const info = atom({ plugin: 'session-info', key: 'info' } as const, null as Info | null)

const REFRESH_MS = 5000

/** The accentColor choices: the brand green as is, the rest as theme keys so they follow the person's theme. */
const DEFAULT_ACCENT = '#00A859'
const ACCENTS: Record<string, string> = {
  green: DEFAULT_ACCENT,
  orange: 'claude',
  blue: 'suggestion',
  purple: 'autoAccept',
  teal: 'planMode'
}

const CELLS = 10
const NARROW = 80
const colorFor = (percent: number, accent: string) => (percent >= 90 ? 'error' : percent >= 75 ? 'warning' : accent)

/** "claude-plugins" from "/Users/me/work/claude-plugins". */
const projectOf = (path: string) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path

/** "claude-sonnet-5-5-20260101" as "sonnet-5-5": the family and version, without the vendor prefix or the date. */
const modelName = (model: string) => model.replace(/^claude-/, '').replace(/-\d{8}/, '')

/** Trimmed stdout of a git command, or '' when git fails (not a repository, no git). */
async function git ($: EngineInterface, args: string[], cwd: string) {
  try {
    const { exitCode, stdout } = await $.process.run(['git', ...args], { cwd, timeoutMs: 3000 })
    return exitCode === 0 ? stdout.trim() : ''
  } catch {
    return ''
  }
}

/** The branch name; "@abc1234" on a detached HEAD; '' outside a repository. */
async function branchOf ($: EngineInterface, cwd: string) {
  const name = await git($, ['branch', '--show-current'], cwd)
  if (name) return name
  const sha = await git($, ['rev-parse', '--short', 'HEAD'], cwd)
  return sha ? `@${sha}` : ''
}

/** Reads project, branch and model, and writes them only when they changed (a write redraws the footer). */
async function refresh ($: EngineInterface) {
  const cwd = await $.session.cwd()
  const root = await $.session.root()
  const model = await $.session.model()
  const branch = await branchOf($, cwd)
  const current = await read($, info)
  const next: Info = { ...current, project: projectOf(root), branch, model: modelName(model) }
  if (current && current.project === next.project && current.branch === next.branch && current.model === next.model) return
  await update($, info, () => next)
}

/** Keeps the context fill, from the first reading and from each response after it. */
async function setContext ($: EngineInterface, percent: number | undefined) {
  const current = await read($, info)
  if (!current || current.contextPercent === percent) return
  await update($, info, () => ({ ...current, contextPercent: percent }))
}

/** Where the line goes: the band above the prompt, the footer's right side, or the hint line's end. */
type Position = 'above' | 'footer' | 'hint'
const POSITIONS: readonly string[] = ['above', 'footer', 'hint']

/** What the options turn on, and in which color. */
type View = { showProject: boolean; showBranch: boolean; showModel: boolean; showContext: boolean; accent: string }

type Piece = { key: string; text: string; style: Record<string, string | boolean> }

/** Whether a tree beneath draws any text of its own (a plugin's), as opposed to the engine's empty slot. */
const hasText = (node: unknown): boolean =>
  typeof node === 'string' ? node.trim() !== ''
    : Array.isArray(node) ? node.some(hasText)
      : typeof node === 'object' && node !== null && hasText((node as { children?: unknown }).children)

/** The pieces the options leave on, in order; the context fill kept apart for its colors. */
function piecesOf (found: Info, view: View) {
  const pieces: Piece[] = []
  if (view.showProject && found.project) pieces.push({ key: 'project', text: found.project, style: { bold: true, color: view.accent } })
  if (view.showBranch && found.branch) pieces.push({ key: 'branch', text: found.branch, style: { italic: true, dimColor: true } })
  if (view.showModel && found.model) pieces.push({ key: 'model', text: found.model, style: { color: 'claude' } })
  const percent = view.showContext && found.contextPercent !== undefined ? Math.min(Math.max(found.contextPercent, 0), 100) : undefined
  return { pieces, percent }
}

/** A narrow screen gets a shorter bar. */
const cellsFor = (columns: number | undefined) => (columns !== undefined && columns < NARROW ? CELLS / 2 : CELLS)

type Ui = ReturnType<EngineInterface['ui']['resolve']>

/**
 * The info as blocks that never break inside: on a narrow screen a whole block moves to the next line.
 * `lead` puts a separator before the first block too, for blocks that follow something else.
 */
function blocksOf (found: Info | null, view: View, cells: number, lead: boolean, { Box, Text }: Ui) {
  if (found === null) return []
  const { pieces, percent } = piecesOf(found, view)
  const parts: Array<[string, RenderChildren]> = pieces.map(piece => [piece.key, <Text {...piece.style}>{piece.text}</Text>])
  if (percent !== undefined) {
    const filled = Math.round((percent / 100) * cells)
    parts.push(['context', [
      <Text color={colorFor(percent, view.accent)}>{'━'.repeat(filled)}</Text>,
      <Text dimColor>{'─'.repeat(cells - filled)}</Text>,
      <Text> {Math.round(percent)}%</Text>
    ]])
  }
  return parts.map(([key, part], i) => (
    <Box key={key} flexDirection="row" flexShrink={0}>
      {i > 0 || lead ? <Text dimColor> · </Text> : null}
      {part}
    </Box>
  ))
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
  const view: View = {
    showProject: options.showProject !== false,
    showBranch: options.showBranch !== false,
    showModel: options.showModel !== false,
    showContext: options.showContext !== false,
    accent: ACCENTS[String(options.accentColor)] ?? DEFAULT_ACCENT
  }
  const position = (POSITIONS.includes(String(options.position)) ? options.position : 'above') as Position

  on('session.start', async ($, e, next) => {
    // 0.3.0 could pin the line as a status line; an update leaves none behind.
    $.ui.status(undefined)
    await refresh($)
    await setContext($, (await $.session.usage()).context.percent)
    $.clock.every(REFRESH_MS, () => { void refresh($) })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await setContext($, e.context.percent)
    return next(e)
  })

  // The band above the prompt: the info on one line, over whatever another plugin draws there.
  if (position === 'above') {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      if (e.props.hasSurvey) return next(e)
      const ui = $.ui.resolve(e)
      const blocks = blocksOf(await read($, info), view, cellsFor(e.viewport?.columns), false, ui)
      if (blocks.length === 0) return next(e)

      const below = await next(e)
      if (!hasText(below)) return rowOf(ui, blocks)
      return <ui.Box flexDirection="column">{rowOf(ui, blocks)}{below}</ui.Box>
    })
  }

  // The footer's right side: the engine's mode labels (and any other plugin's part), then the info.
  if (position === 'footer') {
    on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
      const found = await read($, info)
      const ui = $.ui.resolve(e)
      const cells = cellsFor(e.viewport?.columns)
      if (blocksOf(found, view, cells, false, ui).length === 0) return next(e)

      const before = await next(e)
      if (e.props.modes.length === 0 && !hasText(before)) return rowOf(ui, blocksOf(found, view, cells, false, ui))
      return rowOf(ui, [...blocksBefore(before), ...blocksOf(found, view, cells, true, ui)])
    })
  }

  // The end of the hint line under the prompt: the engine's line as drawn (and any other plugin's part), then the info in its colors.
  if (position === 'hint') {
    on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
      const found = await read($, info)
      const ui = $.ui.resolve(e)
      const cells = cellsFor(e.viewport?.columns)
      if (!('isDraft' in e.props) || blocksOf(found, view, cells, false, ui).length === 0) return next(e)

      const line = await next(e)
      if (!e.props.hint.trim() && !hasText(line)) return rowOf(ui, blocksOf(found, view, cells, false, ui))
      return rowOf(ui, [...blocksBefore(line), ...blocksOf(found, view, cells, true, ui)])
    })
  }
}
