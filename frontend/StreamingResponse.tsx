import React from "react";

interface Props {
  text: string;
  streaming: boolean;
}

// Minimal inline markdown renderer: bold, inline code, fenced code blocks
function renderMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = text.split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      nodes.push(
        <pre key={key++}>
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      i++; // skip closing ```
      continue;
    }

    // Regular line — render inline formatting
    nodes.push(<p key={key++}>{renderInline(line)}</p>);
    i++;
  }

  return nodes;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match **bold** or `code`
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let k = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[0]!.startsWith("**")) {
      parts.push(<strong key={k++}>{match[2]}</strong>);
    } else {
      parts.push(<code key={k++}>{match[3]}</code>);
    }
    last = match.index + match[0]!.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function StreamingResponse({ text, streaming }: Props) {
  return (
    <div className="answer-box">
      {text ? renderMarkdown(text) : null}
      {streaming && <span className="cursor" />}
    </div>
  );
}
