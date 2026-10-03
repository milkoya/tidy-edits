import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { bashChangesOf, changeOf, diffOf, previewOf, shortPath } from '../hooks/count'

const EDIT = {
  filePath: '/repo/a.ts',
  oldString: 'a',
  newString: 'b',
  originalFile: 'a\nb\nc\n',
  structuredPatch: [{ oldStart: 1, oldLines: 3, newStart: 1, newLines: 4, lines: [' a', '-b', '+b2', '+b3', ' c'] }],
  userModified: false,
  replaceAll: false,
}

const CREATED = { type: 'create', filePath: '/repo/new.ts', content: 'one\ntwo\nthree\n', structuredPatch: [], originalFile: null }

const BASH = {
  stdout: 'l1\nl2\nl3\nl4\nl5',
  stderr: '',
  interrupted: false,
  bashEditDiff: {
    files: [
      { filePath: '/repo/Assets/A.cs', hunks: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 4, lines: [' a', '-b', '+b2', '+b3', '+b4'] }] },
      { filePath: '/repo/Assets/New.cs', hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: ['+x', '+y'] }], created: true },
    ],
    moreFiles: 3,
  },
}

const row = (tool: string, output: unknown, isErrored = false) =>
  ({ plugin: 'tidy-edits', surface: 'terminal', component: 'ToolResult', props: { tool_use_id: `${tool}-1`, tool, output, isErrored } }) as const

const drawsOriginal = (on: On) =>
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>ORIGINAL</Text>
  })

describe('counting', () => {
  test('counts edits, new files, bash changes and output previews', async () => {
    expect(changeOf(EDIT)).toEqual({ added: 2, removed: 1, hunks: EDIT.structuredPatch })
    expect(changeOf(CREATED)).toEqual({ added: 3, removed: 0, hunks: [{ oldStart: 0, newStart: 1, lines: ['+one', '+two', '+three'] }] })
    expect(changeOf({ ...CREATED, type: 'update', structuredPatch: [{ lines: ['-old', '+new', '+more'] }] })).toMatchObject({ added: 2, removed: 1 })
    expect(changeOf({ ...CREATED, type: 'update', structuredPatch: [] })).toBeNull()
    expect(changeOf('nope')).toBeNull()
    expect(changeOf({ filePath: 'x' })).toBeNull()
    expect(bashChangesOf(BASH)).toMatchObject({
      files: [
        { filePath: '/repo/Assets/A.cs', added: 3, removed: 1, isCreated: false, isDeleted: false },
        { filePath: '/repo/Assets/New.cs', added: 2, removed: 0, isCreated: true, isDeleted: false },
      ],
      moreFiles: 3,
    })
    expect(bashChangesOf({ stdout: 'hi', stderr: '', interrupted: false })).toBeNull()
    expect(shortPath('/repo/Assets/A.cs', '/repo')).toBe('Assets/A.cs')
    expect(shortPath('/elsewhere/A.cs', '/repo')).toBe('/elsewhere/A.cs')
    expect(previewOf({ stdout: 'a\nb\nc\nd\ne\n', stderr: '' }, 3)).toEqual({ lines: ['a', 'b', 'c'], hidden: 2 })
    expect(previewOf({ stdout: 'out', stderr: 'warn\n' }, 3)).toEqual({ lines: ['out', 'warn'], hidden: 0 })
  })

  test('numbers each diff line, marks a gap between chunks and stops at the limit', async () => {
    const hunks = [
      { oldStart: 3, newStart: 3, lines: [' a', '-b', '+B', '+C'] },
      { oldStart: 20, newStart: 21, lines: [' x', '-y'] },
    ]
    expect(diffOf(hunks, 40)).toEqual({
      rows: [
        { kind: 'kept', number: 3, text: 'a' },
        { kind: 'removed', number: 4, text: 'b' },
        { kind: 'added', number: 4, text: 'B' },
        { kind: 'added', number: 5, text: 'C' },
        { kind: 'gap' },
        { kind: 'kept', number: 21, text: 'x' },
        { kind: 'removed', number: 21, text: 'y' },
      ],
      hidden: 0,
    })
    expect(diffOf(hunks, 3)).toMatchObject({ hidden: 4 })
    expect(diffOf(hunks, 5).rows.at(-1)).toEqual({ kind: 'added', number: 5, text: 'C' })
    expect(diffOf([{ lines: ['-old', '+new', '\\ No newline at end of file'] }], 40).rows).toEqual([
      { kind: 'removed', number: 1, text: 'old' },
      { kind: 'added', number: 1, text: 'new' },
    ])
  })
})

describe('the card', () => {
  test('draws one line per edited or written file instead of the original', async ($, on) => {
    drawsOriginal(on)
    on('session.cwd', () => ({ value: '/repo' }))
    for (const [tool, output, added, removed, verb, name] of [['Edit', EDIT, 2, 1, 'Updated', 'a.ts'], ['Write', CREATED, 3, 0, 'Created', 'new.ts']] as const) {
      const ui = await $.ui.mount(row(tool, output))
      expect(await ui.find({ type: 'Text', text: 'ORIGINAL' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: verb })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: name })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: `+${added}` })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^−/ })).toEqual(removed > 0 ? expect.objectContaining({ text: `−${removed}` }) : undefined)
      expect(await ui.find({ type: 'Button', key: `diff:/repo/${name}` })).toBeDefined()
      await ui.unmount()
    }
  })

  test('shows and hides the diff of an edit', async ($, on) => {
    drawsOriginal(on)
    on('session.cwd', () => ({ value: '/repo' }))
    const ui = await $.ui.mount(row('Edit', EDIT))
    expect(await ui.find({ type: 'Text', text: 'b2' })).toBeUndefined()
    await ui.press({ key: 'diff:/repo/a.ts' })
    expect(await ui.find({ type: 'Text', text: 'b2' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'b' })).toBeDefined()
    await ui.press({ key: 'diff:/repo/a.ts' })
    expect(await ui.find({ type: 'Text', text: 'b2' })).toBeUndefined()
    await ui.unmount()
  })

  test('draws a short preview of a bash output and one line per changed file instead of the original', async ($, on) => {
    drawsOriginal(on)
    on('session.cwd', () => ({ value: '/repo' }))
    const ui = await $.ui.mount(row('Bash', BASH))
    expect(await ui.find({ type: 'Text', text: 'ORIGINAL' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'l3' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'l4' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '… +2 lines' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Assets/' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'A.cs' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Created' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '+3' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'and 3 more files' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^−0/ })).toBeUndefined()
    await ui.unmount()
  })

  test('shows and hides the diff of each changed file on its own', async ($, on) => {
    drawsOriginal(on)
    on('session.cwd', () => ({ value: '/repo' }))
    const ui = await $.ui.mount(row('Bash', BASH))
    await ui.press({ key: 'diff:/repo/Assets/A.cs' })
    expect(await ui.find({ type: 'Text', text: 'b2' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'x' })).toBeUndefined()
    await ui.press({ key: 'diff:/repo/Assets/New.cs' })
    expect(await ui.find({ type: 'Text', text: 'x' })).toBeDefined()
    await ui.press({ key: 'diff:/repo/Assets/A.cs' })
    expect(await ui.find({ type: 'Text', text: 'b2' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'x' })).toBeDefined()
    await ui.unmount()
  })

  test('a deleted file shows what was removed', async ($, on) => {
    drawsOriginal(on)
    on('session.cwd', () => ({ value: '/repo' }))
    const gone = { ...BASH, bashEditDiff: { files: [{ filePath: '/repo/Old.cs', hunks: [{ oldStart: 1, newStart: 0, lines: ['-a', '-b'] }], deleted: true }], moreFiles: 0 } }
    const ui = await $.ui.mount(row('Bash', gone))
    expect(await ui.find({ type: 'Text', text: 'Deleted' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '−2' })).toBeDefined()
    await ui.press({ key: 'diff:/repo/Old.cs' })
    expect(await ui.find({ type: 'Text', text: 'b' })).toBeDefined()
    await ui.unmount()
  })

  test('drops the diff from a bash row inside an opened group', async ($, on) => {
    on('ui.render', { component: 'ToolUse' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      const hasDiff = typeof e.props.output === 'object' && e.props.output !== null && 'bashEditDiff' in e.props.output
      return <Text>{hasDiff ? 'WITH DIFF' : 'NO DIFF'}</Text>
    })
    const call = (output: unknown, isRunning = false) =>
      ({ plugin: 'tidy-edits', surface: 'terminal', component: 'ToolUse', props: { tool_use_id: 'b-1', tool: 'Bash', input: {}, output, isRunning, isErrored: false, isInterrupted: false } }) as const
    const tidied = await $.ui.mount(call(BASH))
    expect(await tidied.find({ type: 'Text', text: 'NO DIFF' })).toBeDefined()
    await tidied.unmount()
    const elsewhere = await $.ui.mount({ ...call(BASH), surface: 'desktop' })
    expect(await elsewhere.find({ type: 'Text', text: 'WITH DIFF' })).toBeDefined()
    await elsewhere.unmount()
    const running = await $.ui.mount(call(undefined, true))
    expect(await running.find({ type: 'Text', text: 'NO DIFF' })).toBeDefined()
    await running.unmount()
  })

  test('leaves failed, held and unchanged calls, plain commands and every surface but the terminal as they are', async ($, on) => {
    drawsOriginal(on)
    const elsewhere = (tool: string, output: unknown, surface: 'desktop' | 'vscode' | 'mobile') => ({ ...row(tool, output), surface })
    for (const mounted of [
      row('Edit', 'old_string not found', true),
      row('Edit', { ...EDIT, staged: true }),
      row('Write', { ...CREATED, type: 'update', structuredPatch: [] }),
      row('Bash', { stdout: 'hi', stderr: '' }),
      elsewhere('Edit', EDIT, 'desktop'),
      elsewhere('Write', CREATED, 'vscode'),
      elsewhere('Bash', BASH, 'mobile'),
    ]) {
      const ui = await $.ui.mount(mounted)
      expect(await ui.find({ type: 'Text', text: 'ORIGINAL' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('leaves every row alone in a session that did not start in a terminal', async ($, on) => {
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    drawsOriginal(on)
    await $.session.start({ cwd: '/repo', surface: null, isInteractive: false })
    for (const mounted of [row('Edit', EDIT), row('Write', CREATED), row('Bash', BASH)]) {
      const ui = await $.ui.mount(mounted)
      expect(await ui.find({ type: 'Text', text: 'ORIGINAL' })).toBeDefined()
      await ui.unmount()
    }
  })
})
