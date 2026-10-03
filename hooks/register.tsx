import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import { bashChangesOf, changeOf, diffOf, filePathOf, previewOf, shortPath, splitPath } from './count'
import type { Change, DiffRow, Hunk } from './count'

const open = atom({ plugin: 'tidy-edits', key: 'open' } as const, [])
const inTerminal = atom({ plugin: 'tidy-edits', key: 'inTerminal' } as const, true)

const ADDED = '#4eba65'
const REMOVED = '#e05a5a'
const FOLDER = '#8a9bb4'
const FILE = '#6cb6ff'
const PREVIEW_LINES = 3
const DIFF_LINES = 40
const GUTTER = '  ⎿  '

type Elements = ReturnType<EngineInterface['ui']['resolve']>

type Shown = Change & { verb: string; path: string; filePath: string; hunks: readonly Hunk[] }

type Rows = { id: string; opened: readonly string[] }

const toggle = ($: EngineInterface, key: string) => update($, open, keys => (keys.includes(key) ? keys.filter(other => other !== key) : [...keys, key]))

const counted = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

const LOOKS = {
  added: { mark: '+', color: '#50c850', background: '#022800' },
  removed: { mark: '-', color: '#dc5a5a', background: '#3d0100' },
  kept: { mark: ' ', color: undefined, background: undefined },
} as const

const DIFF_TEXT = '#f8f8f2'

const diffRow = ({ Box, Text }: Elements, row: DiffRow, width: number) => {
  if (row.kind === 'gap') return <Text dimColor>{' '.repeat(width + 1)} ...</Text>
  const { mark, color, background } = LOOKS[row.kind]
  return (
    <Box backgroundColor={background}>
      <Text>
        {' '}
        {String(row.number).padStart(width)}{' '}
      </Text>
      <Text color={color}>{mark}</Text>
      <Text color={DIFF_TEXT} wrap="truncate-end">
        {row.text}
      </Text>
    </Box>
  )
}

const diffBlock = (elements: Elements, hunks: readonly Hunk[]) => {
  const { Box, Text } = elements
  const { rows, hidden } = diffOf(hunks, DIFF_LINES)
  const width = Math.max(...rows.map(row => (row.kind === 'gap' ? 1 : String(row.number).length)))
  return (
    <Box flexDirection="column">
      {rows.map(row => diffRow(elements, row, width))}
      {hidden > 0 ? <Text dimColor>… +{counted(hidden, 'more line')}</Text> : null}
    </Box>
  )
}

const fileLine = (elements: Elements, $: EngineInterface, { id, opened }: Rows, { verb, path, filePath, hunks, added, removed }: Shown) => {
  const { Box, Text, Button } = elements
  const { folder, name } = splitPath(path)
  const key = `${id}:${filePath}`
  const isOpen = opened.includes(key)
  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text>{verb}</Text>
        <Box>
          <Text color={FOLDER}>{folder}</Text>
          <Text color={FILE} bold>
            {name}
          </Text>
        </Box>
        {added > 0 ? <Text color={ADDED}>+{added}</Text> : null}
        {removed > 0 ? <Text color={REMOVED}>−{removed}</Text> : null}
        {added + removed > 0 ? <Button key={`diff:${filePath}`} label={isOpen ? 'hide diff' : 'show diff'} variant="primary" onPress={() => void toggle($, key)} /> : null}
      </Box>
      {isOpen && added + removed > 0 ? diffBlock(elements, hunks) : null}
    </Box>
  )
}

const card = ({ Box, Text }: Elements, children: readonly RenderChildren[]) => (
  <Box>
    <Text dimColor>{GUTTER}</Text>
    <Box flexDirection="column" flexGrow={1}>
      {children}
    </Box>
  </Box>
)

const isOff = async ($: EngineInterface, surface: string, isErrored: boolean) => isErrored || surface !== 'terminal' || !(await read($, inTerminal))

type Result = { type?: unknown; staged?: unknown }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, inTerminal, () => e.surface === 'terminal')
    return next(e)
  })

  for (const tool of ['Edit', 'Write'] as const) {
    on('ui.render', { component: 'ToolResult', props: { tool } }, async ($, e, next) => {
      if (await isOff($, e.surface, e.props.isErrored)) return next(e)
      const output = e.props.output
      const change = changeOf(output)
      const filePath = filePathOf(output)
      const { type, staged } = output as Result
      if (!change || !filePath || staged === true) return next(e)
      const elements = $.ui.resolve(e)
      const rows = { id: e.props.tool_use_id, opened: await read($, open) }
      const path = shortPath(filePath, await $.session.cwd())
      return card(elements, [fileLine(elements, $, rows, { ...change, verb: type === 'create' ? 'Created' : 'Updated', path, filePath })])
    })
  }

  on('ui.render', { component: 'ToolResult', props: { tool: 'Bash' } }, async ($, e, next) => {
    if (await isOff($, e.surface, e.props.isErrored)) return next(e)
    const output = e.props.output
    const changes = bashChangesOf(output)
    if (!changes) return next(e)
    const cwd = await $.session.cwd()
    const elements = $.ui.resolve(e)
    const rows = { id: e.props.tool_use_id, opened: await read($, open) }
    const { Text } = elements
    const preview = previewOf(output, PREVIEW_LINES)
    return card(elements, [
      ...preview.lines.map(line => (
        <Text dimColor wrap="truncate-end">
          {line}
        </Text>
      )),
      preview.hidden > 0 ? <Text dimColor>… +{counted(preview.hidden, 'line')}</Text> : null,
      ...changes.files.map(file =>
        fileLine(elements, $, rows, {
          ...file,
          verb: file.isCreated ? 'Created' : file.isDeleted ? 'Deleted' : 'Updated',
          path: shortPath(file.filePath, cwd),
        }),
      ),
      changes.moreFiles > 0 ? <Text dimColor>and {counted(changes.moreFiles, 'more file')}</Text> : null,
    ])
  })

  on('ui.render', { component: 'ToolUse', props: { tool: 'Bash' } }, async ($, e, next) => {
    const output = e.props.output
    if (e.props.isRunning || (await isOff($, e.surface, e.props.isErrored)) || !bashChangesOf(output)) return next(e)
    const { bashEditDiff, ...plain } = output as Record<string, unknown>
    return next({ ...e, props: { ...e.props, output: plain } })
  })
}
