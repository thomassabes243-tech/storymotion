import type { Asset, Character } from "../domain";
const wrap = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">${body}</svg>`;
export function placeholder(
  kind: Asset["kind"],
  location: string,
  time: string,
  character?: Character,
  pose = "standing",
): string {
  const dark = time === "night",
    ink = "#40382c",
    sky = dark ? "#242b3b" : "#e3c798",
    mountain = dark ? "#394351" : "#a19d7d";
  if (kind === "background")
    return wrap(
      `<defs><linearGradient id="s" x2="0" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="${dark ? "#595462" : "#eed8ae"}"/></linearGradient></defs><path fill="url(#s)" d="M0 0H1080V1920H0z"/><circle cx="760" cy="620" r="145" fill="${dark ? "#d1d1bf" : "#f3dba5"}" opacity=".8"/>`,
    );
  if (kind === "environment") {
    let details = "";
    if (location === "calle")
      return wrap(
        `<path d="M0 0H250V1550H0zM830 0h250v1550H830z" fill="${dark ? "#1b2231" : "#938777"}"/><path d="M0 1550L420 1020H660L1080 1550V1920H0z" fill="${dark ? "#293346" : "#797c7b"}"/><path d="M240 1920L450 1020H630L840 1920z" fill="${dark ? "#1d2737" : "#676c70"}"/>${Array.from({ length: 8 }, (_, i) => `<rect x="${i % 2 ? 875 : 55}" y="${180 + Math.floor(i / 2) * 300}" width="105" height="135" fill="#d6c390" opacity=".55"/>`).join("")}<path d="M320 900v850m440-850v850" stroke="#38444e" stroke-width="15"/><circle cx="320" cy="900" r="28" fill="#dfc693"/><circle cx="760" cy="900" r="28" fill="#dfc693"/><path d="M315 1770l35-500 35 500m340 0 35-500 35 500" stroke="#ddc38c" stroke-width="10" opacity=".12"/>`,
      );
    else if (location === "bosque")
      details = Array.from(
        { length: 12 },
        (_, i) =>
          `<path d="M${i * 104 - 20} 1280l60-780 70 780z" fill="${i % 2 ? "#606849" : "#747953"}"/><path d="M${i * 104 + 40} 980v520" stroke="${ink}" stroke-width="22"/>`,
      ).join("");
    else if (
      location === "castillo" ||
      location === "ciudad" ||
      location === "templo"
    )
      details = `<path d="M180 1230V750h120V640h100v160h260V620h120v140h120v470z" fill="#8a8068" stroke="${ink}" stroke-width="8"/><path d="M440 1230V980q100-170 200 0v250" fill="#4a4438"/>`;
    else if (location === "mar")
      details = `<path d="M0 1130q250-60 540 0t540 0v790H0" fill="#7c9491"/>`;
    else if (location === "interior")
      details = `<path d="M100 1300V250h880v1050" fill="#9d8865" stroke="${ink}" stroke-width="10"/><path d="M430 400h230v400H430" fill="#dfc493"/>`;
    return wrap(
      `<path d="M-100 1210L190 680l210 360 310-580 440 700v760H-100z" fill="${mountain}"/><path d="M-80 1480L260 1110l190 220 300-420 410 420v590H-80z" fill="${dark ? "#404744" : "#777b5b"}"/><path d="M0 1530q540-220 1080 0v390H0" fill="${dark ? "#5a5146" : "#b2a178"}"/>${details}<path d="M420 1920l65-450 130-40 165 490" fill="#c8b58b" opacity=".7"/><path d="M0 1550q540-190 1080 0" fill="none" stroke="${ink}" stroke-width="5" opacity=".2"/>`,
    );
  }
  if (kind === "foreground" && location === "calle")
    return wrap(
      `<path d="M0 1520l135 100v300H0zM1080 1500l-125 110v310h125z" fill="#141c29"/><path d="M40 1820h100m815-10h90" stroke="#8c9aac" opacity=".2" stroke-width="7"/>`,
    );
  if (kind === "foreground")
    return wrap(
      `<path d="M-50 1920v-300l110-150 220 85 80 220 190 70 270-220 180 50 130 245z" fill="${dark ? "#242c29" : "#575c42"}" stroke="${ink}" stroke-width="8"/><path d="M60 1680l70 120 130-80M810 1800l65-90 120 120" stroke="#9b9b71" stroke-width="7" fill="none" opacity=".6"/>`,
    );
  if (kind === "object")
    return wrap(
      `<g transform="translate(540 960)" stroke="${ink}"><path d="M-240 0H240" stroke-width="9"/><path d="M240 0l-45-20 9 20-9 20z" fill="#c8c4ad" stroke-width="3"/><path d="M-190 0l-55-28 10 28-10 28z" fill="#f0e0bb" stroke-width="3"/></g>`,
    );
  if (kind === "character") {
    const archer = character?.id === "archer",
      group = character?.role === "group",
      cape = character?.appearance.colors[0] || "#575843";
    const person = (x: number, y: number, s: number) =>
      `<g transform="translate(${x} ${y}) scale(${s})" stroke="${ink}" stroke-width="6" stroke-linejoin="round"><path d="M-62 40l-28 260 30 170 48 0 3-220 23 220 48-4 10-180-30-246" fill="${cape}"/><path d="M-55 30l-16 180q70 30 134-2l-22-178z" fill="${archer ? "#6f6552" : "#a88c58"}"/><path d="M-45 150h90M-46 180h90" stroke-width="4"/><path d="M-35-90q-25 55 0 100l37 20 37-22q30-40 0-97" fill="#c09c75"/><path d="M-49-53q-3-90 86-58l20 60-22-14H-49" fill="${archer ? "#4c4838" : "#9b8158"}"/><path d="M-15-32h7m24 0h7M-5 1h23" stroke-width="4"/><path d="M-50 50l-50 ${pose === "raising" || pose === "drawing" ? "-90" : "85"} 45 ${pose === "raising" || pose === "drawing" ? "-65" : "25"}" fill="none" stroke="#b99771" stroke-width="25"/><path d="M44 50l${pose === "firing" || pose === "drawing" ? "130 -25 40 -20" : "55 100 -20 35"}" fill="none" stroke="#b99771" stroke-width="25"/>${archer ? `<g transform="translate(${pose === "drawing" || pose === "firing" ? 190 : -75} ${pose === "raising" ? -100 : 65}) rotate(${pose === "standing" ? 30 : 0})"><path d="M0-135q105 140 0 280" fill="none" stroke="#6d482b" stroke-width="13"/><path d="M0-135L${pose === "drawing" ? -85 : 0}0 0 145" fill="none" stroke="#e2d2ac" stroke-width="3"/>${pose === "drawing" ? '<path d="M-85 0h280" stroke-width="5"/>' : ""}</g>` : `<path d="M-108 170q0-150 95-125v220q-95-5-95-95" fill="#975e3b"/><path d="M-63 80v130" stroke="#d5b179" stroke-width="10"/>`}<path d="M-90 280l-30 90 60 20" fill="none" opacity=".2"/></g>`;
    return wrap(
      group
        ? Array.from({ length: 12 }, (_, i) =>
            person(
              140 + (i % 4) * 245,
              1170 + Math.floor(i / 4) * 160,
              0.5 + Math.floor(i / 4) * 0.1,
            ),
          ).join("")
        : person(535, 1150, 1.18),
    );
  }
  return wrap("");
}
