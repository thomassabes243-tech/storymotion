import React from "react";
import { AbsoluteFill, Img } from "remotion";
import type { Character, Project, Scene } from "../../lib/domain";
import { cameraMotion, smooth } from "../../lib/animation/CameraMotion";
import { parallax } from "../../lib/animation/Parallax";
import { illustratedMotion } from "../../lib/animation/IllustratedMotion";

function Person({
  character,
  frame,
  frames,
  fps,
  pose,
  x,
  y,
  scale,
  facing = 1,
  shadow = false,
}: {
  character: Character;
  frame: number;
  frames: number;
  fps: number;
  pose: string;
  x: number;
  y: number;
  scale: number;
  facing?: number;
  shadow?: boolean;
}) {
  const m = illustratedMotion(frame, fps, frames, pose, x / 300);
  const jesus = character.id === "jesus",
    judas = character.id === "judas",
    guard = character.id === "guards";
  const robe = character.appearance.colors[0],
    mantle = character.appearance.colors[1] || "#725345";
  const skin = jesus ? "#bf9872" : judas ? "#b68c68" : "#b99170",
    hair = jesus ? "#4a3027" : "#302a25";
  const dark = "#372f2b";
  return (
    <g
      transform={`translate(${x + m.travel} ${y + m.breath}) scale(${scale * facing} ${scale})`}
      opacity={shadow ? 0.75 : 1}
      style={shadow ? { filter: "brightness(.16)" } : undefined}
    >
      <g
        stroke={dark}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={robe}
      >
        <ellipse
          cx="8"
          cy="362"
          rx="94"
          ry="18"
          fill="#111c21"
          opacity=".3"
          stroke="none"
        />
        <g transform={`rotate(${m.legs} -25 190)`}>
          <path
            d="M-25 180v160l-35 5"
            fill="none"
            stroke="#695348"
            strokeWidth="24"
          />
          <path d="M-60 345h50" stroke="#322d28" strokeWidth="13" />
        </g>
        <g transform={`rotate(${-m.legs} 30 190)`}>
          <path
            d="M30 180v160l35 5"
            fill="none"
            stroke="#695348"
            strokeWidth="24"
          />
          <path d="M18 345h54" stroke="#322d28" strokeWidth="13" />
        </g>
        <path
          d={`M-66-35Q-86 130 ${-92 + m.cloth} 304Q0 335 ${88 - m.cloth} 304L68-35Q0-65-66-35Z`}
          fill={robe}
        />
        <path
          d="M-38 40q-12 120-28 245M-7 50l-8 260M25 40q12 160 30 270"
          fill="none"
          stroke={mantle}
          strokeOpacity=".35"
          strokeWidth="3"
        />
        <path
          d={`M-64-36Q-105 110 ${-109 + m.cloth} 279L-57 300Q-48 147 4-48Z`}
          fill={mantle}
        />
        <path
          d="M-92 58q-4 93-7 175M-70 28l-15 225"
          fill="none"
          stroke="#f1d9af"
          strokeOpacity=".18"
        />
        <path
          d="M-57 102q60 22 118 0"
          fill="none"
          stroke="#65503f"
          strokeWidth="9"
        />
        <g transform={`rotate(${m.shoulder} 53 -9)`}>
          <path
            d="M53-9q53 50 53 105"
            fill="none"
            stroke={robe}
            strokeWidth="33"
          />
          <g transform={`rotate(${m.elbow} 106 92)`}>
            <path d="M106 92l-11 57" stroke={skin} strokeWidth="22" />
            <ellipse cx="93" cy="159" rx="12" ry="20" fill={skin} />
            <path
              d="M87 147v18m7-18v18m6-15v16"
              fill="none"
              stroke="#805f49"
              strokeWidth="1.4"
            />
          </g>
        </g>
        <g transform={`rotate(${-m.shoulder * 0.6} -53 -9)`}>
          <path
            d="M-53-9q-35 40-38 95"
            fill="none"
            stroke={mantle}
            strokeWidth="32"
          />
          <path d="M-91 82l11 63" fill="none" stroke={skin} strokeWidth="21" />
          <ellipse cx="-76" cy="154" rx="12" ry="19" fill={skin} />
        </g>
        <g transform={`rotate(${m.head} 0 -52)`}>
          {judas && pose === "kiss" ? (
            <>
              <path d="M-16-59v27q17 14 35 0v-35" fill={skin} />
              <path
                d="M-42-131q3-47 44-44q38 7 36 41l-10 13-43-6Z"
                fill={hair}
              />
              <path
                d="M-32-135q23-26 51-9q17 12 15 28l25 16-22 8-1 27q-13 25-42 16q-28-11-28-49Z"
                fill={skin}
              />
              <path
                d="M-34-94q3 34 32 46q26 9 38-17l-2-17-15 7q-23 8-38-14Z"
                fill={hair}
              />
              <path
                d="M-36-132q0-48 36-48q32 1 40 34l-12 16q-16-28-44-8Z"
                fill={hair}
              />
              <ellipse cx="-19" cy="-109" rx="9" ry="14" fill={skin} />
              <path
                d="M8-118q12-4 21 1M11-108h15M30-83l11 1"
                fill="none"
                stroke="#3a2c27"
                strokeWidth="2.6"
              />
              <ellipse cx="21" cy="-108" rx="3" ry="3" fill="#29231f" />
            </>
          ) : (
            <>
              <path
                d={
                  jesus
                    ? "M-54-107q-3-81 57-81q56 6 53 84l10 97-35-15H-52Z"
                    : "M-53-107q-5-84 57-78q55 5 48 93l-19-28-64 3Z"
                }
                fill={hair}
              />
              <path d="M-16-59v27q17 14 35 0v-35" fill={skin} />
              <ellipse cx="-44" cy="-103" rx="10" ry="17" fill={skin} />
              <ellipse cx="45" cy="-103" rx="9" ry="17" fill={skin} />
              <path
                d="M-41-134q4-29 40-32q41 3 42 32v48q-7 49-41 51q-35-3-42-51Z"
                fill={skin}
              />
              <path
                d="M-42-132q3-53 43-47q35 1 43 41q-20-5-33-24q-10 17-53 30Z"
                fill={hair}
              />
              <path
                d="M-38-85q8 38 39 46q31-7 40-44l-11 6q-28 23-58-2Z"
                fill={hair}
              />
              <path
                d="M-28-117q10-7 22-1m18 0q11-6 22 1"
                fill="none"
                stroke={hair}
                strokeWidth="4"
              />
              <path
                d="M-27-108q10-4 19 0m20 0q10-4 19 0"
                fill="none"
                stroke="#382c27"
                strokeWidth="2.8"
              />
              <ellipse cx="-17" cy="-108" rx="3" ry="3.2" fill="#2a2623" />
              <ellipse cx="22" cy="-108" rx="3" ry="3.2" fill="#2a2623" />
              <path
                d="M3-107l-5 21q7 4 12-1M-9-72q13 -1 24-1"
                fill="none"
                stroke="#85614c"
                strokeWidth="2"
              />
              <path
                d="M-34-101q3 12 10 15M30-101q-2 9-8 14"
                fill="none"
                stroke="#deb389"
                strokeOpacity=".4"
              />
              {guard && (
                <>
                  <path
                    d="M-51-126q-2-62 52-63q54 6 51 63H-51Z"
                    fill="#9a7b51"
                  />
                  <path
                    d="M-53-121h106M2-182v59"
                    stroke="#c0a678"
                    strokeWidth="7"
                  />
                </>
              )}
            </>
          )}
        </g>
        {guard && (
          <>
            <path d="M130-280v550" stroke="#73583e" strokeWidth="8" />
            <path d="M130-320l-12 44h24Z" fill="#a9a29a" />
          </>
        )}
      </g>
    </g>
  );
}
function Candle({
  x,
  y,
  t,
  large = false,
}: {
  x: number;
  y: number;
  t: number;
  large?: boolean;
}) {
  const flicker = Math.sin(t * 3.7 + x) * 0.06 + Math.sin(t * 5.1) * 0.025;
  return (
    <g transform={`translate(${x} ${y}) scale(${large ? 1.5 : 1})`}>
      <ellipse
        cy="-34"
        rx="150"
        ry="220"
        fill="#f3be69"
        opacity={0.035 + flicker * 0.15}
      />
      <path
        d="M-8 0h16v45h-16Z"
        fill="#d2b681"
        stroke="#493a2c"
        strokeWidth="2"
      />
      <path
        d={`M0-44Q${-15 + flicker * 35}-22 0 0Q${18 + flicker * 32}-19 0-44Z`}
        fill="#f4d98b"
      />
      <path d="M0-27q-7 17 0 24q8-9 0-24" fill="#fff0b9" />
      <path d="M-30 46h60l10 12h-80Z" fill="#a18b59" />
    </g>
  );
}
function Hands({
  progress,
  coins,
  robe,
}: {
  progress: number;
  coins: boolean;
  robe: string;
}) {
  return (
    <g
      transform={`translate(540 1080) scale(${coins ? 2.2 : 2.5})`}
      stroke="#5b4234"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M-220 87l126-57 43 43-133 75Z" fill={robe} />
      <g
        transform={`translate(${smooth(progress) * 14} ${-smooth(progress) * 9})`}
      >
        <path
          d="M-95 43q40-28 74-30l36-1q18 6 1 15l-22 5 49-5q21 5 5 12l-48 9 40 1q18 8 0 13l-51 4 31 6q12 10-1 13l-49-4-42 16Z"
          fill="#bb9370"
        />
        <path
          d="M-30 35l34-4m-39 18 36-1m-34 13 28 6"
          fill="none"
          stroke="#936a50"
          strokeWidth="1.5"
        />
      </g>
      {coins ? (
        Array.from({ length: 9 }, (_, i) => (
          <g
            key={i}
            transform={`translate(${(i % 3) * 23 - 12} ${Math.floor(i / 3) * 13 + 12 - smooth(progress) * 10}) rotate(${i * 17})`}
          >
            <ellipse rx="12" ry="7" fill="#aaa697" />
            <ellipse cy="-3" rx="12" ry="7" fill="#d2d0bc" />
            <path d="M-5-3h10M0-7v8" stroke="#8c897c" strokeWidth="1.3" />
          </g>
        ))
      ) : (
        <>
          <path
            d="M-16 23q22-45 78-23q34 15 20 45q-35 27-79 12Z"
            fill="#c69d60"
          />
          <path
            d="M10 8l16 32m10-40 14 31m-24-13 17-8"
            stroke="#755439"
            strokeWidth="3"
          />
          <ellipse cx="100" cy="107" rx="51" ry="17" fill="#8f7553" />
          <path d="M70 107V66h61v41" fill="#b8a284" />
        </>
      )}
      {coins && (
        <g
          transform={`translate(${18 - smooth(progress) * 28} ${-8 + smooth(progress) * 10})`}
        >
          <path
            d="M150-16l-94 46q-20 23-38 20l-17-12q-7-10 5-14l24 6 20-22 89-51Z"
            fill="#bf9671"
          />
          <path d="M150-16l-17-42 90-30 23 42Z" fill="#5b423b" />
        </g>
      )}
    </g>
  );
}
export function BiblicalCutout({
  project,
  scene,
  frame,
  sources,
}: {
  project: Project;
  scene: Scene;
  frame: number;
  sources: Record<string, string>;
}) {
  const spec = scene.illustration!;
  const fps = project.config.fps,
    t = frame / fps,
    p = smooth(frame / Math.max(1, scene.durationFrames - 1));
  const camera = cameraMotion(frame, scene.durationFrames, scene.camera);
  const people = project.analysis!.characters;
  const get = (id: string) => people.find((c) => c.id === id)!;
  const garden = spec.setting === "garden" || spec.setting === "street";
  let actors: {
    id: string;
    x: number;
    y: number;
    scale: number;
    facing?: number;
    pose?: string;
  }[] = [];
  if (spec.framing === "wide")
    actors =
      spec.setting === "supper"
        ? [
            { id: "disciples", x: 190, y: 1080, scale: 0.75 },
            { id: "jesus", x: 505, y: 1010, scale: 1.0 },
            { id: "judas", x: 825, y: 1090, scale: 0.84 },
          ]
        : scene.characters.map((id, i) => ({
            id,
            x: 250 + i * 240,
            y: 1120,
            scale: 0.9,
            pose: spec.poses[id],
          }));
  if (spec.framing === "pair" || spec.framing === "kiss")
    actors = [
      {
        id: "jesus",
        x: 355 + (spec.framing === "kiss" ? p * 70 : 0),
        pose: spec.framing === "kiss" ? "calm" : "look",
        y: 1150,
        scale: 1.25,
      },
      {
        id: "judas",
        x: 735 - (spec.framing === "kiss" ? p * 199 : 0),
        y: 1150,
        scale: 1.25,
        facing: -1,
        pose: spec.framing === "kiss" ? "kiss" : "look",
      },
    ];
  if (spec.framing === "face")
    actors = [
      {
        id: spec.focusId || "jesus",
        x: 540,
        y: 1460,
        scale: 3.2,
        facing: spec.focusId === "judas" ? -1 : 1,
      },
    ];
  if (spec.framing === "arrest")
    actors = [
      { id: "guards", x: 230, y: 1150, scale: 1.05, pose: "reach" },
      { id: "jesus", x: 535, y: 1110, scale: 1.2, pose: "arrested" },
      { id: "guards", x: 840, y: 1150, scale: 1.05, facing: -1, pose: "reach" },
    ];
  if (spec.framing === "shadows")
    actors = scene.characters.map((id, i) => ({
      id,
      x: 360 + i * 230,
      y: 1040,
      scale: 1.3,
      pose: "walking",
    }));
  const subject = parallax(camera, 0.64),
    props = parallax(camera, 0.82);
  return (
    <AbsoluteFill
      style={{ background: garden ? "#263a40" : "#594d3e", overflow: "hidden" }}
    >
      {scene.layers
        .filter((l) => l.assetId)
        .map((layer) => {
          const c = parallax(camera, layer.depth);
          return (
            <AbsoluteFill
              key={layer.id}
              style={{
                transform: `translate3d(${c.x}px,${c.y}px,0) scale(${c.scale})`,
                opacity: layer.opacity,
              }}
            >
              <Img
                src={sources[layer.assetId!]}
                style={{ width: "100%", height: "100%" }}
              />
            </AbsoluteFill>
          );
        })}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1080 1920"
        style={{ position: "absolute" }}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="warm">
            <stop stopColor="#efb960" stopOpacity=".18" />
            <stop offset="1" stopColor="#efb960" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g
          opacity={0.12 + Math.sin(t * 0.8) * 0.018}
          transform={`translate(${Math.sin(t * 0.6) * 12} 0)`}
          fill="#161d20"
        >
          <path d="M0 1530l470-550 240 860H0ZM1080 1660L730 960l-90 870h440Z" />
        </g>
        <g
          transform={`translate(${subject.x} ${subject.y}) translate(540 960) scale(${subject.scale}) translate(-540 -960)`}
        >
          {actors.map((a, i) => (
            <Person
              key={i}
              character={get(a.id)}
              frame={frame}
              frames={scene.durationFrames}
              fps={fps}
              pose={a.pose || spec.poses[a.id] || "look"}
              x={a.x}
              y={a.y}
              scale={a.scale}
              facing={a.facing}
              shadow={spec.framing === "shadows"}
            />
          ))}
        </g>
        <g
          transform={`translate(${props.x} ${props.y}) translate(540 1080) scale(${props.scale}) translate(-540 -1080)`}
        >
          {spec.framing === "wide" && spec.setting === "supper" && (
            <>
              <path
                d="M90 1330l885-10 85 130H10Z"
                fill="#957451"
                stroke="#433b30"
                strokeWidth="8"
              />
              <path d="M10 1450h1050v86H10Z" fill="#715238" />
              <path
                d="M140 1536v250m795-250v250"
                stroke="#4d3e30"
                strokeWidth="36"
              />
              <ellipse cx="440" cy="1370" rx="64" ry="20" fill="#bea678" />
              <path d="M415 1368q13-52 62-27l12 29Z" fill="#ceac72" />
              <ellipse cx="715" cy="1370" rx="50" ry="16" fill="#bfaa85" />
              <path d="M690 1370v-55h50v55" fill="#b99669" />
            </>
          )}
          {spec.framing === "hands" && (
            <Hands
              progress={p}
              coins={false}
              robe={get(spec.focusId || "jesus").appearance.colors[0]}
            />
          )}
          {spec.framing === "coins" && (
            <Hands
              progress={p}
              coins
              robe={get("judas").appearance.colors[0]}
            />
          )}
          <Candle
            x={garden ? 940 : spec.framing === "wide" ? 330 : 165}
            y={garden ? 1150 : spec.framing === "wide" ? 1320 : 1340}
            t={t}
            large={garden}
          />
          {!garden && <Candle x={885} y={1295} t={t + 0.6} />}
        </g>
        <ellipse
          cx={garden ? 930 : 330}
          cy="1050"
          rx="450"
          ry="650"
          fill="url(#warm)"
          opacity={0.65 + Math.sin(t * 3.2) * 0.04}
        />
        {Array.from({ length: 25 }, (_, i) => (
          <circle
            key={i}
            cx={90 + ((i * 151) % 920) + Math.sin(t * 0.3 + i) * 22}
            cy={600 + ((i * 177) % 1120) + Math.sin(t * 0.23 + i * 0.7) * 35}
            r={1 + (i % 3)}
            fill="#f7d9a1"
            opacity={0.12 + Math.sin(t * 0.4 + i) * 0.07}
          />
        ))}
      </svg>
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          boxShadow: "inset 0 0 190px rgba(16,21,23,.45)",
          background:
            "repeating-linear-gradient(85deg,transparent 0px,rgba(221,191,145,.035) 1px,transparent 3px)",
        }}
      />
    </AbsoluteFill>
  );
}
