import { sql } from "./connection.ts";

export interface DocumentRecord {
  id: number;
  file_path: string;
  file_name: string;
  content_hash: string;
  mtime: Date;
  tags: string[];
  indexed_at: Date;
}

export async function upsertDocument(doc: Omit<DocumentRecord, "id" | "indexed_at">): Promise<number> {
  const [row] = await sql`
    INSERT INTO documents (file_path, file_name, content_hash, mtime, tags)
    VALUES (${doc.file_path}, ${doc.file_name}, ${doc.content_hash}, ${doc.mtime}, ${sql.array(doc.tags)})
    ON CONFLICT (file_path) DO UPDATE SET
      file_name    = EXCLUDED.file_name,
      content_hash = EXCLUDED.content_hash,
      mtime        = EXCLUDED.mtime,
      tags         = EXCLUDED.tags,
      indexed_at   = NOW()
    RETURNING id
  `;
  return (row as { id: number }).id;
}

export async function getDocumentByPath(filePath: string): Promise<DocumentRecord | null> {
  const rows = await sql`
    SELECT * FROM documents WHERE file_path = ${filePath}
  `;
  return (rows[0] as DocumentRecord | undefined) ?? null;
}

export async function getAllDocuments(): Promise<DocumentRecord[]> {
  return sql`SELECT * FROM documents ORDER BY file_path` as unknown as Promise<DocumentRecord[]>;
}

export async function deleteDocument(id: number): Promise<void> {
  await sql`DELETE FROM documents WHERE id = ${id}`;
}

export async function getAllDocumentPaths(): Promise<string[]> {
  const rows = await sql`SELECT file_path FROM documents`;
  return (rows as { file_path: string }[]).map(r => r.file_path);
}
