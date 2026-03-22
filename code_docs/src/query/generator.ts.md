# `src/query/generator.ts` — Answer Generator

[View source](../../../src/query/generator.ts)

## Purpose

Constructs the RAG prompt from the reranked context chunks and streams the LLM's answer via Ollama.

## `generate(query, contexts): AsyncGenerator<string>`

An async generator that yields text fragments as they stream from Ollama. Delegates to `ollama.chat()`.

```ts
export async function* generate(query: string, contexts: RerankResult[]): AsyncGenerator<string> {
  const prompt = buildPrompt(query, contexts);
  yield* chat([{ role: "user", content: prompt }]);
}
```

`yield*` delegates iteration — every text fragment yielded by `chat()` is immediately re-yielded here, so the caller sees a seamless stream.

## Prompt construction

```ts
function buildPrompt(query: string, contexts: RerankResult[]): string
```

The prompt follows a standard RAG pattern:

```
You are a helpful assistant that answers questions based on the user's personal
knowledge base (an Obsidian vault).

Use the following context passages to answer the question. When referencing
information, mention the source note name. If the answer isn't in the provided
context, say so honestly — don't make things up.

--- Context ---

[Source: bash scripting.md > .bash_profile vs .bashrc]
## .bash_profile vs .bashrc

The difference between .bash_profile and .bashrc is...

---

[Source: git notes.md > rebasing]
## rebasing

git rebase -i HEAD~3 lets you interactively...

--- End Context ---

Question: how do I squash commits?
```

Each context block is labelled with `[Source: filename > headingPath]` so the model can attribute answers to specific notes.

### Why "don't make things up"?

The model is explicitly instructed to acknowledge when the context doesn't contain an answer. Without this, models tend to hallucinate plausible-sounding but incorrect information — especially problematic for a personal knowledge base where you need to trust the answers.
