export type Change = { added: number; removed: number }

export type Hunk = { oldStart?: number; newStart?: number; lines: readonly string[] }

type Written = { structuredPatch?: readonly Hunk[]; content?: string; type?: string }

export type Patch = Change & { hunks: readonly Hunk[] }

const countOf = (hunks: readonly Hunk[]): Change => {
  const lines = hunks.flatMap(hunk => hunk.lines)
  return {
    added: lines.filter(line => line.startsWith('+')).length,
    removed: lines.filter(line => line.startsWith('-')).length,
  }
}

const linesOf = (text: string): number => (text === '' ? 0 : text.replace(/\n$/, '').split('\n').length)

const createdOf = (content: string): Hunk => ({ oldStart: 0, newStart: 1, lines: content.replace(/\n$/, '').split('\n').map(line => `+${line}`) })

export const changeOf = (output: unknown): Patch | null => {
  if (typeof output !== 'object' || output === null) return null
  const written = output as Written
  if (!Array.isArray(written.structuredPatch)) return null
  const hunks: readonly Hunk[] = written.structuredPatch
  if (hunks.length > 0) return { ...countOf(hunks), hunks }
  if (written.type !== 'create' || typeof written.content !== 'string') return null
  return { added: linesOf(written.content), removed: 0, hunks: written.content === '' ? [] : [createdOf(written.content)] }
}

export type FileChange = Change & { filePath: string; hunks: readonly Hunk[]; isCreated: boolean; isDeleted: boolean }

export type BashChanges = { files: FileChange[]; moreFiles: number }

type BashFile = { filePath: string; hunks: readonly Hunk[]; created?: true; deleted?: true }

type BashDiff = { files?: readonly BashFile[]; moreFiles?: number }

export const bashChangesOf = (output: unknown): BashChanges | null => {
  if (typeof output !== 'object' || output === null) return null
  const diff = (output as { bashEditDiff?: BashDiff }).bashEditDiff
  if (!diff || !Array.isArray(diff.files) || diff.files.length === 0) return null
  const files: readonly BashFile[] = diff.files
  return {
    files: files.map(file => ({
      filePath: file.filePath,
      hunks: file.hunks,
      ...countOf(file.hunks),
      isCreated: file.created === true,
      isDeleted: file.deleted === true,
    })),
    moreFiles: diff.moreFiles ?? 0,
  }
}

export const shortPath = (filePath: string, cwd: string): string =>
  filePath.startsWith(`${cwd}/`) ? filePath.slice(cwd.length + 1) : filePath

export const splitPath = (path: string): { folder: string; name: string } => {
  const cut = path.lastIndexOf('/') + 1
  return { folder: path.slice(0, cut), name: path.slice(cut) }
}

export const filePathOf = (output: unknown): string | null => {
  const filePath = typeof output === 'object' && output !== null ? (output as { filePath?: unknown }).filePath : undefined
  return typeof filePath === 'string' ? filePath : null
}

export type Preview = { lines: string[]; hidden: number }

export const previewOf = (output: unknown, shown: number): Preview => {
  const { stdout, stderr } = (typeof output === 'object' && output !== null ? output : {}) as { stdout?: unknown; stderr?: unknown }
  const text = [stdout, stderr].filter((part): part is string => typeof part === 'string' && part.trim() !== '').join('\n')
  const lines = text === '' ? [] : text.replace(/\s+$/, '').split('\n')
  return { lines: lines.slice(0, shown), hidden: Math.max(0, lines.length - shown) }
}

export type DiffRow = { kind: 'added' | 'removed' | 'kept'; number: number; text: string } | { kind: 'gap' }

export type Diff = { rows: DiffRow[]; hidden: number }

const rowsOf = (hunk: Hunk): DiffRow[] => {
  let before = hunk.oldStart ?? 1
  let after = hunk.newStart ?? 1
  return hunk.lines
    .filter(line => line[0] === '+' || line[0] === '-' || line[0] === ' ')
    .map(line => {
      const text = line.slice(1)
      if (line[0] === '+') return { kind: 'added', number: after++, text }
      if (line[0] === '-') return { kind: 'removed', number: before++, text }
      before++
      return { kind: 'kept', number: after++, text }
    })
}

export const diffOf = (hunks: readonly Hunk[], shown: number): Diff => {
  const rows = hunks.flatMap((hunk, at): DiffRow[] => (at === 0 ? rowsOf(hunk) : [{ kind: 'gap' }, ...rowsOf(hunk)]))
  const kept = rows.slice(0, shown)
  return { rows: kept.at(-1)?.kind === 'gap' ? kept.slice(0, -1) : kept, hidden: Math.max(0, rows.length - shown) }
}
