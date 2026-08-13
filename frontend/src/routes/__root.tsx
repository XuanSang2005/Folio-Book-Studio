import { Outlet, createRootRoute } from "@tanstack/react-router";
import { DemoStoreProvider } from "../lib/demo-store/DemoStore";

export const Route = createRootRoute({
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
  return (
    <DemoStoreProvider>
      <Outlet />
    </DemoStoreProvider>
  );
}
