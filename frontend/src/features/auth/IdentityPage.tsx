import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useDemoStore } from "../../lib/demo-store/DemoStore";
import { STEPS } from "../../lib/demo-store/data";
import { validateIdentity } from "../../lib/validation/identity";

export function IdentityPage() {
  const navigate = useNavigate();
  const {
    userName,
    userEmail,
    setView,
    setIdentityDraft,
    setIdentity,
    enterSampleIdentity,
  } = useDemoStore();
  const [identityError, setIdentityError] = useState("");
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setView("identity"), [setView]);

  const nameInvalid = Boolean(identityError && !userName.trim());
  const emailInvalid = Boolean(identityError && !/^\S+@\S+\.\S+$/.test(userEmail.trim()));

  function submitIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateIdentity(userName, userEmail);
    if (validationError === "Enter your full name to continue.") {
      setIdentityError(validationError);
      nameInputRef.current?.focus();
      return;
    }
    if (validationError) {
      setIdentityError(validationError);
      emailInputRef.current?.focus();
      return;
    }
    setIdentityError("");
    setIdentity(userName, userEmail);
    void navigate({ to: "/library" });
  }

  function openSampleLibrary() {
    setIdentityError("");
    enterSampleIdentity();
    void navigate({ to: "/library" });
  }

  return (
    <div className="folio-app min-h-screen overflow-x-clip">
      <main className="login-page">
        <aside className="login-editorial">
          <div className="login-wordmark" aria-label="Gradion Folio">
            <span>GRADION /</span>
            <strong>Folio</strong>
            <small>BOOK ILLUSTRATION STUDIO</small>
          </div>

          <div className="login-story">
            <p className="kicker">FIG. 01 — STUDIO ENTRY</p>
            <h1>
              <span>Return to </span>
              <em>the folio</em>
              <span>.</span>
            </h1>
            <blockquote>
              <p>“The studio remembers every direction, portrait and plate. Return, and the volume continues where you left it.”</p>
              <cite>— EDITORIAL NOTE, VOL. II</cite>
            </blockquote>
            <ol className="login-stage-index" aria-label="Five-stage illustration pipeline">
              {STEPS.map((step) => (
                <li key={step.roman}><b>{step.roman}</b>{step.label}</li>
              ))}
            </ol>
          </div>

          <div className="login-admission-seal" aria-hidden="true">
            <span>STUDIO</span>
            <strong>№ 05</strong>
            <em>est.</em>
            <span>MMXXVI</span>
          </div>
          <div className="login-register-mark register-one" aria-hidden="true"><i /><i /></div>
          <div className="login-register-mark register-two" aria-hidden="true"><i /><i /></div>
        </aside>

        <section className="login-entry">
          <div className="login-entry-inner">
            <p className="kicker">ENTRY FORM · IDENTITY</p>
            <h2>Enter the studio.</h2>
            <p className="login-entry-lede">
              Use your name and email to begin a library or resume an existing volume.
            </p>

            <form className="login-form" onSubmit={submitIdentity} noValidate aria-label="Studio identity">
              <label className="field login-field">
                <span>Full name</span>
                <input
                  ref={nameInputRef}
                  id="studio-name"
                  name="name"
                  value={userName}
                  onChange={(event) => {
                    setIdentityDraft({ userName: event.target.value });
                    setIdentityError("");
                  }}
                  autoComplete="name"
                  placeholder="Xuan Sang"
                  required
                  aria-invalid={nameInvalid}
                  aria-describedby={identityError ? "identity-error" : "login-identity-note"}
                />
              </label>
              <label className="field login-field">
                <span>Email</span>
                <input
                  ref={emailInputRef}
                  id="studio-email"
                  name="email"
                  value={userEmail}
                  onChange={(event) => {
                    setIdentityDraft({ userEmail: event.target.value });
                    setIdentityError("");
                  }}
                  autoComplete="email"
                  type="email"
                  placeholder="you@domain.com"
                  required
                  aria-invalid={emailInvalid}
                  aria-describedby={identityError ? "identity-error" : "login-identity-note"}
                />
              </label>
              {identityError ? (
                <p className="inline-error" id="identity-error" role="alert">{identityError}</p>
              ) : null}
              <button className="primary-button login-submit" type="submit">
                Enter <span aria-hidden="true">→</span>
              </button>
            </form>

            <div className="login-sample">
              <p>Reviewing the prototype?</p>
              <button type="button" onClick={openSampleLibrary}>
                Use the sample library <span aria-hidden="true">↗</span>
              </button>
            </div>
          </div>

          <div className="login-entry-footer" id="login-identity-note">
            <span>PROTOTYPE IDENTITY · NO PASSWORD</span>
            <p>New email addresses create a private, empty library. Returning addresses resume saved work.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
