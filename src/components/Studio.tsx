"use client";
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Clapperboard,
  Plus,
  Settings,
  Folder,
  Image as ImageIcon,
  Film,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Split,
  Combine,
  RefreshCw,
  Download,
  Check,
  Layers,
  ChevronRight,
  LoaderCircle,
  MoreHorizontal,
  Save,
  Upload,
  X,
  Play,
  Clock,
  SlidersHorizontal,
  AlertCircle,
  PanelLeftClose,
  Trash2,
} from "lucide-react";
import {
  defaultConfig,
  defaultSettings,
  cameraMovements,
  transitions,
  totalFrames,
  reflow,
  type Project,
  type Scene,
  type Asset,
  type RenderJob,
  type Config,
} from "../lib/domain";
type Job = Omit<RenderJob, "snapshot">;
type ViewProject = Project & { jobs?: Job[] };
const PreviewPlayer = dynamic(() => import("./PreviewPlayer"), {
  ssr: false,
  loading: () => (
    <div className="player-loading">
      <LoaderCircle className="spin" /> Cargando preview…
    </div>
  ),
});
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "No se pudo completar la operación");
  return data;
}
const time = (seconds: number) => {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
};
const movementNames: Record<string, string> = {
  static: "Cámara fija",
  slow_zoom_in: "Acercamiento suave",
  slow_zoom_out: "Alejamiento suave",
  pan_left: "Paneo a la izquierda",
  pan_right: "Paneo a la derecha",
  pan_up: "Paneo hacia arriba",
  pan_down: "Paneo hacia abajo",
  push_in: "Avance de cámara",
  pull_out: "Retroceso de cámara",
  follow_subject: "Seguir al sujeto",
  camera_shake: "Vibración de cámara",
  dramatic_zoom: "Zoom dramático",
  reveal: "Revelar escenario",
};
const transitionNames: Record<string, string> = {
  hard_cut: "Corte directo",
  fade: "Fundido",
  crossfade: "Fundido cruzado",
  camera_continuation: "Continuidad de cámara",
  match_pan: "Paneo enlazado",
  foreground_wipe: "Barrido de primer plano",
  light_flash: "Destello",
  blur: "Desenfoque",
  zoom: "Zoom",
};
const statusNames: Record<string, string> = {
  READY: "Lista",
  GENERATING: "Generando",
  FAILED: "Falló",
  NEEDS_REVIEW: "Revisar",
  DRAFT: "Borrador",
  PLANNING: "Analizando",
  ASSETS_PENDING: "Assets pendientes",
  ASSETS_READY: "Storyboard listo",
  RENDER_QUEUED: "En cola",
  RENDERING: "Renderizando",
  COMPLETE: "Terminado",
};
const assetKinds: Record<Asset["kind"], string> = {
  background: "Fondo",
  environment: "Entorno",
  character: "Personaje",
  object: "Objeto",
  foreground: "Primer plano",
  particles: "Partículas",
};
function Thumbnail({
  project,
  scene,
  className = "",
}: {
  project: Project;
  scene?: Scene;
  className?: string;
}) {
  const s = scene || project.scenes[0],
    assets = s?.layers
      .filter(
        (l) =>
          ["background", "environment", "character", "foreground"].includes(
            l.kind,
          ) && l.assetId,
      )
      .slice(0, 5);
  return (
    <div className={`thumbnail ${className}`}>
      {assets?.map((l) => (
        <img
          key={l.id}
          src={`/api/assets/${l.assetId}/data`}
          alt=""
          loading="lazy"
          style={{ transform: `scale(${l.scale})`, opacity: l.opacity }}
        />
      ))}
      {!assets?.length && <BookOpen />}
    </div>
  );
}
export function Studio({
  initialId,
  initialPage = "projects",
}: {
  initialId?: string;
  initialPage?: "projects" | "new" | "assets" | "settings";
}) {
  const router = useRouter(),
    [projects, setProjects] = useState<ViewProject[]>([]),
    [project, setProject] = useState<ViewProject>(),
    [page, setPage] = useState<"projects" | "new" | "assets" | "settings">(
      initialPage,
    ),
    [tab, setTab] = useState<
      "storyboard" | "preview" | "characters" | "render"
    >("storyboard"),
    [editing, setEditing] = useState<string>(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [settings, setSettings] = useState(defaultSettings),
    [filter, setFilter] = useState("all");
  const act = useCallback(async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }, []);
  const loadProject = useCallback(async () => {
    if (initialId)
      setProject(await api<ViewProject>(`/api/projects/${initialId}`));
  }, [initialId]);
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const [list, prefs] = await Promise.all([
          api<ViewProject[]>("/api/projects"),
          api<typeof defaultSettings>("/api/settings"),
        ]);
        if (!live) return;
        setSettings(prefs);
        if (!list.length) {
          setBusy("Preparando demostración");
          await api<Project>("/api/demo", { method: "POST" });
          if (live) setProjects(await api<ViewProject[]>("/api/projects"));
          setBusy("");
        } else setProjects(list);
        if (initialId) {
          const p = await api<ViewProject>(`/api/projects/${initialId}`);
          if (live) setProject(p);
        }
      } catch (e) {
        if (live) {
          setError(e instanceof Error ? e.message : String(e));
          setBusy("");
        }
      }
    }
    load();
    return () => {
      live = false;
    };
  }, [initialId]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  function navigate(p: typeof page) {
    setPage(p);
    setEditing(undefined);
    if (initialId) router.push(`/?view=${p}`);
  }
  const title = project
    ? "Storyboard"
    : page === "new"
      ? "Nuevo proyecto"
      : page === "assets"
        ? "Biblioteca de assets"
        : page === "settings"
          ? "Configuración"
          : "Tus proyectos";
  async function sceneAction(scene: Scene, action: string, direction?: string) {
    if (!project) return;
    await act("Actualizando plano", async () => {
      const updated = await api<Project>(
        `/api/projects/${project.id}/scenes/${scene.sceneId}`,
        {
          method: "POST",
          body: JSON.stringify({
            action,
            direction,
            revision: project.revision,
          }),
        },
      );
      setProject(updated);
      setNotice("Storyboard guardado");
    });
  }
  return (
    <div className="studio">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Clapperboard size={23} />
          </span>
          <span>
            Story<span className="brand-light">Motion</span>
            <small>ESTUDIO DE ANIMACIÓN</small>
          </span>
        </Link>
        <div className="workspace-label">TU ESPACIO</div>
        <nav>
          <button
            className={page === "projects" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("projects")}
          >
            <Folder size={19} /> Proyectos
          </button>
          <button
            className={page === "assets" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("assets")}
          >
            <ImageIcon size={19} /> Biblioteca de assets
          </button>
          <button
            className={page === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("settings")}
          >
            <Settings size={19} /> Configuración
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="local-mark">
            <span /> Almacenamiento local
          </div>
          <p>Tus historias, personajes y escenas se guardan en este equipo.</p>
          <div className="version">
            STORYMOTION <span>v0.1</span>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Estudio</span>
            <ChevronRight size={15} />
            <strong>{title}</strong>
          </div>
          <span className="output-pill">
            <Film size={14} /> MP4 · Sin audio
          </span>
        </header>
        <div className="content">
          {error && (
            <div className="alert" role="alert">
              <AlertCircle size={19} />
              <span>{error}</span>
              <button aria-label="Cerrar error" onClick={() => setError("")}>
                <X size={18} />
              </button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              <Check size={17} />
              {notice}
            </div>
          )}
          {initialId && !project ? (
            <div className="loading">
              <LoaderCircle className="spin" /> Cargando proyecto…
            </div>
          ) : project && initialId ? (
            <>
              <div className="project-heading">
                <Link href="/" className="back">
                  <ArrowLeft size={17} /> Proyectos
                </Link>
                <div className="title-row">
                  <div>
                    <div className="eyebrow">HISTORICAL PARCHMENT</div>
                    <h1>{project.name}</h1>
                    <div className="meta">
                      {project.scenes.length} planos <span>·</span>{" "}
                      {time(totalFrames(project.scenes) / project.config.fps)}{" "}
                      <span>·</span> 1080 × 1920 <span>·</span>{" "}
                      {project.config.fps} FPS
                    </div>
                  </div>
                  <button
                    className="primary"
                    onClick={() => setTab("render")}
                    disabled={!project.scenes.length}
                  >
                    <Film size={17} /> Exportar video
                  </button>
                </div>
              </div>
              <div
                className="tabs"
                role="tablist"
                aria-label="Vistas del proyecto"
              >
                {(
                  ["storyboard", "preview", "characters", "render"] as const
                ).map((t) => (
                  <button
                    role="tab"
                    aria-selected={tab === t}
                    className={tab === t ? "selected" : ""}
                    key={t}
                    onClick={() => {
                      setTab(t);
                      setEditing(undefined);
                    }}
                  >
                    {t === "storyboard" ? (
                      <Layers size={17} />
                    ) : t === "preview" ? (
                      <Play size={17} />
                    ) : t === "characters" ? (
                      <BookOpen size={17} />
                    ) : (
                      <Film size={17} />
                    )}
                    {
                      {
                        storyboard: "Storyboard",
                        preview: "Preview",
                        characters: "Personajes",
                        render: "Render",
                      }[t]
                    }
                  </button>
                ))}
                <a
                  href={`/api/projects/${project.id}/json`}
                  className="json-link"
                >
                  JSON <Download size={14} />
                </a>
              </div>
              {!project.scenes.length ? (
                <div className="draft-panel">
                  <BookOpen size={35} />
                  <h2>La historia está lista para analizar</h2>
                  <p className="story-text">{project.story}</p>
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() =>
                      act("Analizando historia", async () => {
                        setProject(
                          await api<Project>(
                            `/api/projects/${project.id}/analyze`,
                            { method: "POST" },
                          ),
                        );
                      })
                    }
                  >
                    {busy ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Layers size={17} />
                    )}{" "}
                    {busy || "Analizar historia"}
                  </button>
                </div>
              ) : tab === "storyboard" ? (
                editing ? (
                  <SceneEditor
                    key={`${editing}:${project.revision}`}
                    project={project}
                    scene={project.scenes.find((s) => s.sceneId === editing)!}
                    busy={busy}
                    act={act}
                    onClose={() => setEditing(undefined)}
                    onSave={(updated) => {
                      setProject(updated);
                      setNotice("Escena guardada");
                    }}
                    onRefresh={loadProject}
                  />
                ) : (
                  <>
                    <div className="section-line">
                      <div>
                        <h2>
                          La historia, plano a plano{" "}
                          <span className="count">{project.scenes.length}</span>
                        </h2>
                        <p>
                          Edita un plano sin rehacer el resto de tu historia.
                        </p>
                      </div>
                      <span className="saved-label">
                        <Check size={15} /> Guardado
                      </span>
                    </div>
                    {project.warnings.length > 0 && (
                      <details className="review-notes">
                        <summary>
                          <SlidersHorizontal size={16} /> Notas de planificación
                          ({project.warnings.length})
                        </summary>
                        {project.warnings.map((w, i) => (
                          <p key={i}>{w}</p>
                        ))}
                      </details>
                    )}
                    <div className="storyboard-grid">
                      {project.scenes.map((scene, i) => (
                        <article className="scene-card" key={scene.sceneId}>
                          <button
                            className="scene-art"
                            onClick={() => setEditing(scene.sceneId)}
                            aria-label={`Editar plano ${i + 1}`}
                          >
                            <Thumbnail project={project} scene={scene} />
                            <span className="shot-number">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span className="duration-chip">
                              <Clock size={12} />
                              {scene.duration.toFixed(1)} s
                            </span>
                            <span className="edit-overlay">Editar plano</span>
                          </button>
                          <div className="scene-info">
                            <div className="scene-type">
                              {
                                {
                                  wide: "PLANO GENERAL",
                                  medium: "PLANO MEDIO",
                                  close: "PRIMER PLANO",
                                  detail: "DETALLE",
                                }[scene.camera.shot]
                              }
                              <span
                                className={`scene-status status-${scene.status.toLowerCase()}`}
                              >
                                {statusNames[scene.status]}
                              </span>
                            </div>
                            <h3>{scene.description}</h3>
                            <p className="source-text">“{scene.sourceText}”</p>
                            <div className="scene-tags">
                              <span>
                                <Clapperboard size={13} />
                                {movementNames[scene.camera.movement]}
                              </span>
                              {scene.characters.map((id) => (
                                <span key={id}>
                                  {project.analysis?.characters.find(
                                    (c) => c.id === id,
                                  )?.name || id}
                                </span>
                              ))}
                            </div>
                            {scene.error && (
                              <p className="error-text">{scene.error}</p>
                            )}
                            <div className="scene-actions">
                              <button onClick={() => setEditing(scene.sceneId)}>
                                <SlidersHorizontal size={15} /> Editar
                              </button>
                              <details>
                                <summary
                                  aria-label={`Acciones de plano ${i + 1}`}
                                >
                                  <MoreHorizontal size={19} />
                                </summary>
                                <div className="action-menu">
                                  <button
                                    disabled={!!busy}
                                    onClick={() =>
                                      sceneAction(scene, "regenerate")
                                    }
                                  >
                                    <RefreshCw size={15} /> Recomponer
                                    placeholders
                                  </button>
                                  <button
                                    disabled={!!busy}
                                    onClick={() => sceneAction(scene, "split")}
                                  >
                                    <Split size={15} /> Dividir plano
                                  </button>
                                  <button
                                    disabled={
                                      !!busy || i === project.scenes.length - 1
                                    }
                                    onClick={() => sceneAction(scene, "merge")}
                                  >
                                    <Combine size={15} /> Unir con siguiente
                                  </button>
                                  <button
                                    disabled={!!busy || i === 0}
                                    onClick={() =>
                                      sceneAction(scene, "move", "up")
                                    }
                                  >
                                    <ArrowUp size={15} /> Mover antes
                                  </button>
                                  <button
                                    disabled={
                                      !!busy || i === project.scenes.length - 1
                                    }
                                    onClick={() =>
                                      sceneAction(scene, "move", "down")
                                    }
                                  >
                                    <ArrowDown size={15} /> Mover después
                                  </button>
                                </div>
                              </details>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="timeline-strip">
                      {project.scenes.map((s, i) => (
                        <button
                          key={s.sceneId}
                          onClick={() => setEditing(s.sceneId)}
                          style={{ flexGrow: s.duration }}
                          title={s.description}
                        >
                          <span>{i + 1}</span>
                          <small>{s.duration.toFixed(1)}s</small>
                        </button>
                      ))}
                    </div>
                  </>
                )
              ) : tab === "preview" ? (
                <div className="preview-layout">
                  <div className="preview-device">
                    <PreviewPlayer project={project} />
                  </div>
                  <div className="preview-info">
                    <div className="eyebrow">SECUENCIA COMPLETA</div>
                    <h2>Tu historia en movimiento</h2>
                    <p>
                      Revisa el ritmo, las capas y las transiciones antes de
                      exportar.
                    </p>
                    <dl>
                      <dt>Duración visual</dt>
                      <dd>
                        {time(totalFrames(project.scenes) / project.config.fps)}
                      </dd>
                      <dt>Formato</dt>
                      <dd>Vertical · 9:16</dd>
                      <dt>Escenas</dt>
                      <dd>{project.scenes.length}</dd>
                      <dt>Audio</dt>
                      <dd>Sin pista de audio</dd>
                    </dl>
                    <button
                      className="primary"
                      onClick={() => setTab("render")}
                    >
                      <Film size={17} /> Preparar render
                    </button>
                    <div className="placeholder-note">
                      Los assets de muestra son ilustraciones provisionales.
                      Puedes reemplazar cada capa con tus PNG, JPG o WebP.
                    </div>
                  </div>
                </div>
              ) : tab === "characters" ? (
                <div className="character-grid">
                  {project.analysis?.characters.map((c) => (
                    <article className="character-card" key={c.id}>
                      <div className="character-art">
                        {project.assets.find((a) => a.characterId === c.id) && (
                          <img
                            src={`/api/assets/${project.assets.find((a) => a.characterId === c.id)!.id}/data`}
                            alt={c.name}
                          />
                        )}
                      </div>
                      <div>
                        <div className="eyebrow">
                          {c.role === "group"
                            ? "GRUPO"
                            : c.role === "main"
                              ? "PRINCIPAL"
                              : "SECUNDARIO"}
                        </div>
                        <h2>{c.name}</h2>
                        <code>{c.id}</code>
                        <p>{c.description}</p>
                        <dl>
                          <dt>Ropa</dt>
                          <dd>{c.appearance.clothing}</dd>
                          <dt>Cabello</dt>
                          <dd>{c.appearance.hair}</dd>
                          <dt>Armas</dt>
                          <dd>
                            {c.appearance.weapons.join(", ") || "Sin definir"}
                          </dd>
                        </dl>
                        <div className="swatches">
                          {c.appearance.colors.map((color) => (
                            <span
                              key={color}
                              style={{ background: color }}
                              title={color}
                            />
                          ))}
                        </div>
                        <p className="muted">
                          Identidad compartida en{" "}
                          {
                            project.scenes.filter((s) =>
                              s.characters.includes(c.id),
                            ).length
                          }{" "}
                          planos.
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <RenderPanel project={project} act={act} busy={busy} />
              )}
            </>
          ) : page === "new" ? (
            <NewProject
              settings={settings}
              busy={busy}
              act={act}
              onBack={() => setPage("projects")}
              onCreated={(p) => router.push(`/projects/${p.id}`)}
            />
          ) : page === "assets" ? (
            <AssetLibrary act={act} busy={busy} />
          ) : page === "settings" ? (
            <SettingsForm
              settings={settings}
              busy={busy}
              onSave={(s) =>
                act("Guardando configuración", async () => {
                  setSettings(
                    await api("/api/settings", {
                      method: "PUT",
                      body: JSON.stringify(s),
                    }),
                  );
                  setNotice("Configuración guardada");
                })
              }
            />
          ) : (
            <>
              <div className="dashboard-heading">
                <div>
                  <div className="eyebrow">ESTUDIO NARRATIVO 2.5D</div>
                  <h1>
                    Tus historias.
                    <br />
                    <span className="muted-title">Ahora en movimiento.</span>
                  </h1>
                  <p>Construye una secuencia visual a partir de tu texto.</p>
                </div>
                <button className="primary" onClick={() => setPage("new")}>
                  <Plus size={19} /> Nuevo proyecto
                </button>
              </div>
              <div className="projects-toolbar">
                <div className="filter-tabs">
                  <button
                    className={filter === "all" ? "selected" : ""}
                    onClick={() => setFilter("all")}
                  >
                    Todos los proyectos <span>{projects.length}</span>
                  </button>
                  <button
                    className={filter === "finished" ? "selected" : ""}
                    onClick={() => setFilter("finished")}
                  >
                    Renders terminados{" "}
                    <span>
                      {
                        projects.filter((p) =>
                          p.jobs?.some((j) => j.state === "COMPLETE"),
                        ).length
                      }
                    </span>
                  </button>
                </div>
                <span className="local-hint">Guardado en este equipo</span>
              </div>
              <div className="projects-grid">
                {projects
                  .filter(
                    (p) =>
                      filter === "all" ||
                      p.jobs?.some((j) => j.state === "COMPLETE"),
                  )
                  .map((p) => (
                    <Link
                      className="project-card"
                      key={p.id}
                      href={`/projects/${p.id}`}
                    >
                      <div className="project-art">
                        <Thumbnail project={p} />
                        <span className="project-style">
                          HISTORICAL PARCHMENT
                        </span>
                        <span className="project-format">9:16</span>
                        {p.jobs?.some((j) => j.state === "COMPLETE") && (
                          <span className="render-badge">
                            <Check size={12} /> MP4 listo
                          </span>
                        )}
                      </div>
                      <div className="project-card-info">
                        <div className="project-state">
                          {statusNames[p.state]}{" "}
                          <span>
                            ·{" "}
                            {new Date(p.updatedAt).toLocaleDateString("es", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>
                        <h2>{p.name}</h2>
                        <p>{p.story}</p>
                        <div className="project-card-footer">
                          <span>
                            <Layers size={14} /> {p.scenes.length} planos
                          </span>
                          <span>
                            <Clock size={14} />{" "}
                            {time(totalFrames(p.scenes) / p.config.fps)}
                          </span>
                          <ChevronRight size={18} />
                        </div>
                      </div>
                    </Link>
                  ))}
                <button
                  className="new-project-card"
                  onClick={() => setPage("new")}
                >
                  <span>
                    <Plus size={27} />
                  </span>
                  <strong>Una nueva historia</strong>
                  <p>Pega tu texto y empieza a construir.</p>
                </button>
              </div>
              <div className="workflow-note">
                <span className="workflow-icon">
                  <BookOpen size={23} />
                </span>
                <div>
                  <strong>Una historia es el punto de partida.</strong>
                  <p>Texto → Storyboard → Capas y movimiento → MP4 sin audio</p>
                </div>
                <span className="workflow-format">
                  1080 × 1920 <span>30 FPS</span>
                </span>
              </div>
            </>
          )}
          {busy && (
            <div className="busy-toast" role="status">
              <LoaderCircle size={17} className="spin" />
              {busy}
            </div>
          )}
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Navegación móvil">
        <button onClick={() => navigate("projects")}>
          <Folder size={20} />
          Proyectos
        </button>
        <button onClick={() => navigate("new")}>
          <Plus size={20} />
          Nuevo
        </button>
        <button onClick={() => navigate("assets")}>
          <ImageIcon size={20} />
          Assets
        </button>
        <button onClick={() => navigate("settings")}>
          <Settings size={20} />
          Ajustes
        </button>
      </nav>
    </div>
  );
}
type Act = (label: string, fn: () => Promise<void>) => Promise<void>;
function NewProject({
  settings,
  busy,
  act,
  onBack,
  onCreated,
}: {
  settings: typeof defaultSettings;
  busy: string;
  act: Act;
  onBack: () => void;
  onCreated: (p: Project) => void;
}) {
  const [name, setName] = useState(""),
    [story, setStory] = useState(""),
    [config, setConfig] = useState<Config>({ ...defaultConfig, settings });
  const words = (story.match(/[\p{L}\p{N}]+/gu) || []).length;
  return (
    <div className="new-project">
      <button className="back" onClick={onBack}>
        <ArrowLeft size={17} /> Proyectos
      </button>
      <div className="eyebrow">NUEVO PROYECTO</div>
      <h1>Empieza con una historia.</h1>
      <p className="intro">
        El texto define las acciones, los personajes y el ritmo visual.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act("Analizando historia y preparando capas", async () => {
            const draft = await api<Project>("/api/projects", {
              method: "POST",
              body: JSON.stringify({ name, story, config }),
            });
            try {
              const p = await api<Project>(
                `/api/projects/${draft.id}/analyze`,
                { method: "POST" },
              );
              onCreated(p);
            } catch (error) {
              onCreated(draft);
              throw error;
            }
          });
        }}
      >
        <label>
          Nombre del proyecto
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Una emboscada al amanecer"
          />
        </label>
        <label>
          Tu historia
          <textarea
            data-testid="story-input"
            required
            minLength={10}
            maxLength={50000}
            rows={9}
            value={story}
            onChange={(e) => setStory(e.target.value)}
            placeholder="Al amanecer, un ejército avanzaba por un valle. Desde las montañas, un arquero observaba…"
          />
        </label>
        <div className="text-counter">
          <span>Solo necesitas tu historia escrita.</span>
          <span>{words} palabras</span>
        </div>
        <div className="form-columns">
          <label>
            Estilo visual
            <select value={config.style} onChange={() => {}}>
              <option value="historical_parchment">Historical Parchment</option>
            </select>
          </label>
          <label>
            Duración
            <select
              value={config.durationMode}
              onChange={(e) =>
                setConfig({
                  ...config,
                  durationMode: e.target.value as Config["durationMode"],
                })
              }
            >
              <option value="auto">
                Automática · {settings.wordsPerMinute} palabras/min
              </option>
              <option value="target">Duración objetivo</option>
            </select>
          </label>
        </div>
        {config.durationMode === "target" ? (
          <div className="duration-field">
            <label htmlFor="target-duration">
              Duración objetivo (segundos)
            </label>
            <div className="duration-presets">
              {[30, 60, 90, 180, 300, 600].map((n) => (
                <button
                  type="button"
                  key={n}
                  className={config.targetDuration === n ? "selected" : ""}
                  onClick={() => setConfig({ ...config, targetDuration: n })}
                >
                  {n < 120 ? `${n} s` : `${n / 60} min`}
                </button>
              ))}
            </div>
            <input
              id="target-duration"
              type="number"
              required
              min={2}
              max={600}
              step={0.1}
              value={config.targetDuration}
              onChange={(e) =>
                setConfig({ ...config, targetDuration: Number(e.target.value) })
              }
            />
          </div>
        ) : (
          <div className="estimate">
            <Clock size={17} /> Duración estimada:{" "}
            {time(Math.max(2, (words / settings.wordsPerMinute) * 60))}
          </div>
        )}
        <div className="form-columns">
          <label>
            Formato
            <select value="vertical" onChange={() => {}}>
              <option value="vertical">Vertical · 1080 × 1920 (9:16)</option>
            </select>
          </label>
          <label>
            Fotogramas por segundo
            <select
              value={config.fps}
              onChange={(e) =>
                setConfig({
                  ...config,
                  fps: Number(e.target.value) as Config["fps"],
                })
              }
            >
              {[24, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n} FPS{n === 30 ? " · Recomendado" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-submit">
          <p>El resultado será un video visual sin audio.</p>
          <button className="primary" disabled={!!busy || words < 3}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Layers size={17} />
            )}{" "}
            Analizar historia
          </button>
        </div>
      </form>
    </div>
  );
}
function SceneEditor({
  project,
  scene,
  busy,
  act,
  onClose,
  onSave,
  onRefresh,
}: {
  project: Project;
  scene: Scene;
  busy: string;
  act: Act;
  onClose: () => void;
  onSave: (p: Project) => void;
  onRefresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Scene>(structuredClone(scene)),
    [layerId, setLayerId] = useState<string | undefined>(scene.layers[0]?.id),
    [assets, setAssets] = useState<Asset[]>(project.assets),
    [dirty, setDirty] = useState(false),
    [provider, setProvider] = useState(false);
  const layer = draft.layers.find((l) => l.id === layerId),
    preview = {
      ...project,
      assets: [
        ...new Map(
          [...project.assets, ...assets].map((a) => [a.id, a]),
        ).values(),
      ],
      scenes: reflow([draft], project.config.fps),
    };
  useEffect(() => {
    api<Asset[]>("/api/assets")
      .then(setAssets)
      .catch(() => {});
    api<{ imageProvider: boolean }>("/api/health")
      .then((r) => setProvider(r.imageProvider))
      .catch(() => {});
  }, []);
  function patch(p: Partial<Scene>) {
    setDirty(true);
    setDraft({
      ...draft,
      ...p,
      status: draft.status === "GENERATING" ? draft.status : "READY",
      error: undefined,
    });
  }
  function patchLayer(p: Partial<Scene["layers"][number]>) {
    patch({
      layers: draft.layers.map((l) => (l.id === layerId ? { ...l, ...p } : l)),
    });
  }
  async function save() {
    await act("Guardando escena", async () => {
      const result = await api<Project>(
        `/api/projects/${project.id}/scenes/${scene.sceneId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ revision: project.revision, scene: draft }),
        },
      );
      onSave(result);
      setDirty(false);
    });
  }
  return (
    <div className="scene-editor">
      <div className="section-line">
        <button
          className="back"
          onClick={() => {
            if (
              !dirty ||
              window.confirm("Hay cambios sin guardar. ¿Salir del editor?")
            )
              onClose();
          }}
        >
          <ArrowLeft size={17} /> Storyboard
        </button>
        <button className="primary" disabled={!!busy || !dirty} onClick={save}>
          <Save size={17} /> Guardar escena
        </button>
      </div>
      <div className="editor-grid">
        <div className="editor-preview">
          <div className="preview-device">
            <PreviewPlayer project={preview} />
          </div>
          <div className="preview-caption">
            Vista previa del plano · {draft.duration.toFixed(1)} s
          </div>
          <div className="layer-list">
            <h3>
              <Layers size={16} /> Capas de la escena
            </h3>
            {draft.layers.map((l, i) => (
              <button
                key={l.id}
                className={layerId === l.id ? "selected" : ""}
                onClick={() => setLayerId(l.id)}
              >
                <span className="layer-index">{i + 1}</span>
                <span>
                  {assetKinds[l.kind]}
                  {l.characterId
                    ? ` · ${project.analysis?.characters.find((c) => c.id === l.characterId)?.name}`
                    : ""}
                </span>
                <small>{l.depth.toFixed(2)}</small>
              </button>
            ))}
            <button
              onClick={() => {
                const id = crypto.randomUUID();
                patch({
                  layers: [
                    ...draft.layers,
                    {
                      id,
                      kind: "object",
                      x: 0,
                      y: 0,
                      scale: 1,
                      rotation: 0,
                      opacity: 1,
                      depth: 0.6,
                      blur: 0,
                      startFrame: 0,
                      endFrame: draft.durationFrames,
                      keyframes: [],
                      poses: [],
                    },
                  ],
                });
                setLayerId(id);
              }}
            >
              <Plus size={16} /> Añadir objeto
            </button>
          </div>
        </div>
        <div className="editor-controls">
          <h2>Editar plano {project.scenes.indexOf(scene) + 1}</h2>
          <label>
            Descripción visual
            <textarea
              rows={3}
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </label>
          <label>
            Duración (segundos)
            <input
              type="number"
              min={0.1}
              max={60}
              step={0.1}
              value={draft.duration}
              onChange={(e) =>
                patch({ duration: Number(e.target.value) || 0.1 })
              }
            />
          </label>
          <div className="control-group">
            <h3>Cámara y transición</h3>
            <div className="form-columns">
              <label>
                Encuadre
                <select
                  value={draft.camera.shot}
                  onChange={(e) =>
                    patch({
                      camera: {
                        ...draft.camera,
                        shot: e.target.value as Scene["camera"]["shot"],
                      },
                    })
                  }
                >
                  <option value="wide">Plano general</option>
                  <option value="medium">Plano medio</option>
                  <option value="close">Primer plano</option>
                  <option value="detail">Detalle</option>
                </select>
              </label>
              <label>
                Movimiento
                <select
                  value={draft.camera.movement}
                  onChange={(e) =>
                    patch({
                      camera: {
                        ...draft.camera,
                        movement: e.target.value as Scene["camera"]["movement"],
                      },
                    })
                  }
                >
                  {cameraMovements.map((m) => (
                    <option value={m} key={m}>
                      {movementNames[m]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Intensidad <span>{draft.camera.intensity.toFixed(1)}</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={draft.camera.intensity}
                onChange={(e) =>
                  patch({
                    camera: {
                      ...draft.camera,
                      intensity: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              Dirección
              <select
                value={draft.camera.direction}
                onChange={(e) =>
                  patch({
                    camera: {
                      ...draft.camera,
                      direction: e.target.value as Scene["camera"]["direction"],
                    },
                  })
                }
              >
                <option value="left_to_right">Izquierda a derecha</option>
                <option value="right_to_left">Derecha a izquierda</option>
                <option value="center">Centro</option>
              </select>
            </label>
            <label>
              Transición de salida
              <select
                value={draft.transitionOut}
                onChange={(e) =>
                  patch({
                    transitionOut: e.target.value as Scene["transitionOut"],
                  })
                }
              >
                {transitions.map((t) => (
                  <option key={t} value={t}>
                    {transitionNames[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={draft.intentionalStill}
                onChange={(e) => patch({ intentionalStill: e.target.checked })}
              />{" "}
              Permitir plano inmóvil por intención narrativa
            </label>
          </div>
          {layer && (
            <div className="control-group">
              <div className="section-line">
                <h3>{assetKinds[layer.kind]} · capa seleccionada</h3>
                <button
                  className="icon-button"
                  aria-label="Eliminar capa"
                  onClick={() => {
                    patch({
                      layers: draft.layers.filter((l) => l.id !== layer.id),
                    });
                    setLayerId(draft.layers.find((l) => l.id !== layer.id)?.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {layer.kind !== "particles" && (
                <>
                  <label>
                    Asset
                    <select
                      value={layer.assetId || ""}
                      onChange={(e) =>
                        patchLayer({
                          assetId: e.target.value || undefined,
                          poses: [],
                        })
                      }
                    >
                      <option value="">Sin asset</option>
                      {assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ·{" "}
                          {a.source === "placeholder"
                            ? "Muestra"
                            : a.source === "upload"
                              ? "Importado"
                              : a.source === "generated"
                                ? "Generado"
                                : "Local"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="upload-button">
                    <Upload size={16} /> Importar imagen
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        act("Importando imagen", async () => {
                          const form = new FormData();
                          form.set("file", file);
                          form.set("kind", layer.kind);
                          const asset = await api<Asset>("/api/assets", {
                            method: "POST",
                            body: form,
                          });
                          setAssets([...assets, asset]);
                          patchLayer({ assetId: asset.id, poses: [] });
                        });
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    className="secondary full"
                    disabled={!!busy || dirty || !provider}
                    title={
                      dirty
                        ? "Guarda primero los cambios"
                        : !provider
                          ? "Configura IMAGE_PROVIDER_URL en el servidor"
                          : ""
                    }
                    onClick={() =>
                      act("Generando asset de esta escena", async () => {
                        try {
                          onSave(
                            await api<Project>(
                              `/api/projects/${project.id}/scenes/${scene.sceneId}`,
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  action: "generate",
                                  kind: layer.kind,
                                  characterId: layer.characterId,
                                  revision: project.revision,
                                }),
                              },
                            ),
                          );
                        } finally {
                          await onRefresh();
                        }
                      })
                    }
                  >
                    <RefreshCw size={15} /> Generar con proveedor
                  </button>
                  {!provider && (
                    <small className="muted">
                      Proveedor externo sin configurar. Puedes importar o usar
                      la biblioteca.
                    </small>
                  )}
                </>
              )}
              <div className="form-columns">
                {(
                  [
                    "x",
                    "y",
                    "scale",
                    "rotation",
                    "depth",
                    "opacity",
                    "blur",
                  ] as const
                ).map((k) => (
                  <label key={k}>
                    {
                      {
                        x: "Posición X",
                        y: "Posición Y",
                        scale: "Escala",
                        rotation: "Rotación",
                        depth: "Profundidad",
                        opacity: "Opacidad",
                        blur: "Desenfoque",
                      }[k]
                    }
                    <input
                      type="number"
                      step={
                        k === "scale" || k === "depth" || k === "opacity"
                          ? 0.05
                          : 1
                      }
                      min={
                        k === "scale"
                          ? 0.01
                          : k === "depth" || k === "opacity" || k === "blur"
                            ? 0
                            : undefined
                      }
                      max={
                        k === "depth" || k === "opacity"
                          ? 1
                          : k === "blur"
                            ? 50
                            : undefined
                      }
                      value={layer[k]}
                      onChange={(e) =>
                        patchLayer({ [k]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                className="secondary full"
                onClick={() =>
                  patchLayer({
                    keyframes: layer.keyframes.length
                      ? []
                      : [
                          { frame: 0, x: layer.x - 120, y: layer.y },
                          {
                            frame:
                              Math.round(draft.duration * project.config.fps) -
                              1,
                            x: layer.x + 120,
                            y: layer.y,
                          },
                        ],
                  })
                }
              >
                {layer.keyframes.length
                  ? "Quitar movimiento de capa"
                  : "Añadir movimiento lineal"}
              </button>
              {layer.poses.length > 0 && (
                <small className="muted">
                  Esta capa intercambia {layer.poses.length} poses durante el
                  plano.
                </small>
              )}
            </div>
          )}
          <div className="scene-source">
            <h3>Fragmento original</h3>
            <p>{scene.sourceText}</p>
            <p className="muted">{scene.continuityNotes.join(" · ")}</p>
          </div>
          <button
            className="primary full"
            disabled={!!busy || !dirty}
            onClick={save}
          >
            <Save size={17} /> Guardar escena
          </button>
        </div>
      </div>
    </div>
  );
}
function RenderPanel({
  project,
  act,
  busy,
}: {
  project: ViewProject;
  act: Act;
  busy: string;
}) {
  const [jobs, setJobs] = useState<Job[]>(project.jobs || []);
  const active = jobs.find((j) =>
      ["RENDERING", "RENDER_QUEUED"].includes(j.state),
    ),
    latest = jobs[0];
  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const p = await api<ViewProject>(`/api/projects/${project.id}`);
        if (live) setJobs(p.jobs || []);
      } catch {}
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [project.id]);
  return (
    <div className="render-layout">
      <div className="render-main">
        <div className="eyebrow">EXPORTAR VIDEO</div>
        <h2>Una secuencia lista para editar.</h2>
        <p>
          MP4 vertical para Shorts, Reels y TikTok. Añade tu narración o música
          después, en el editor que prefieras.
        </p>
        <div className="render-specs">
          <span>1080 × 1920</span>
          <span>H.264</span>
          <span>{project.config.fps} FPS</span>
          <span>Sin audio</span>
        </div>
        {active ? (
          <div className="render-progress">
            <LoaderCircle className="spin" size={30} />
            <h3>{statusNames[active.state]}</h3>
            <div className="progress-label">
              <span>
                {active.currentScene
                  ? `Plano ${active.currentScene} de ${active.sceneCount}`
                  : "Esperando al worker de render"}
              </span>
              <strong>{Math.round(active.progress * 100)} %</strong>
            </div>
            <progress max={1} value={active.progress} />
            <p>El progreso se guarda. Puedes volver a esta pantalla.</p>
          </div>
        ) : (
          <button
            className="primary"
            disabled={!!busy}
            onClick={() =>
              act("Encolando render", async () => {
                const job = await api<Job>(
                  `/api/projects/${project.id}/render`,
                  { method: "POST" },
                );
                setJobs([job, ...jobs.filter((j) => j.id !== job.id)]);
              })
            }
          >
            <Film size={18} />{" "}
            {latest?.state === "COMPLETE"
              ? "Renderizar cambios"
              : "Renderizar MP4"}
          </button>
        )}
        {latest?.state === "FAILED" && (
          <div className="render-error">
            <AlertCircle size={20} />
            <p>{latest.error}</p>
            <button
              className="secondary"
              onClick={() =>
                act("Reintentando render", async () => {
                  const job = await api<Job>(`/api/jobs/${latest.id}/retry`, {
                    method: "POST",
                  });
                  setJobs([job, ...jobs.filter((j) => j.id !== job.id)]);
                })
              }
            >
              <RefreshCw size={15} /> Reintentar
            </button>
          </div>
        )}
        <div className="render-history">
          <h3>Renders del proyecto</h3>
          {!jobs.length && (
            <p className="muted">Tu primera exportación aparecerá aquí.</p>
          )}
          {jobs.map((job) => (
            <div className="render-history-item" key={job.id}>
              <Film size={19} />
              <div>
                <strong>{statusNames[job.state]}</strong>
                <small>{new Date(job.createdAt).toLocaleString("es")}</small>
              </div>
              {job.state === "COMPLETE" && (
                <a
                  href={`/api/jobs/${job.id}/video?download=1`}
                  className="icon-button"
                  aria-label="Descargar MP4"
                >
                  <Download size={19} />
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="render-preview">
        {jobs.find((j) => j.state === "COMPLETE") ? (
          <>
            <video
              controls
              playsInline
              src={`/api/jobs/${jobs.find((j) => j.state === "COMPLETE")!.id}/video`}
            />
            <a
              className="primary full"
              href={`/api/jobs/${jobs.find((j) => j.state === "COMPLETE")!.id}/video?download=1`}
            >
              <Download size={17} /> Descargar MP4
            </a>
            <p>
              <Check size={15} /> Formato y ausencia de audio verificados
            </p>
          </>
        ) : (
          <>
            <Thumbnail project={project} />
            <p>El video terminado aparecerá aquí.</p>
          </>
        )}
      </div>
    </div>
  );
}
function AssetLibrary({ act, busy }: { act: Act; busy: string }) {
  const [assets, setAssets] = useState<Asset[]>([]),
    [kind, setKind] = useState<Asset["kind"]>("background");
  useEffect(() => {
    api<Asset[]>("/api/assets")
      .then(setAssets)
      .catch(() => {});
  }, []);
  return (
    <>
      <div className="title-row">
        <div>
          <div className="eyebrow">RECURSOS REUTILIZABLES</div>
          <h1>Biblioteca de assets</h1>
          <p className="intro">
            Importa una vez. Reutiliza en todas tus escenas.
          </p>
        </div>
      </div>
      <div className="library-upload">
        <label>
          Tipo de asset
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as Asset["kind"])}
          >
            {Object.entries(assetKinds)
              .filter(([k]) => k !== "particles")
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        </label>
        <label className="upload-button">
          <Upload size={17} /> Importar PNG, JPG o WebP
          <input
            disabled={!!busy}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                act("Importando asset", async () => {
                  const form = new FormData();
                  form.set("file", file);
                  form.set("kind", kind);
                  const asset = await api<Asset>("/api/assets", {
                    method: "POST",
                    body: form,
                  });
                  setAssets([asset, ...assets]);
                });
              e.target.value = "";
            }}
          />
        </label>
        <span className="muted">
          Hasta 20 MB · PNG transparente para recortes
        </span>
      </div>
      <div className="asset-grid">
        {assets.map((a) => (
          <article className="asset-card" key={a.id}>
            <div>
              <img
                src={`/api/assets/${a.id}/data`}
                alt={a.name}
                loading="lazy"
              />
            </div>
            <strong>{a.name}</strong>
            <p>
              {assetKinds[a.kind]} ·{" "}
              {a.source === "placeholder"
                ? "Muestra"
                : a.source === "generated"
                  ? "Generado"
                  : "Importado"}
            </p>
          </article>
        ))}
      </div>
    </>
  );
}
function SettingsForm({
  settings,
  busy,
  onSave,
}: {
  settings: typeof defaultSettings;
  busy: string;
  onSave: (s: typeof defaultSettings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  return (
    <div className="settings-panel">
      <div className="eyebrow">PREFERENCIAS DEL ESTUDIO</div>
      <h1>Configura el ritmo.</h1>
      <p className="intro">Estos valores se aplican a los nuevos proyectos.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft);
        }}
      >
        <label>
          Velocidad narrativa (palabras por minuto)
          <input
            type="number"
            required
            min={50}
            max={400}
            value={draft.wordsPerMinute}
            onChange={(e) =>
              setDraft({ ...draft, wordsPerMinute: Number(e.target.value) })
            }
          />
        </label>
        <h3>Duración orientativa de planos</h3>
        {(["fast", "normal", "contemplative"] as const).map((k) => (
          <div className="settings-range" key={k}>
            <strong>
              {
                {
                  fast: "Rápido",
                  normal: "Normal",
                  contemplative: "Contemplativo",
                }[k]
              }
            </strong>
            <label>
              Mínimo (s)
              <input
                type="number"
                min={0.5}
                max={30}
                step={0.5}
                required
                value={draft[k][0]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    [k]: [Number(e.target.value), draft[k][1]],
                  })
                }
              />
            </label>
            <label>
              Máximo (s)
              <input
                type="number"
                min={draft[k][0]}
                max={30}
                step={0.5}
                required
                value={draft[k][1]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    [k]: [draft[k][0], Number(e.target.value)],
                  })
                }
              />
            </label>
          </div>
        ))}
        <button className="primary" disabled={!!busy}>
          <Save size={17} /> Guardar configuración
        </button>
      </form>
    </div>
  );
}
