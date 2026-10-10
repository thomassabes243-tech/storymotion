import React from "react";
import type { Character } from "../../lib/domain";
// An explicit illustration rig used only with placeholder assets, never with photographs.
export function ArticulatedCharacter({
  character,
  frame,
  fps,
  action,
}: {
  character: Character;
  frame: number;
  fps: number;
  action: string;
}) {
  if (character.id === "mysterious_figure")
    return (
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1080 1920"
        aria-hidden="true"
      >
        <g fill="#111218">
          <ellipse cx="535" cy="1090" rx="43" ry="62" />
          <path d="M490 1150q45-25 90 0l40 260-55 12 5 175h-28l-8-158-10 158h-28l5-175-51-12z" />
        </g>
      </svg>
    );
  const t = frame / fps,
    walking = action === "advance" || action === "escape" || action === "stop",
    stride = walking
      ? Math.sin(t * Math.PI * 2 * (action === "escape" ? 2.1 : 1.1)) *
        (action === "stop" ? Math.max(0, 1 - t / 0.8) : 1)
      : 0,
    breath = Math.sin(t * 2) * 2;
  const bow = /archer/.test(character.id),
    attack = ["raise_bow", "draw_bow", "fire_arrow"].includes(action),
    raise = attack ? Math.min(1, t / 1.1) : 0;
  const color = character.appearance.colors[0] || "#6b6b52",
    skin = "#c6a27c",
    ink = "#40382c";
  const person = (x: number, y: number, s: number, i = 0) => (
    <g
      key={i}
      transform={`translate(${x} ${y + breath}) scale(${s})`}
      stroke={ink}
      strokeWidth={6}
      strokeLinejoin="round"
    >
      <path
        d={`M-58 30 Q${-80 + Math.sin(t * 2 + i) * 8} 180 -65 315 L55 315 Q75 180 50 30Z`}
        fill={color}
      />
      <g transform={`rotate(${stride * 20} -22 235)`}>
        <path
          d="M-22 230v205l-32 7"
          fill="none"
          stroke="#4e4a3e"
          strokeWidth={31}
        />
      </g>
      <g transform={`rotate(${-stride * 20} 24 235)`}>
        <path
          d="M24 230v205l35 7"
          fill="none"
          stroke="#4e4a3e"
          strokeWidth={31}
        />
      </g>
      <path
        d="M-55 28l-12 190q66 26 126-2L43 28Z"
        fill={
          bow
            ? "#71604d"
            : character.appearance.weapons.length
              ? "#a88c58"
              : color
        }
      />
      <path d="M-46 145h89M-47 180h90" fill="none" />
      <g
        transform={`rotate(${action === "head_turn" ? -Math.min(1, t / 1.1) * 18 : Math.sin(t * 0.7 + i) * 2} 0 -20)`}
      >
        <ellipse cy={-44} rx={43} ry={62} fill={skin} />
        <path d="M-45-53q-5-91 80-52l18 58-20-18H-45Z" fill="#433d31" />
        <path
          d="M-25-35h12m26 0h12M-6 0h20"
          strokeWidth={Math.floor(t * 10) % 43 === 0 ? 2 : 4}
          fill="none"
        />
      </g>
      <g transform={`rotate(${-raise * 70 - stride * 12} -48 50)`}>
        <path
          d="M-48 50l-43 99 31 32"
          stroke={skin}
          strokeWidth={25}
          fill="none"
        />
      </g>
      <g transform={`rotate(${-raise * 55 + stride * 12} 43 50)`}>
        <path
          d="M43 50l50 98-18 36"
          stroke={skin}
          strokeWidth={25}
          fill="none"
        />
      </g>
      {bow && (
        <g
          transform={`translate(${raise ? 160 : 95} ${raise ? -10 : 185}) rotate(${raise ? 0 : 30})`}
        >
          <path
            d="M0-130q100 130 0 270"
            fill="none"
            stroke="#6d482b"
            strokeWidth={12}
          />
          <path
            d={`M0-130L${action === "draw_bow" ? -65 : 0}0 0 140`}
            fill="none"
            stroke="#e2d2ac"
            strokeWidth={3}
          />
        </g>
      )}
    </g>
  );
  return (
    <svg width="100%" height="100%" viewBox="0 0 1080 1920" aria-hidden="true">
      {character.role === "group"
        ? Array.from({ length: 12 }, (_, i) =>
            person(
              140 + (i % 4) * 245,
              1170 + Math.floor(i / 4) * 160,
              0.5 + Math.floor(i / 4) * 0.1,
              i,
            ),
          )
        : person(535, 1150, 1.18)}
    </svg>
  );
}
