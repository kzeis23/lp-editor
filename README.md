# lp-editor

Inline visual editor for any HTML page. Zero dependencies — just Node.js.

Run it on any HTML file. Every text element becomes editable in place. Edits are saved surgically — only the changed text is modified, all other formatting and whitespace is preserved.

## Quick start

```bash
node server.js path/to/page.html
# opens http://localhost:3456
```

Accepts a file path or a directory (looks for `index.html` inside).

## How it works

**Editing:**
- Hover over any text — dashed blue outline shows it's editable
- Click to edit (cursor appears, type to change)
- Links/buttons: double-click to edit (single click still navigates)
- Enter to confirm, Escape to revert
- Save button (bottom-right) writes changes back to the HTML file

**Toolbar** (appears on text selection):
- **B** — bold
- **I** — italic
- **M** — place a mark (LLM instruction for later rewrite)
- **X** — remove a mark

**Marks:**
Select text, click M, type an instruction like "make this more urgent". A purple-highlighted `<span data-llm="instruction">` wrapper is saved into the HTML. Process marks later with the `/process-marks` skill or manually.

## Save behavior

Saves are surgical — the server tokenizes the HTML file, tracks byte offsets of each editable element, and replaces only the changed innerHTML at those offsets. The rest of the file is untouched. This means:

- Indentation, comments, and whitespace outside edited elements are preserved
- `git diff` after a save shows only the text you actually changed
- No browser serialization artifacts

## What gets detected as editable

**Server-side tokenizer** finds these tags:
`h1-h6`, `p`, `li`, `td`, `th`, `figcaption`, `blockquote`, `label`, `button`, `dt`, `dd`, `a`, `strong`, `em`

Skips these (and their subtrees): `script`, `style`, `svg`, `noscript`, `pre`, `code`, `template`, `head`

**Client-side scanner** additionally finds `div` and `span` elements that function as paragraph equivalents (have direct text content, no block-level children).

Nesting guard: if an element is inside another editable element (e.g. `<strong>` inside `<p>`), only the outer one is editable. Prevents nested `contenteditable` conflicts.

## Processing marks with Claude Code

If you use [Claude Code](https://claude.com/claude-code), the repo includes a `/process-marks` skill:

```
/process-marks path/to/page.html
```

This finds all `<span data-llm="...">` marks in the file, proposes 3 rewrite options per mark (style-matched to the surrounding copy), lets you pick, and applies selections in place — consuming the mark.

## Files

| File | Purpose |
|------|---------|
| `server.js` | Node HTTP server — tokenizes HTML, injects editor, handles save |
| `editor-core.js` | Client-side editor — discovery, contenteditable, toolbar, marks, save |
| `tokenizer.js` | HTML scanner — finds editable elements with byte offsets |
| `package.json` | `{ "type": "commonjs" }` — no dependencies |
| `.claude/skills/process-marks/SKILL.md` | Claude Code skill for processing LLM marks |

## Requirements

Node.js (any recent version). Nothing else.
