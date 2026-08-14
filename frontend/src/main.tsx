import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/geist/wght-italic.css";
import "@fontsource-variable/geist-mono/wght.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import { createAppQueryClient } from "./lib/api/query-client";
import "./styles/globals.css";

let navigateAfterSessionExpiry: () => void | Promise<void> = () => undefined;
export const queryClient = createAppQueryClient({
  onSessionExpired: () => navigateAfterSessionExpiry(),
});

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  scrollRestoration: true,
});

navigateAfterSessionExpiry = () => {
  if (router.state.location.pathname === "/login") return;
  return router.navigate({ to: "/login", replace: true });
};

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
