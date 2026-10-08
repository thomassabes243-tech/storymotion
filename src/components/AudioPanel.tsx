"use client";
import { useEffect, useState } from "react";
import type { Project } from "../lib/domain";
export default function AudioPanel({
  project,
  busy,
  onSave,
  onMusic,
}: {
  project: Project;
  busy: boolean;
  onSave: (audio: Project["audio"]) => Promise<void>;
  onMusic: (file: File) => Promise<void>;
}) {
  const [audio, setAudio] = useState(project.audio);
  const [available, setAvailable] = useState<boolean>();
  const [voices, setVoices] = useState<Project["audio"]["voice"][]>([]);
  const dirty = JSON.stringify(audio) !== JSON.stringify(project.audio);
  useEffect(() => {
    let live = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        if (live) {
          setAvailable(data.automaticVoice);
          setVoices(
            data.voices || (data.automaticVoice ? ["es_MX-ald-medium"] : []),
          );
        }
      })
      .catch(() => {
        if (live) setAvailable(false);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <form
      className="audio-panel"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(audio);
      }}
    >
      <div className="eyebrow">NARRACIÓN Y MÚSICA</div>
      <h2>Tu historia también se escucha.</h2>
      <p>
        La voz lee la historia completa en español. Al exportar, los planos se
        ajustan a la duración de la narración.
      </p>
      <label>
        Narración
        <select
          value={audio.mode}
          onChange={(e) =>
            setAudio({
              ...audio,
              mode: e.target.value as Project["audio"]["mode"],
            })
          }
        >
          <option value="automatic" disabled={available !== true}>
            Voz automática en español
          </option>
          <option value="off">Sin audio</option>
        </select>
      </label>
      {available === false && (
        <p role="status">
          La voz automática todavía no está disponible en este servidor.
        </p>
      )}
      {audio.mode === "automatic" && (
        <>
          <label>
            Voz
            <select
              value={audio.voice}
              onChange={(e) =>
                setAudio({
                  ...audio,
                  voice: e.target.value as Project["audio"]["voice"],
                  delivery:
                    e.target.value === "es_MX-claude-high"
                      ? "narrator"
                      : "neutral",
                })
              }
            >
              <option
                value="es_MX-claude-high"
                disabled={!voices.includes("es_MX-claude-high")}
              >
                Narrador · español latino
              </option>
              <option
                value="es_MX-ald-medium"
                disabled={!voices.includes("es_MX-ald-medium")}
              >
                Voz original · español mexicano
              </option>
            </select>
          </label>
          <label>
            Forma de narrar
            <select
              value={audio.delivery}
              onChange={(e) =>
                setAudio({
                  ...audio,
                  delivery: e.target.value as Project["audio"]["delivery"],
                })
              }
            >
              <option value="narrator">
                Narrador pausado · pausas entre frases
              </option>
              <option value="neutral">Lectura continua</option>
            </select>
          </label>
          <label>
            Velocidad de la voz
            <select
              value={audio.rate}
              onChange={(e) =>
                setAudio({ ...audio, rate: Number(e.target.value) })
              }
            >
              <option value={0.9}>Pausada</option>
              <option value={1}>Normal</option>
              <option value={1.15}>Ágil</option>
            </select>
          </label>
          <p className="muted">
            La duración objetivo del storyboard es una estimación; la
            exportación conserva toda la narración.
          </p>
        </>
      )}
      <button
        className="primary"
        disabled={
          busy ||
          (audio.mode === "automatic" &&
            (available !== true || !voices.includes(audio.voice)))
        }
      >
        Guardar audio
      </button>
      {dirty && <p role="status">Guarda estos cambios antes de exportar.</p>}
      <hr />
      <label>
        Música de fondo (opcional)
        <input
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac"
          disabled={busy || dirty || project.audio.mode !== "automatic"}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onMusic(file);
            e.target.value = "";
          }}
        />
      </label>
      <p className="muted">
        Hasta 50 MB. Usa música propia o con permiso. Se repetirá durante el
        video y bajará cuando suene la voz.
      </p>
      {project.audio.musicAssetId && (
        <>
          <p role="status">Música guardada en el proyecto.</p>
          <label>
            Volumen de la música
            <input
              type="range"
              min="0"
              max="0.35"
              step="0.01"
              value={audio.musicVolume}
              onChange={(e) =>
                setAudio({ ...audio, musicVolume: Number(e.target.value) })
              }
            />
            <span>{Math.round(audio.musicVolume * 100)} %</span>
          </label>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => onSave({ ...audio, musicAssetId: undefined })}
          >
            Quitar música
          </button>
        </>
      )}
      <p className="muted">
        La narración se genera al exportar y se reutiliza mientras no cambies la
        historia, la voz, la forma de narrar o la velocidad.
      </p>
    </form>
  );
}
