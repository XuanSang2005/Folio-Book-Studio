import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { endSession } from "../../lib/api/client";
import { sessionQueryOptions } from "../../lib/api/queries";
import type { AppView } from "../../lib/presentation";

export function Masthead({ view }: { view: AppView }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useQuery(sessionQueryOptions());
  const signOut = useMutation({
    mutationFn: endSession,
    retry: false,
    onSuccess: () => {
      queryClient.clear();
      void navigate({ to: "/login", replace: true });
    },
  });

  function goLibrary() {
    void navigate({ to: "/library" });
  }

  function goNewVolume() {
    void navigate({ to: "/volumes/new" });
  }

  function leaveStudio() {
    signOut.mutate();
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
        <span className="account-name">{session.data?.user.name ?? ""}</span>
        <button className="text-link" onClick={leaveStudio} disabled={signOut.isPending}>Sign out</button>
        {signOut.isError ? (
          <span className="account-signout-error" role="alert">
            Sign out failed. Try again.
          </span>
        ) : null}
      </div>
    </header>
  );
}
