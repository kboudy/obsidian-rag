import React from "react";
import type { SourceInfo } from "../src/query/pipeline.ts";

function scoreClass(score: number): string {
  if (score >= 0.7) return "score-high";
  if (score >= 0.4) return "score-mid";
  return "score-low";
}

export function SourceCard({ source }: { source: SourceInfo }) {
  return (
    <div className="source-card">
      <div className="source-card-header">
        <span className="source-file-name">{source.fileName.replace(/\.md$/, "")}</span>
        <span className={`source-score ${scoreClass(source.relevanceScore)}`}>
          {(source.relevanceScore * 100).toFixed(0)}%
        </span>
      </div>

      {source.headingPath && (
        <div className="source-heading">{source.headingPath}</div>
      )}

      <div className="source-preview">{source.preview}</div>

      {source.tags.length > 0 && (
        <div className="source-tags">
          {source.tags.map(tag => (
            <span key={tag} className="tag">#{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}
