# `src/db/connection.ts` — Database Connection

[View source](../../../src/db/connection.ts)

## Purpose

Creates and exports a single `Bun.sql` instance shared across the entire application.

## Implementation

```ts
import { SQL } from "bun";
import { config } from "../config.ts";

export const sql = new SQL(config.postgresUrl);
```

`SQL` is Bun's built-in PostgreSQL client. Passing a connection URL to the constructor sets up an internal connection pool automatically.

## Why a singleton?

Bun's `SQL` manages a pool of connections internally. Importing the same `sql` instance everywhere means:
- All queries share the same pool — no connection overhead per query
- Transactions (`sql.begin()`) acquire a dedicated connection from the pool for their duration
- A single `.close()` call shuts down all connections cleanly

## Connection URL format

The URL stored in `POSTGRES_URL` uses the standard `postgres://` scheme:

```
postgres://keith:<password>@localhost:5432/obsidian_rag
```

Special characters in the password must be percent-encoded (e.g. `&` → `%26`).

## Usage pattern

Every other module that needs the database imports `sql` from this file:

```ts
import { sql } from "../db/connection.ts";

const rows = await sql`SELECT * FROM documents WHERE id = ${id}`;
```

Bun's tagged template literal syntax automatically parameterizes values, preventing SQL injection.
