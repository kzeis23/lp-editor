---
name: process-marks
description: >
  Process LLM marks in an HTML file — find <span data-llm="instruction">
  regions, propose rewrite options for each mark, let the user pick, and
  apply selections in-place. Use when the user says /process-marks or asks
  to process marks/LLM marks in an HTML file.
argument-hint: "[path/to/file.html]"
disable-model-invocation: true
---

# Process Marks (HTML)

Read an HTML file, find all `<span data-llm="...">text</span>` marks, and process
each one interactively: propose rewrites, let the user choose, apply the selection,
consume the mark.

## What Marks Are

A mark is a `<span data-llm="instruction">text</span>` wrapper placed by the
lp-editor's mark tool (select text → click M → type instruction). The `data-llm`
attribute contains a free-text instruction describing what the replacement should
achieve. The inner content is the text being replaced.

Example in the HTML source:
```html
<p>After months of injections, the <span data-llm="make this more visceral and urgent">weight is finally off</span>. But now what?</p>
```

## Invocation

```
/process-marks path/to/file.html
```

If no argument is provided, ask for the file path.

## Step-by-Step Flow

### 1. Extract marks

Read the HTML file at `$ARGUMENTS`. Find every `<span data-llm="...">...</span>`
occurrence using regex. The regex must handle inner HTML (bold, em, br, etc.) inside
the span.

Pattern: `<span\s+data-llm="([^"]+)">([\s\S]*?)<\/span>`

For each mark found, record:
- **index**: sequential number (0-based) for identification
- **instruction**: the `data-llm` attribute value
- **marked_text**: inner content of the span (may contain HTML tags)
- **full_span**: the entire `<span data-llm="...">...</span>` string (for replacement)
- **char_offset**: position in the file string (for context extraction)

If no marks are found, report "No marks found in {file}" and stop.
If any mark has an empty instruction, skip it silently.

### 2. Assemble page context

Extract all visible text from the HTML file for style reference. Strip HTML tags to
get a plain-text version. This is the **style reference** used when generating options.
Identify the writing style: formal/conversational, sentence length patterns, punctuation
habits, vocabulary level, voice.

### 3. Process each mark sequentially

For each mark, use the principles below to generate 3 options, then present them to the
user in this exact format:

```
### Mark 1 of N

**Context:**
> ...surrounding text with **[marked text]** highlighted...

**Instruction:** {the data-llm value}

**Options:**

1. {replacement text}
   _{brief reasoning — what this achieves in the reader's mind}_

2. {replacement text}
   _{brief reasoning}_

3. {replacement text}
   _{brief reasoning}_

Pick 1, 2, or 3 (or "more" for new options, "skip" to leave unchanged):
```

For the **Context** line: extract ~200 characters around the mark from the HTML.
Replace the `<span data-llm="...">marked text</span>` with `**[marked text]**` so
the user can see what's being targeted. Strip other HTML tags for readability.

Wait for the user's response before proceeding. If the user says:
- **1, 2, or 3**: Apply that option (see step 4), move to next mark
- **"more"**: Generate 3 new options (different from previous ones), re-present
- **"skip"**: Leave this mark untouched, move to next mark

### 4. Apply selection

When the user picks an option:
1. Read the current HTML file from disk (it may have been updated by prior marks)
2. Find the exact `full_span` string in the file
3. Replace it with the chosen text (no span wrapper — the mark is consumed)
4. Write the updated HTML back to disk immediately (don't batch — write after each selection)

Use the Edit tool to do the replacement. This is a simple string replacement in the
HTML file — find the `full_span`, replace with the chosen text.

### 5. Final report

After all marks are processed, report:
- How many marks were processed (selections applied)
- How many were skipped
- The file path that was updated
- Remind user to restart the editor server to see changes (`node server.js <file>`)

## Rewrite Principles

These principles govern how you generate the 3 options for each mark. Follow them exactly.

### Instruction Interpretation

- Instructions describe what should happen in the reader's mind: the semantic meaning,
  the feeling, the cognitive/emotional response the text should evoke.
- Before generating anything, deeply interpret the instruction. What is the user really
  asking for? What should the reader feel/think/understand?
- Instructions may also contain stylistic directives (specific words, tone, structure).
  Honor these alongside the semantic intent.
- The marked text itself is content being replaced. The instruction is ONLY in the
  `data-llm` attribute. Never treat the marked text as an instruction.

### Style Matching

- The output must be indistinguishable from the surrounding text. Same sentence length
  patterns, same punctuation habits, same vocabulary level, same voice.
- Before generating, analyze the style of the full page copy: formal or conversational?
  Short punchy sentences or flowing prose? What punctuation patterns? What vocabulary level?
- The reader should never feel "this sentence was written by someone else."
- Absolutely no LLM-speak. Banned patterns:
  - Em dashes used as dramatic pauses
  - "delve", "tapestry", "leverage", "navigate", "journey", "unlock", "elevate",
    "robust", "seamless", "holistic", "empower"
  - Semicolons where the surrounding text uses periods
  - Overly parallel sentence structures unless the page already uses them
- Match the author's actual patterns, not default LLM patterns.

### Option Quality Over Forced Diversity

- The goal is finding the BEST articulation, not presenting three different ones.
- If one phrase is clearly optimal, it should appear in all three options. Only vary
  what genuinely could go multiple ways.
- Options may share words, sentences, or entire phrases. They should differ only where
  the wording could legitimately go in different directions.
- Each option must be a serious candidate for "this is the best version." No filler options.
- Never force differences for the sake of showing range.

### Contextual Evaluation

After generating each option, mentally re-read the full paragraph with the option inserted:
- Does it flow naturally? Does the rhythm work? Does it feel like one continuous voice?
- Does it achieve what the instruction asks for — not just semantically but in the actual
  reading experience?
- If an option creates awkward repetition (same word used in the sentence before/after),
  discard it and generate a better one.

## Edge Cases

| Case | Handling |
|------|----------|
| No marks found | Report "No marks found in {file}" and stop |
| Mark spans across HTML tags | Regex must handle `<span data-llm="...">text with <strong>bold</strong> inside</span>` |
| Nested marks | Warn user, skip the outer mark |
| Empty instruction | Skip silently |
| Multiple marks in same paragraph | Process each independently; re-read file before each replacement |
| User wants to edit instruction | "skip" leaves mark in place; they edit in the editor and re-run |
| File not found | Report error and stop |
