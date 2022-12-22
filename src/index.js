import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { SearchProvider } from "./SearchContext";

const rootElement = document.getElementById("root");
const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <SearchProvider>
      <App />
    </SearchProvider>
  </StrictMode>
);
