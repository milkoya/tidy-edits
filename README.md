# 🧹 Tidy Edits

Short cards for every file Claude edits, instead of hundreds of lines of diff in your transcript.

```
⏺ Update(Assets/Game/Cat/CatController.cs)
  ⎿  Updated Assets/Game/Cat/CatController.cs +12 −3 [ show diff ]
⏺ Write(Assets/Game/Cat/CatSounds.cs)
  ⎿  Created Assets/Game/Cat/CatSounds.cs +40 [ show diff ]
```

## What the cards show

- **Edit and Write**: one line with the file and how many lines were added and removed.
- **Bash**: when a command changes files, the first three lines of its output and `… +N lines`, then one line per changed file. When a command changes many files, the last line says how many more there are. Inside an opened "Ran N shell commands" group, the command's output shows without its diff.
- **`[ show diff ]`** opens that file's diff right under its line, in Claude Code's diff colours and layout, and **`[ hide diff ]`** folds it again. Each file opens on its own, and a long diff stops after 40 lines with `… +N more lines`.
- When the terminal isn't focused, the first click only focuses it, so click again.

## Good to know

- **Only the view changes.** Claude still reads every result in full.
- **Failed calls keep Claude Code's own error**, and so do edits held for review and writes that changed nothing.
- **Open diffs reset** when the session restarts.
- **The Bash card needs the file list Claude Code attaches to a command's result.** That list is internal to Claude Code and could change; when it's missing, you see Claude Code's usual output.
- **It runs only in the Claude Code CLI.** In a session that didn't start in a terminal, like one in the desktop app, it switches itself off. When the desktop app or your phone joins a terminal session through Remote Control, the other screen shows Claude Code's usual results.

## Install

```sh
claude plugin marketplace add milkoya/mods
claude plugin install tidy-edits@milkoya
```

Start a new Claude Code session to load it.

**Or by hand:** clone this repo into `~/.claude/mods/tidy-edits`:

```sh
git clone https://github.com/milkoya/tidy-edits.git ~/.claude/mods/tidy-edits
```

Then either run `claude --plugin-dir ~/.claude/mods`, or add this to `~/.claude/settings.json` so it loads every time:

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods"
  }
}
```

Tidy Edits is built on Claude Code's **function hooks**, an early-access feature that's still rolling out. If your Claude Code doesn't load it yet, it will once the feature reaches you.

## Tinkering

| File | What's inside |
| --- | --- |
| `hooks/count.ts` | Counting added and removed lines, Bash file changes, short paths, output previews and numbering diff lines |
| `hooks/register.tsx` | The cards for Edit, Write and Bash results, and the diff under each file |

Check your changes with:

```sh
claude plugin validate .
claude plugin test .
```

## License

MIT © Mio
