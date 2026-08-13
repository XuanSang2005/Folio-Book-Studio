import { useNavigate } from "@tanstack/react-router";
import { useDemoStore } from "../../lib/demo-store/DemoStore";
import type { View } from "../../lib/demo-store/types";

export function Masthead({ view }: { view: Exclude<View, "identity"> }) {
  const navigate = useNavigate();
  const { userName, signOut, setView } = useDemoStore();

  function goLibrary() {
    setView("library");
    void navigate({ to: "/library" });
  }

  function goNewVolume() {
    setView("new");
    void navigate({ to: "/volumes/new" });
  }

  function leaveStudio() {
    signOut();
    void navigate({ to: "/login", replace: true });
  }

  return (
    <header className="masthead">
      <button className="wordmark" onClick={goLibrary} aria-label="Go to project library">
        <span className="wordmark-prefix">GRADION /</span>
        <span className="wordmark-title">Folio</span>
      </button>
      <nav className="masthead-nav" aria-label="Primary navigation">
        <button
          className={view === "library" ? "nav-link active" : "nav-link"}
          onClick={goLibrary}
        >
          Library
        </button>
        <button
          className={view === "new" ? "nav-link active" : "nav-link"}
          onClick={goNewVolume}
        >
          New volume
        </button>
      </nav>
      <div className="account-block">
        <span className="account-name">{userName}</span>
        <button className="text-link" onClick={leaveStudio}>Sign out</button>
      </div>
    </header>
  );
}
