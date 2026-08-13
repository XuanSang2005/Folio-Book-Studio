import { useNavigate } from "@tanstack/react-router";
import { useEffect, type PropsWithChildren } from "react";
import { useDemoStore } from "../../lib/demo-store/DemoStore";
import type { View } from "../../lib/demo-store/types";
import { Masthead } from "./Masthead";
import { SiteFooter } from "./SiteFooter";

export function AppChrome({
  view,
  children,
}: PropsWithChildren<{ view: Exclude<View, "identity"> }>) {
  const navigate = useNavigate();
  const { hydrated, signedIn, setView } = useDemoStore();

  useEffect(() => {
    if (!hydrated) return;
    if (!signedIn) {
      void navigate({ to: "/login", replace: true });
      return;
    }
    setView(view);
  }, [hydrated, navigate, setView, signedIn, view]);

  if (!hydrated || !signedIn) return null;

  return (
    <div className="folio-app min-h-screen overflow-x-clip">
      <Masthead view={view} />
      {children}
      <SiteFooter />
    </div>
  );
}
