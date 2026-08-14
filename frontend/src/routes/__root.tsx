import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import type { RouterContext } from "../lib/api/route-guards";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  notFoundComponent: () => (
    <main className="grid min-h-screen place-items-center bg-paper px-6 text-center text-ink">
      <div>
        <p className="kicker">FOLIO · PAGE NOT FOUND</p>
        <h1 className="mt-3 font-display text-5xl font-normal">This leaf is not in the volume.</h1>
      </div>
    </main>
  ),
});

function RootComponent() {
  return <Outlet />;
}
