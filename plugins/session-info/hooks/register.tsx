import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Info } from '../types'

const info = atom({ plugin: 'session-info', key: 'info' } as const, null as Info | null)

const REFRESH_MS = 5000

/** The accentColor choices: the brand green as is, the rest as theme keys so they follow the person's theme. */
const ACCENTS: Record<string, string> = {
  green: '#00A859',
  orange: 'claude',
  blue: 'suggestion',
  purple: 'autoAccept',
  teal: 'planMode'
}

const CELLS = 10
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

export const register: Register = (on, options) => {
  const showProject = options.showProject !== false
  const showBranch = options.showBranch !== false
  const showModel = options.showModel !== false
  const showContext = options.showContext !== false
  const accent = ACCENTS[String(options.accentColor)] ?? ACCENTS.green

  on('session.start', async ($, e, next) => {
    await refresh($)
    await setContext($, (await $.session.usage()).context.percent)
    $.clock.every(REFRESH_MS, () => { void refresh($) })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await setContext($, e.context.percent)
    return next(e)
  })

  // The band above the prompt: the session info on one line.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const found = await read($, info)
    if (e.props.hasSurvey || found === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const parts: Array<[string, unknown]> = []
    if (showProject && found.project) parts.push(['project', <Text bold color={accent}>{found.project}</Text>])
    if (showBranch && found.branch) parts.push(['branch', <Text italic dimColor>{found.branch}</Text>])
    if (showModel && found.model) parts.push(['model', <Text color="claude">{found.model}</Text>])
    if (showContext && found.contextPercent !== undefined) {
      const percent = Math.min(Math.max(found.contextPercent, 0), 100)
      const filled = Math.round((percent / 100) * CELLS)
      parts.push(['context', (
        <Box flexDirection="row">
          <Text color={colorFor(percent, accent)}>{'━'.repeat(filled)}</Text>
          <Text dimColor>{'─'.repeat(CELLS - filled)}</Text>
          <Text> {Math.round(percent)}%</Text>
        </Box>
      )])
    }
    if (parts.length === 0) return next(e)

    return (
      <Box flexDirection="row">
        {parts.flatMap(([key, part], i) => (i === 0 ? [part] : [<Text key={`${key}-sep`} dimColor> · </Text>, part]))}
      </Box>
    )
  })
}
