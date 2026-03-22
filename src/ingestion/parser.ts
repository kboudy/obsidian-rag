export interface ParsedSection {
  headingPath: string;  // e.g. "bash scripting > .bash_profile vs .bashrc > .bash_profile file"
  headingLevel: number; // 1-6, or 0 for content before first heading
  content: string;      // raw markdown content of this section
  contentClean: string; // cleaned for embedding: no wikilinks, no images
}

export interface ParsedDocument {
  title: string;         // first H1 or filename
  tags: string[];        // from inline hashtags or YAML frontmatter
  sections: ParsedSection[];
}

/** Extract YAML frontmatter block, returning [frontmatter, remainder] */
function extractFrontmatter(content: string): { tags: string[]; body: string } {
  if (!content.startsWith("---")) return { tags: [], body: content };
  const end = content.indexOf("\n---", 3);
  if (end === -1) return { tags: [], body: content };

  const yaml = content.slice(3, end);
  const body = content.slice(end + 4).trimStart();

  // Parse tags: from `tags: [a, b]` or `tags:\n  - a\n  - b`
  const tags: string[] = [];
  const inlineMatch = yaml.match(/^tags:\s*\[([^\]]*)\]/m);
  if (inlineMatch) {
    tags.push(...inlineMatch[1].split(",").map(t => t.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean));
  } else {
    const blockMatch = yaml.match(/^tags:\s*\n((?:\s*-\s*.+\n?)*)/m);
    if (blockMatch) {
      const lines = blockMatch[1].split("\n");
      for (const line of lines) {
        const m = line.match(/^\s*-\s*(.+)/);
        if (m) tags.push(m[1].trim().replace(/^['"]|['"]$/g, ""));
      }
    }
  }

  return { tags, body };
}

/** Extract inline hashtags like #linux #docker from text (typically first line) */
function extractHashtags(text: string): { tags: string[]; cleaned: string } {
  const tags: string[] = [];
  // Match standalone hashtags: start of string or whitespace, then #word
  // Must not be inside a heading (# heading)
  const cleaned = text.replace(/(?:^|\s)#([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, tag) => {
    tags.push(tag);
    return match.startsWith(" ") ? " " : "";
  }).trim();
  return { tags, cleaned };
}

/** Strip Obsidian wikilinks, image embeds, and normalize for embedding */
function cleanForEmbedding(text: string): string {
  return text
    // Strip image embeds: ![alt](path) and ![[embed]]
    .replace(/!\[\[.*?\]\]/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    // Replace [[target|display]] with display text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    // Replace [[target]] with target text
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    // Collapse excessive whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Split markdown into sections by headings, respecting code block boundaries.
 * Returns an array of { headingLine, level, content } where content is the
 * text following the heading up to (but not including) the next heading.
 */
function splitByHeadings(text: string): Array<{ heading: string; level: number; content: string }> {
  const lines = text.split("\n");
  const sections: Array<{ heading: string; level: number; content: string }> = [];

  let inCodeBlock = false;
  let currentHeading = "";
  let currentLevel = 0;
  let currentLines: string[] = [];

  for (const line of lines) {
    // Track code block state to avoid splitting on # inside code
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      currentLines.push(line);
      continue;
    }

    if (!inCodeBlock) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        // Save the previous section
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          content: currentLines.join("\n").trim(),
        });
        currentHeading = headingMatch[2].trim();
        currentLevel = headingMatch[1].length;
        currentLines = [];
        continue;
      }
    }

    currentLines.push(line);
  }

  // Push the last section
  sections.push({
    heading: currentHeading,
    level: currentLevel,
    content: currentLines.join("\n").trim(),
  });

  return sections;
}

export function parseMarkdown(content: string, filePath: string): ParsedDocument {
  const fileName = filePath.split("/").pop()?.replace(/\.md$/, "") ?? filePath;

  // Extract frontmatter
  const { tags: frontmatterTags, body } = extractFrontmatter(content);

  // Extract inline hashtags from the first non-empty line (Obsidian convention)
  const firstLineEnd = body.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? body : body.slice(0, firstLineEnd);
  const restOfBody = firstLineEnd === -1 ? "" : body.slice(firstLineEnd + 1);

  const { tags: inlineTags, cleaned: firstLineCleaned } = extractHashtags(firstLine);
  const allTags = [...new Set([...frontmatterTags, ...inlineTags])];

  // Reconstruct body without the hashtag line if it was purely tags
  const bodyWithoutTags = firstLineCleaned.trim()
    ? firstLineCleaned + "\n" + restOfBody
    : restOfBody;

  // Split into sections by headings
  const rawSections = splitByHeadings(bodyWithoutTags);

  // Determine document title
  const firstH1 = rawSections.find(s => s.level === 1);
  const title = firstH1?.heading ?? fileName;

  // Build heading hierarchy and produce ParsedSections
  // Track the current heading stack for building paths
  const headingStack: string[] = [];
  const sections: ParsedSection[] = [];

  for (const raw of rawSections) {
    // Skip empty sections with no heading and no content
    if (!raw.heading && !raw.content) continue;

    if (raw.level > 0) {
      // Pop headings at same or deeper level, then push new heading
      headingStack.splice(raw.level - 1);
      headingStack[raw.level - 1] = raw.heading;
    }

    const headingPath = headingStack.filter(Boolean).join(" > ");
    const sectionContent = raw.content;

    if (!sectionContent && !raw.heading) continue;

    // Include the heading in the content so chunks are self-contained
    const contentWithHeading = raw.heading
      ? `${"#".repeat(raw.level)} ${raw.heading}\n\n${sectionContent}`.trim()
      : sectionContent;

    sections.push({
      headingPath,
      headingLevel: raw.level,
      content: contentWithHeading,
      contentClean: cleanForEmbedding(contentWithHeading),
    });
  }

  return { title, tags: allTags, sections };
}
