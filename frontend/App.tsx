import React from "react";
import { createRoot } from "react-dom/client";
import { SearchView } from "./SearchView.tsx";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
root.render(<SearchView />);
