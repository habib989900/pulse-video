import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@fontsource/archivo/500.css";
import "@fontsource/archivo/600.css";
import "@fontsource/archivo/700.css";
import "@fontsource/archivo/800.css";
import "@fontsource/archivo/900.css";
import "./theme.css";

const rootEl = document.querySelector<HTMLElement>("[data-generated-space-root]");
if (!rootEl) {
  throw new Error("missing generated space root element");
}

// Vercel port: the Muse version shared the SDK's QueryClient; here the
// app owns a plain one. Mutations already invalidate their own query
// keys in onSuccess (see App.tsx), so no server-driven invalidation
// is needed.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /* Admin/site data changes rarely and refetching it on every
         focus/tab switch re-downloaded a ~233 KB payload each time. */
      staleTime: 60_000,
      retry: 1,
    },
  },
});

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <div className="hatch-space-root" data-hatch-space-root>
        <App />
      </div>
    </QueryClientProvider>
  </StrictMode>,
);
