import type { PropsWithChildren } from "react";
import type { AppView } from "../../lib/presentation";
import { Masthead } from "./Masthead";
import { SiteFooter } from "./SiteFooter";

export function AppChrome({
  view,
  children,
}: PropsWithChildren<{ view: AppView }>) {
  return (
    <div className="folio-app min-h-screen overflow-x-clip">
      <Masthead view={view} />
      {children}
      <SiteFooter />
    </div>
  );
}
