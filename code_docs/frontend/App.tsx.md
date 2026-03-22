# `frontend/App.tsx` — React Root

[View source](../../frontend/App.tsx)

## Purpose

Minimal React entrypoint. Mounts the React application into the `#root` DOM element defined in `index.html` and renders `SearchView`.

## Implementation

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { SearchView } from "./SearchView.tsx";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
root.render(<SearchView />);
```

`styles.css` is imported here so Bun's CSS bundler picks it up and injects it into the page. All application state lives in `SearchView` — `App.tsx` is intentionally minimal.

## Bun HTML import

This file is referenced from `index.html` as:

```html
<script type="module" src="./frontend/App.tsx"></script>
```

Bun's bundler processes this at request time (in development with HMR) or at build time: it transpiles TSX, bundles all imports, and tree-shakes unused code. No `vite.config.ts` or `webpack.config.js` needed.
