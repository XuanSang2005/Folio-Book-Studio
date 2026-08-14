import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AppChrome } from "../../components/layout/AppChrome";
import { projectsQueryOptions, sessionQueryOptions } from "../../lib/api/queries";
import {
  STEPS,
  formatDate,
  projectStatusLabel,
} from "../../lib/presentation";

export function LibraryPage() {
  const navigate = useNavigate();
  const session = useQuery(sessionQueryOptions());
  const projectsQuery = useQuery(projectsQueryOptions());
  const visibleProjects = projectsQuery.data?.projects ?? [];
  const doneCount = visibleProjects.filter((project) => project.status === "done").length;
  const activeCount = visibleProjects.filter((project) => project.status === "in_progress").length;

  function openNewVolume() {
    void navigate({ to: "/volumes/new" });
  }

  function openProject(id: string) {
    void navigate({ to: "/volumes/$volumeId", params: { volumeId: id } });
  }

  return (
    <AppChrome view="library">
      <main className="page-shell library-page mx-auto">
        <section className="library-intro">
          <div className="library-intro-heading">
            <p className="kicker">THE WORKING LIBRARY · {new Date().getFullYear()}</p>
            <h1>Your volumes,<br /><em>in progress.</em></h1>
            <div className="library-intro-action">
              <p>
                Good afternoon, {session.data?.user.name.split(" ")[0]}. Your manuscripts, visual direction,
                cast, and generated plates stay together here.
              </p>
              <button className="primary-button" onClick={openNewVolume}>
                Commission a new volume <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
          <figure className="library-feature-plate">
            <img
              src="/illustrations/riverbank.webp"
              alt="Illustrated Riverbank plate featuring Mole and Ratty beside a blue boat"
              width="486"
              height="976"
              decoding="async"
            />
            <figcaption>PLATE I · THE RIVERBANK</figcaption>
          </figure>
        </section>

        <section className="ledger-summary" aria-label="Library summary">
          <div><span>VOLUMES</span><strong>{String(visibleProjects.length).padStart(2, "0")}</strong></div>
          <div><span>COMPLETE</span><strong>{String(doneCount).padStart(2, "0")}</strong></div>
          <div><span>ACTIVE</span><strong>{String(activeCount).padStart(2, "0")}</strong></div>
          <div><span>PIPELINE</span><strong>V STAGES</strong></div>
        </section>

        {projectsQuery.isPending ? (
          <section className="empty-library" aria-live="polite">
            <div>
              <p className="kicker">OPENING THE LEDGER</p>
              <h2>Loading your volumes…</h2>
              <p>The studio is restoring your private project library.</p>
            </div>
          </section>
        ) : projectsQuery.isError ? (
          <section className="empty-library" role="alert">
            <div>
              <p className="kicker">THE LEDGER COULD NOT OPEN</p>
              <h2>Your library is temporarily unavailable.</h2>
              <p>No project data was changed. Retry the request when you are ready.</p>
              <button className="primary-button" onClick={() => void projectsQuery.refetch()}>
                Retry library <span aria-hidden="true">↻</span>
              </button>
            </div>
          </section>
        ) : visibleProjects.length ? (
          <section className="project-ledger" aria-label="Your projects">
            <div className="ledger-head">
              <span>VOLUME / TITLE</span>
              <span>PROGRESS</span>
              <span>STATUS</span>
              <span aria-hidden="true">OPEN</span>
            </div>
            {visibleProjects.map((project) => (
              <button className="project-row" key={project.id} onClick={() => openProject(project.id)}>
                <span className="project-title-block">
                  <span className="project-thumbnail" aria-hidden="true">
                    <img
                      src="/illustrations/folio-triptych.webp"
                      alt=""
                      width="490"
                      height="976"
                      loading="lazy"
                      decoding="async"
                    />
                    <span>VOL. {String(project.volumeNumber).padStart(2, "0")}</span>
                  </span>
                  <span>
                    <strong>{project.title}</strong>
                    <small>
                      Created {formatDate(project.createdAt)} · {project.sourceWordCount.toLocaleString()} words
                    </small>
                  </span>
                </span>
                <span className="project-progress-block">
                  <span className="progress-fraction">
                    {String(project.completedStepCount).padStart(2, "0")} / {String(project.totalStepCount).padStart(2, "0")}
                  </span>
                  <span
                    className="progress-rule"
                    aria-label={`${project.completedStepCount} of ${project.totalStepCount} stages complete`}
                  >
                    {STEPS.map((step, index) => (
                      <i key={step.roman} className={index < project.completedStepCount ? "filled" : ""} />
                    ))}
                  </span>
                  <small>
                    {project.completedStepCount === project.totalStepCount
                      ? "Final plate complete"
                      : `${STEPS[project.completedStepCount]?.label ?? "Stage"} ${project.completedStepCount ? "is next" : "awaits"}`}
                  </small>
                </span>
                <span
                  className={`status-stamp status-${projectStatusLabel(project.status).toLowerCase().replace(" ", "-")}`}
                >
                  {projectStatusLabel(project.status)}
                </span>
                <span className="row-arrow" aria-hidden="true">↗</span>
              </button>
            ))}
          </section>
        ) : (
          <section className="empty-library">
            <figure className="empty-plate" aria-hidden="true">
              <img
                src="/illustrations/folio-triptych.webp"
                alt=""
                width="1536"
                height="1024"
                loading="lazy"
                decoding="async"
              />
            </figure>
            <div>
              <p className="kicker">THE SHELVES ARE WAITING</p>
              <h2>Your first volume begins with a manuscript.</h2>
              <p>
                Paste the text or upload a plain-text file. The studio will preserve every stage
                from art direction to final plate.
              </p>
              <button className="primary-button" onClick={openNewVolume}>
                Create your first volume <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        )}

      </main>
    </AppChrome>
  );
}
