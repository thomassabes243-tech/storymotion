// Hand-authored vector scenery for the explicit illustrated mode. No AI provider.
export function biblicalBackdrop(
  setting: string,
  variant: number,
  depth: number,
) {
  const garden = setting === "garden";
  const outdoor = garden || setting === "street";
  const offset = ((variant % 5) - 2) * 36;
  const palette = outdoor
    ? ["#182936", "#485455", "#8b8269"]
    : ["#332a27", "#78634f", "#b09a77"];
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><defs><linearGradient id="wall" x2=".3" y2="1"><stop stop-color="${palette[0]}"/><stop offset="1" stop-color="${palette[1]}"/></linearGradient><radialGradient id="lamp"><stop stop-color="#edc479" stop-opacity=".6"/><stop offset="1" stop-color="#e7b05b" stop-opacity="0"/></radialGradient><linearGradient id="floor" x2="0" y2="1"><stop stop-color="${palette[1]}"/><stop offset="1" stop-color="#292826"/></linearGradient></defs>`;
  let content = "";
  if (depth === 0) {
    content = `<rect width="1080" height="1920" fill="url(#wall)"/>`;
    if (garden)
      content += `<circle cx="${780 + offset}" cy="580" r="90" fill="#e2dbc0" opacity=".7"/><path d="M0 1070Q290 850 550 960T1080 900V1500H0Z" fill="#233840"/><path d="M0 1180Q310 1040 600 1100T1080 1040V1600H0Z" fill="#344745"/>`;
    else
      content += Array.from(
        { length: 15 },
        (_, i) =>
          `<path d="M0 ${500 + i * 62}H1080M${(i % 2) * 110 + offset} ${500 + i * 62}v62M${450 + (i % 2) * 100 + offset} ${500 + i * 62}v62M${850 + offset} ${500 + i * 62}v62" fill="none" stroke="#ceb18b" stroke-opacity=".11" stroke-width="3"/>`,
      ).join("");
  }
  if (depth === 1) {
    if (garden)
      content = [100, 900]
        .map(
          (x, i) =>
            `<g transform="translate(${x + offset} 0)"><path d="M-30 1490Q-65 1110 5 830Q45 710 120 690M10 950Q-90 840-140 750M30 855Q135 815 195 720" fill="none" stroke="#4d4b3b" stroke-width="40"/><path d="M-245 680Q-155 500-40 595Q35 445 170 570Q290 560 310 735Q200 810 70 760Q-95 845-245 680Z" fill="${i ? "#45554a" : "#394e47"}"/><path d="M-210 715q155-160 370-60" fill="none" stroke="#71806a" stroke-opacity=".4" stroke-width="16"/></g>`,
        )
        .join("");
    else
      content = `<g transform="translate(${offset} 0)"><path d="M105 1380V870a185 185 0 0 1 370 0v510" fill="#252825" stroke="#9a8062" stroke-width="45"/><path d="M155 1380V875a135 135 0 0 1 270 0v505" fill="#18252d"/><path d="M285 750v575M162 940h265" stroke="#776749" stroke-width="13"/><path d="M765 1400V765h100v635M725 775h180M725 1380h180" fill="#a28b6c" stroke="#5d4e41" stroke-width="13"/><ellipse cx="830" cy="1150" rx="420" ry="590" fill="url(#lamp)"/></g>`;
  }
  if (depth === 2) {
    content = `<path d="M0 1420Q540 1320 1080 1420V1920H0Z" fill="url(#floor)"/>`;
    content += Array.from(
      { length: 9 },
      (_, i) =>
        `<path d="M${540 + (i - 4) * 70} 1380L${540 + (i - 4) * 300} 1920" stroke="#b69c7d" stroke-opacity=".14" stroke-width="3"/>`,
    ).join("");
    if (!garden)
      content += `<ellipse cx="600" cy="1510" rx="450" ry="70" fill="#161b1c" opacity=".3"/>`;
  }
  if (depth === 3) {
    if (garden)
      content = `<path d="M-80 1700q130-180 240-80l-50 300H-80ZM950 1790q85-150 240-120v250H920Z" fill="#142b2b"/><path d="M35 1920l24-290m-5 80-70-40m65 10 78-88M1050 1920l-24-250m5 80 60-70" stroke="#4c604d" stroke-width="12"/>`;
    else
      content = `<path d="M-60 520h140v1400H-60ZM1020 500h120v1420h-120" fill="#201f20" opacity=".82"/><path d="M0 1850Q520 1740 1080 1850V1920H0Z" fill="#222522" opacity=".5"/>`;
  }
  return head + content + "</svg>";
}
