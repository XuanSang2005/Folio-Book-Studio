import { useNavigate } from "@tanstack/react-router";
import { AppChrome } from "../../components/layout/AppChrome";
import { useDemoStore } from "../../lib/demo-store/DemoStore";
import {
  STEPS,
  formatDate,
  projectPlateSrc,
  projectStatus,
  wordCount,
} from "../../lib/demo-store/data";

export function LibraryPage() {
  const navigate = useNavigate();
  const {
    userName,
    userEmail,
    projects,
    emptyLibrary,
    setEmptyLibrary,
    setView,
    setActiveProjectId,
  } = useDemoStore();
  const visibleProjects = emptyLibrary
    ? []
    : projects.filter((project) => project.ownerEmail === userEmail.trim().toLowerCase());
  const doneCount = visibleProjects.filter((project) => project.completedSteps === 5).length;
  const activeCount = visibleProjects.filter(
    (project) => project.completedSteps > 0 && project.completedSteps < 5,
  ).length;

  function openNewVolume() {
    setView("new");
    void navigate({ to: "/volumes/new" });
  }

  function openProject(id: string) {
    setActiveProjectId(id);
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
                Good afternoon, {userName.split(" ")[0]}. Your manuscripts, visual direction,
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

        {visibleProjects.length ? (
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
                      src={projectPlateSrc(project)}
                      alt=""
                      width="490"
                      height="976"
                      loading="lazy"
                      decoding="async"
                    />
                    <span>{project.volume}</span>
                  </span>
                  <span>
                    <strong>{project.title}</strong>
                    <small>
                      Created {formatDate(project.createdAt)} · {wordCount(project.bookText).toLocaleString()} words
                    </small>
                  </span>
                </span>
                <span className="project-progress-block">
                  <span className="progress-fraction">
                    {String(project.completedSteps).padStart(2, "0")} / 05
                  </span>
                  <span
                    className="progress-rule"
                    aria-label={`${project.completedSteps} of 5 stages complete`}
                  >
                    {STEPS.map((step, index) => (
                      <i key={step.roman} className={index < project.completedSteps ? "filled" : ""} />
                    ))}
                  </span>
                  <small>
                    {project.completedSteps === 5
                      ? "Final plate complete"
                      : `${STEPS[project.completedSteps].label} ${project.completedSteps ? "is next" : "awaits"}`}
                  </small>
                </span>
                <span
                  className={`status-stamp status-${projectStatus(project).toLowerCase().replace(" ", "-")}`}
                >
                  {projectStatus(project)}
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

        <div className="specimen-switch">
          <span>PROTOTYPE SPECIMEN</span>
          <button className="text-link" onClick={() => setEmptyLibrary((current) => !current)}>
            {emptyLibrary ? "Restore sample library" : "View empty state"}
          </button>
        </div>
      </main>
    </AppChrome>
  );
}
