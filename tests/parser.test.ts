import { test, expect, describe } from "bun:test";
import { parseMarkdown } from "../src/ingestion/parser.ts";

describe("parseMarkdown", () => {
  test("extracts inline hashtags as tags", () => {
    const result = parseMarkdown("#linux #docker\n\n# Title\n\nsome content", "test.md");
    expect(result.tags).toContain("linux");
    expect(result.tags).toContain("docker");
  });

  test("extracts YAML frontmatter tags", () => {
    const md = `---\ntags: [linux, docker]\n---\n\n# Title\n\ncontent`;
    const result = parseMarkdown(md, "test.md");
    expect(result.tags).toContain("linux");
    expect(result.tags).toContain("docker");
  });

  test("deduplicates tags from frontmatter and inline", () => {
    const md = `---\ntags: [linux]\n---\n#linux #docker\n\n# Title`;
    const result = parseMarkdown(md, "test.md");
    expect(result.tags.filter(t => t === "linux").length).toBe(1);
    expect(result.tags).toContain("docker");
  });

  test("uses first H1 as title", () => {
    const result = parseMarkdown("# My Title\n\ncontent", "test.md");
    expect(result.title).toBe("My Title");
  });

  test("falls back to filename as title when no H1", () => {
    const result = parseMarkdown("## Section\n\ncontent", "my-note.md");
    expect(result.title).toBe("my-note");
  });

  test("strips wikilinks [[target]] to target text", () => {
    const result = parseMarkdown("# Note\n\nSee [[bash scripting]] for more.", "test.md");
    const clean = result.sections[0]!.contentClean;
    expect(clean).toContain("bash scripting");
    expect(clean).not.toContain("[[");
  });

  test("strips wikilinks [[target|display]] to display text", () => {
    const result = parseMarkdown("# Note\n\nSee [[bash scripting|bash guide]] here.", "test.md");
    const clean = result.sections[0]!.contentClean;
    expect(clean).toContain("bash guide");
    expect(clean).not.toContain("[[");
  });

  test("strips image references", () => {
    const result = parseMarkdown("# Note\n\n![screenshot](../attachments/img.png)", "test.md");
    const clean = result.sections[0]!.contentClean;
    expect(clean).not.toContain("![");
    expect(clean).not.toContain("attachments");
  });

  test("splits into sections by headings", () => {
    const md = `# Title\n\nIntro text.\n\n## Section A\n\nContent A.\n\n## Section B\n\nContent B.`;
    const result = parseMarkdown(md, "test.md");
    expect(result.sections.length).toBe(3);
  });

  test("builds correct heading paths", () => {
    const md = `# Title\n\n## Navigation\n\n### Basic\n\ncontent`;
    const result = parseMarkdown(md, "test.md");
    const deepSection = result.sections.find(s => s.headingPath.includes("Basic"));
    expect(deepSection?.headingPath).toBe("Title > Navigation > Basic");
  });

  test("does not split inside code blocks", () => {
    const md = `# Note\n\n\`\`\`sh\n# This is a comment, not a heading\necho hello\n\`\`\`\n\nMore content.`;
    const result = parseMarkdown(md, "test.md");
    // Should have one section (the H1), code block should not create a new section
    expect(result.sections.length).toBe(1);
    expect(result.sections[0]!.content).toContain("echo hello");
  });

  test("handles file with no headings as single section", () => {
    const md = `#linux\n\nJust some notes without any headings.\n\nMore notes here.`;
    const result = parseMarkdown(md, "no-headings.md");
    expect(result.sections.length).toBe(1);
    expect(result.tags).toContain("linux");
  });

  test("preserves code block content", () => {
    const md = `# Note\n\n\`\`\`sh\ngit rebase -i HEAD~3\n\`\`\``;
    const result = parseMarkdown(md, "test.md");
    expect(result.sections[0]!.content).toContain("git rebase -i HEAD~3");
  });
});
