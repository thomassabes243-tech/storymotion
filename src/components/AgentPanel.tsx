"use client";
import { useCallback, useEffect, useState } from "react";
import type { Project } from "../lib/domain";
import type { AgentJob } from "../lib/director/contracts";
import { specialists } from "../lib/director/contracts";
import type { capabilities } from "../lib/director/Capabilities";
type Caps = ReturnType<typeof capabilities>;
const names: Record<string, string> = {
  PENDING: "En cola",
  ANALYZING: "Analizando historia",
  STORYBOARD: "Storyboard para aprobar",
  GENERATING: "Preparando material",
  ANIMATING: "Dirigiendo movimiento",
  RENDERING: "Renderizando",
  QUALITY_CHECK: "Verificando MP4",
  READY_FOR_REVIEW: "Listo para revisar",
  FAILED: "Falló",
  CANCELED: "Cancelado",
};
const agentNames: Record<string, string> = {
  VisualDesignerAgent: "Diseño visual",
  MotionDirectorAgent: "Movimiento",
  StoryContinuityAgent: "Continuidad",
  AudioEngineerAgent: "Audio",
  VideoEditorAgent: "Montaje",
  QualityControlAgent: "Control de calidad",
};
async function request<T>(url: string, body?: unknown) {
  const response = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error || "No se pudo actualizar el director");
  return data as T;
}
export default function AgentPanel({
  project,
  onProjectChanged,
}: {
  project: Project;
  onProjectChanged: () => Promise<void>;
}) {
  const [jobs, setJobs] = useState<AgentJob[]>([]),
    [caps, setCaps] = useState<Caps>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      request<AgentJob[]>(`/api/projects/${project.id}/director`),
      request<Caps>("/api/agent/capabilities"),
    ]);
    setJobs(a);
    setCaps(b);
  }, [project.id]);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    let previous = "";
    async function poll() {
      try {
        const list = await request<AgentJob[]>(
          `/api/projects/${project.id}/director`,
        );
        if (!live) return;
        setJobs(list);
        if (list[0]?.updatedAt !== previous) {
          previous = list[0]?.updatedAt || "";
          if (previous) await onProjectChanged();
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (live) timer = setTimeout(poll, 2000);
      }
    }
    load().catch((e) => {
      if (live) setError(e.message);
    });
    poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [load, project.id, onProjectChanged]);
  async function action(name: string) {
    setBusy(true);
    setError("");
    try {
      const job = jobs[0];
      if (name === "start")
        await request(`/api/projects/${project.id}/director`, {});
      else
        await request(
          `/api/agent-jobs/${job.id}/${name}`,
          name === "approve" ? { revision: project.revision } : {},
        );
      await load();
      await onProjectChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const job = jobs[0],
    active =
      job && !["FAILED", "CANCELED", "READY_FOR_REVIEW"].includes(job.state);
  return (
    <section className="agent-panel" aria-label="Supervisión del director">
      <div className="eyebrow">ACTIONMOTION DIRECTOR</div>
      <h2>Dirige la historia, revisa el resultado.</h2>
      <p>
        Texto, continuidad, material, animación y exportación.{" "}
        {caps?.narrativeEngine === "local_rules"
          ? "Director por reglas locales; sin modelo generativo conectado."
          : "Analizador local configurado; pendiente de comprobar su respuesta."}
      </p>
      <p className="muted">
        Producción local. Llamadas de pago desactivadas. El storyboard requiere
        tu aprobación.
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!active && (
        <button
          className="primary"
          disabled={
            busy ||
            !caps?.agent.enabled ||
            project.config.quality === "cinematic"
          }
          onClick={() => action("start")}
        >
          Planificar con el director
        </button>
      )}
      {job && (
        <>
          <div className="agent-progress">
            <strong role="status">{names[job.state]}</strong>
            <span>{Math.round(job.progress * 100)} %</span>
            <progress value={job.progress} max={1} />
          </div>
          <p>
            {job.currentScene
              ? `Plano ${job.currentScene} de ${project.scenes.length}. `
              : ""}
            {job.error || ""}
          </p>
          {job.waitingApproval && (
            <>
              <p>
                Revisa los planos, personajes y escenarios en el storyboard.
                Aprobar autoriza el render local con el material disponible.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => action("approve")}
              >
                Aprobar storyboard y producir
              </button>
            </>
          )}
          {active && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => action("cancel")}
            >
              Cancelar producción
            </button>
          )}
          {job.state === "FAILED" && (
            <button
              className="secondary"
              disabled={busy || job.attempts >= job.maxAttempts}
              onClick={() => action("retry")}
            >
              Reintentar desde el error
            </button>
          )}
          <div className="agent-modules">
            {specialists.map((agent) => {
              const done = job.events.filter((e) => e.agent === agent).at(-1);
              return (
                <article key={agent}>
                  <strong>{agentNames[agent]}</strong>
                  <p>{done?.message || "Pendiente de intervención."}</p>
                </article>
              );
            })}
          </div>
          {job.state === "READY_FOR_REVIEW" && job.renderJobId && (
            <div className="agent-result">
              <video
                controls
                playsInline
                preload="metadata"
                src={`/api/jobs/${job.renderJobId}/video`}
              />
              <a
                className="primary"
                href={`/api/jobs/${job.renderJobId}/video?download=1`}
              >
                Descargar MP4
              </a>
            </div>
          )}
          {!!job.issues.length && (
            <details>
              <summary>Observaciones de calidad ({job.issues.length})</summary>
              {job.issues.map((i, n) => (
                <p key={n}>
                  {i.sceneId ? `${i.sceneId}: ` : ""}
                  {i.message}
                </p>
              ))}
            </details>
          )}
          <details>
            <summary>Registro de producción</summary>
            {job.events.slice(-30).map((e, n) => (
              <p key={n}>
                <time>{new Date(e.at).toLocaleTimeString()}</time> ·{" "}
                {agentNames[e.agent]}: {e.message}
              </p>
            ))}
          </details>
        </>
      )}
      <details>
        <summary>Motores y capacidades disponibles</summary>
        {caps?.engines.map((e) => (
          <p key={e.id}>
            <strong>{e.id}</strong> ·{" "}
            {e.status === "available"
              ? "Disponible"
              : e.status === "configured_unverified"
                ? "Configurado, sin verificar"
                : "Pendiente"}
            . {e.detail}
          </p>
        ))}
        {caps?.limitations.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </details>
    </section>
  );
}
