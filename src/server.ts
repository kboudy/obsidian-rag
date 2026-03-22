import { config } from "./config.ts";
import { queryPipeline } from "./query/pipeline.ts";
import { indexVault } from "./ingestion/pipeline.ts";
import { getAllDocuments } from "./db/documents.ts";
import { getChunkCount } from "./db/chunks.ts";
import { checkHealth } from "./ollama.ts";
import { sql } from "./db/connection.ts";

// @ts-ignore — HTML import, bundled by Bun
import index from "../index.html";

async function handleQuery(req: Request): Promise<Response> {
  let query: string;
  try {
    const body = (await req.json()) as { query?: unknown };
    if (typeof body.query !== "string" || !body.query.trim()) {
      return new Response(JSON.stringify({ error: "query must be a non-empty string" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    query = body.query.trim();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for await (const event of queryPipeline(query)) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

async function handleReindex(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const result = await indexVault({ force: body.force ?? false });
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleStatus(): Promise<Response> {
  const [ollamaHealthy, documents, chunkCount] = await Promise.all([
    checkHealth(),
    getAllDocuments(),
    getChunkCount(),
  ]);

  const lastIndexed = documents.length > 0
    ? documents.reduce((latest, d) => d.indexed_at > latest ? d.indexed_at : latest, documents[0]!.indexed_at)
    : null;

  return new Response(JSON.stringify({
    ollama: ollamaHealthy ? "ok" : "unavailable",
    documents: documents.length,
    chunks: chunkCount,
    lastIndexed,
  }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleListDocuments(): Promise<Response> {
  const documents = await getAllDocuments();
  return new Response(JSON.stringify(documents), {
    headers: { "Content-Type": "application/json" },
  });
}

export function startServer() {
  const server = Bun.serve({
    port: config.port,
    routes: {
      "/": index,
      "/api/query": { POST: handleQuery },
      "/api/index": { POST: handleReindex },
      "/api/status": { GET: handleStatus },
      "/api/documents": { GET: handleListDocuments },
    },
    development: process.env.NODE_ENV !== "production"
      ? { hmr: true, console: true }
      : undefined,
  });

  console.log(`Server running at http://localhost:${server.port}`);
  return server;
}
