// Mod tests, run against the engine itself: `claude plugin test .`
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionContextUsage } from 'claude-code'

type Git = Record<string, { exitCode: number; stdout: string }>

/** Everything beneath the mod: the clock, the session's directory and model, git, its usage and what the engine draws. */
function world (on: On, git: Git, context: SessionContextUsage = { window: 200_000, percent: 42 }) {
  const clock = mock.clock(on, { now: Date.parse('2026-10-20T10:00:00Z') })
  const state = { git, model: 'claude-sonnet-5-5-20260101', context }
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work/claude-plugins' }))
  on('session.root', () => ({ value: '/work/claude-plugins' }))
  on('session.model', () => ({ value: state.model }))
  on('session.usage', () => ({ value: { startedAt: 0, context: state.context, rateLimits: [] } as never }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('process.run', ($, e) => {
    const out = state.git[e.argv.slice(1).join(' ')] ?? { exitCode: 128, stdout: '' }
    return { value: { ...out, stderr: '' } as never }
  })
  on('ui.render', ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return 'hint' in e.props ? <Text>{e.props.hint}</Text> : <Box key="engine" />
  })
  return { clock, state }
}

const MAIN: Git = { 'branch --show-current': { exitCode: 0, stdout: 'main\n' } }
const startSession = ($: Engine) => $.session.start({ cwd: '/work/claude-plugins', surface: 'terminal', isInteractive: true })
const footer = ($: Engine) =>
  $.ui.mount({ plugin: 'session-info', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false } })
const has = async (ui: Awaited<ReturnType<typeof footer>>, text: string) => (await ui.find({ type: 'Text', text })) !== undefined

test('shows the project, branch, model and context', async ($, on) => {
  world(on, MAIN)
  await startSession($)
  const ui = await footer($)
  expect(await has(ui, 'claude-plugins')).toBe(true)
  expect(await has(ui, 'main')).toBe(true)
  expect(await has(ui, 'sonnet-5-5')).toBe(true)
  expect(await has(ui, '━━━━')).toBe(true)
  expect(await has(ui, '──────')).toBe(true)
  expect(await has(ui, ' 42%')).toBe(true)
})

test('shows no branch outside a repository', async ($, on) => {
  world(on, {})
  await startSession($)
  const ui = await footer($)
  expect(await has(ui, 'claude-plugins')).toBe(true)
  expect(await has(ui, 'main')).toBe(false)
})

test('shows the short commit on a detached HEAD', async ($, on) => {
  world(on, {
    'branch --show-current': { exitCode: 0, stdout: '\n' },
    'rev-parse --short HEAD': { exitCode: 0, stdout: 'abc1234\n' }
  })
  await startSession($)
  expect(await has(await footer($), '@abc1234')).toBe(true)
})

test('follows a branch change and a model change', async ($, on) => {
  const w = world(on, MAIN)
  await startSession($)
  w.state.git['branch --show-current'] = { exitCode: 0, stdout: 'feature/login\n' }
  w.state.model = 'claude-opus-5-5'
  await w.clock.advance(5000)
  const ui = await footer($)
  expect(await has(ui, 'feature/login')).toBe(true)
  expect(await has(ui, 'opus-5-5')).toBe(true)
})

test('a response moves the context fill', async ($, on) => {
  world(on, MAIN)
  await startSession($)
  await $.session.measure({ context: { window: 200_000, percent: 91 }, rateLimits: [], changed: ['context'] })
  const ui = await footer($)
  expect(await has(ui, '━━━━━━━━━')).toBe(true)
  expect(await has(ui, ' 91%')).toBe(true)
})

test('draws nothing for a piece the options turn off', { options: { showModel: false, showContext: false } }, async ($, on) => {
  world(on, MAIN)
  await startSession($)
  const ui = await footer($)
  expect(await has(ui, 'claude-plugins')).toBe(true)
  expect(await has(ui, 'sonnet-5-5')).toBe(false)
  expect(await has(ui, ' 42%')).toBe(false)
})
