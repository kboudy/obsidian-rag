import { test, expect, describe } from "bun:test";
import { chunkSections } from "../src/ingestion/chunker.ts";
import type { ParsedSection } from "../src/ingestion/parser.ts";

function makeSection(content: string, headingPath = "Test"): ParsedSection {
  return { headingPath, headingLevel: 1, content, contentClean: content };
}

describe("chunkSections", () => {
  test("small section stays as one chunk", () => {
    const sections = [makeSection("Short content.", "Title")];
    const chunks = chunkSections(sections, 500, 50);
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.content).toBe("Short content.");
  });

  test("large section is split into multiple chunks", () => {
    // Create a section with ~2500 chars (625+ tokens)
    const para = "This is a paragraph with some content. ".repeat(10);
    const bigContent = Array.from({ length: 8 }, (_, i) => `Paragraph ${i + 1}:\n${para}`).join("\n\n");
    const sections = [makeSection(bigContent)];
    const chunks = chunkSections(sections, 200, 20);
    expect(chunks.length).toBeGreaterThan(1);
  });

  test("heading path is preserved on all chunks", () => {
    const para = "Word ".repeat(200); // ~200 tokens per para
    const bigContent = [1, 2, 3, 4].map(i => `Para ${i}:\n${para}`).join("\n\n");
    const sections = [makeSection(bigContent, "Root > Section")];
    const chunks = chunkSections(sections, 300, 50);
    for (const chunk of chunks) {
      expect(chunk.headingPath).toBe("Root > Section");
    }
  });

  test("chunk indices are sequential", () => {
    const sections = [
      makeSection("Content one.", "Section 1"),
      makeSection("Content two.", "Section 2"),
      makeSection("Content three.", "Section 3"),
    ];
    const chunks = chunkSections(sections, 500, 50);
    expect(chunks.map(c => c.chunkIndex)).toEqual([0, 1, 2]);
  });

  test("token count is reasonable", () => {
    const content = "Hello world this is a test. ".repeat(20); // ~140 tokens
    const chunks = chunkSections([makeSection(content)], 500, 50);
    expect(chunks[0]!.tokenCount).toBeGreaterThan(50);
    expect(chunks[0]!.tokenCount).toBeLessThan(300);
  });

  test("multiple sections each become chunks", () => {
    const sections: ParsedSection[] = [
      makeSection("# Sec 1\n\nContent.", "Sec 1"),
      makeSection("# Sec 2\n\nContent.", "Sec 2"),
      makeSection("# Sec 3\n\nContent.", "Sec 3"),
    ];
    const chunks = chunkSections(sections, 500, 50);
    expect(chunks.length).toBe(3);
  });
});
