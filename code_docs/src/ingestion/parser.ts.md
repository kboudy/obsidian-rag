# `src/ingestion/parser.ts` — Obsidian Markdown Parser

[View source](../../../src/ingestion/parser.ts)

## Purpose

Parses Obsidian Markdown files into a structured `ParsedDocument`. Handles Obsidian-specific syntax: inline hashtags, wikilinks, image embeds, and the flat-heading structure common in Obsidian vaults. This is the most Obsidian-specific module in the codebase.

## Output types

```ts
interface ParsedDocument {
  title: string;           // first H1 heading, or filename if none
  tags: string[];          // merged from YAML frontmatter + inline hashtags
  sections: ParsedSection[];
}

interface ParsedSection {
  headingPath: string;     // "bash scripting > .bash_profile vs .bashrc"
  headingLevel: number;    // 1–6, or 0 for content before first heading
  content: string;         // raw markdown (for display)
  contentClean: string;    // embedding-ready text (wikilinks stripped, images removed)
}
```

## `parseMarkdown(content, filePath): ParsedDocument`

The main export. Runs the following steps in order:

### 1. Extract YAML frontmatter

```ts
function extractFrontmatter(content): { tags: string[]; body: string }
```

Detects `---` delimiters at the start of the file. Parses `tags:` in two formats:

- Inline array: `tags: [linux, docker]`
- Block list:
  ```yaml
  tags:
    - linux
    - docker
  ```

Most files in this vault don't have frontmatter, so this step is usually a no-op.

### 2. Extract inline hashtags

```ts
function extractHashtags(text): { tags: string[]; cleaned: string }
```

Applied only to the **first line** of the body — Obsidian's convention for tag placement:

```
#linux #docker #bash

# bash scripting
...
```

The regex `(?:^|\s)#([a-zA-Z_][a-zA-Z0-9_]*)` matches hashtags preceded by whitespace or the start of a string, but not `#` followed by a space (which is a Markdown heading). Tags are collected and the first line is cleaned of them.

### 3. Split by headings (code-block aware)

```ts
function splitByHeadings(text): Array<{ heading, level, content }>
```

Iterates line by line, tracking a `inCodeBlock` boolean toggled by triple-backtick fences. This prevents lines like:

```sh
# This is a shell comment, not a heading
```

from being mistaken for headings.

Each time a heading line (`/^(#{1,6})\s+(.+)/`) is encountered outside a code block, the accumulated `currentLines` are flushed as a new section.

### 4. Build heading paths

A `headingStack` array tracks the current heading hierarchy:

```ts
const headingStack: string[] = [];
// For "## Section A > ### Subsection":
// headingStack = ["", "Section A", "Subsection"]
```

When a new heading at level `N` is encountered, `headingStack.splice(N - 1)` removes all headings at level `N` and deeper before inserting the new one. The path is built with `headingStack.filter(Boolean).join(" > ")`.

Example: encountering `### Basic` after `## Navigation` under `# bash scripting` yields:
```
headingPath = "bash scripting > Navigation > Basic"
```

### 5. Clean for embedding

```ts
function cleanForEmbedding(text): string
```

The `contentClean` version of each section has:

- `![[embed]]` — Obsidian embed syntax removed entirely
- `![alt](path)` — Standard image markdown removed entirely
- `[[target|display text]]` → `display text`
- `[[target]]` → `target`
- Consecutive blank lines collapsed to one

This produces cleaner text for the embedding model without the visual noise of image references and bracket syntax.

### 6. Self-contained chunks

Each section's `content` includes its own heading line prepended:

```ts
const contentWithHeading = raw.heading
  ? `${"#".repeat(raw.level)} ${raw.heading}\n\n${sectionContent}`.trim()
  : sectionContent;
```

This makes each chunk self-contained when shown as a source in the UI, and also gives the embedding model heading context even for the text within the section.
