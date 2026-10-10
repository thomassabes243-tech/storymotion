import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { bundle } from "@remotion/bundler";
import {
  openBrowser,
  selectComposition,
  renderStill,
} from "@remotion/renderer";
import { SQLiteRepository } from "../src/lib/storage/ProjectRepository";
import { FileSystemStorage } from "../src/lib/storage/StorageProvider";
import { alignToNarration } from "../src/lib/audio/AudioTiming";
import { ProjectSchema } from "../src/lib/domain";
import { runProcess } from "../src/lib/render/FFmpegService";
async function main() {
  const root =
    process.env.STORYMOTION_DATA_DIR || "data/actionmotion-e2e-judas";
  const repo = new SQLiteRepository(root),
    storage = new FileSystemStorage(root);
  const state = JSON.parse(
    await fs.readFile(path.join(root, "e2e-run.json"), "utf8"),
  );
  let p = repo.get(state.projectId)!;
  if (state.audio?.cues) p = alignToNarration(p, state.audio.cues);
  if (process.argv.includes("--final"))
    p = ProjectSchema.parse(
      JSON.parse(
        await fs.readFile("docs/actionmotion-e2e-judas-project.json", "utf8"),
      ),
    );
  const dir = path.join(
    root,
    process.argv.includes("--final") ? "final-review" : "preview-review",
  );
  await fs.mkdir(dir, { recursive: true });
  if (process.argv.includes("--final")) {
    for (const [i, s] of p.scenes.entries()) {
      for (const [label, position] of [
        ["mid", 0.5],
        ["end", 0.85],
      ] as const) {
        await runProcess("ffmpeg", [
          "-y",
          "-v",
          "error",
          "-ss",
          String(s.start + s.duration * position),
          "-i",
          "docs/actionmotion-e2e-judas.mp4",
          "-frames:v",
          "1",
          path.join(dir, `${i + 1}-${label}.png`),
        ]);
      }
    }
  } else {
    const sources = Object.fromEntries(
      await Promise.all(
        p.assets.map(async (a) => [
          a.id,
          `data:${a.mime};base64,${Buffer.from(await storage.get(a.storageKey)).toString("base64")}`,
        ]),
      ),
    );
    const props = { project: p, assetSources: sources };
    const url = await bundle({
      entryPoint: path.resolve("src/remotion/Root.tsx"),
      publicDir: null,
    });
    const browser = await openBrowser("chrome", {
      browserExecutable: "/usr/bin/chromium",
    });
    try {
      const composition = await selectComposition({
        serveUrl: url,
        id: "StoryMotion",
        inputProps: props,
        puppeteerInstance: browser,
      });
      for (const [i, s] of p.scenes.entries()) {
        await renderStill({
          serveUrl: url,
          composition,
          inputProps: props,
          frame: Math.round((s.start + s.duration * 0.65) * 30),
          output: path.join(dir, `${i + 1}-mid.png`),
          imageFormat: "png",
          scale: 0.5,
          puppeteerInstance: browser,
        });
        console.log(`Reviewed frame ready: ${i + 1}/${p.scenes.length}`);
      }
    } finally {
      await browser.close({ silent: true });
    }
  }
  for (const moment of process.argv.includes("--final")
    ? ["mid", "end"]
    : ["mid"]) {
    for (let first = 0; first < p.scenes.length; first += 12) {
      const count = Math.min(12, p.scenes.length - first);
      const entries = [];
      for (let j = 0; j < count; j++) {
        const i = first + j;
        const file = path.join(dir, `${i + 1}-${moment}.png`);
        const thumb = await sharp(file).resize(360, 640).png().toBuffer();
        const text = Buffer.from(
          `<svg width="360" height="40"><rect width="360" height="40" fill="#111a20"/><text x="14" y="27" font-family="sans-serif" font-size="20" fill="white">Toma ${i + 1} · ${p.scenes[i].duration.toFixed(2)} s</text></svg>`,
        );
        entries.push(
          { input: thumb, left: (j % 3) * 360, top: Math.floor(j / 3) * 680 },
          {
            input: text,
            left: (j % 3) * 360,
            top: Math.floor(j / 3) * 680 + 640,
          },
        );
      }
      const out = process.argv.includes("--final")
        ? `docs/actionmotion-e2e-judas-frames-${Math.floor(first / 12) + 1}${moment === "end" ? "-end" : ""}.jpg`
        : path.join(
            dir,
            `board-${Math.floor(first / 12) + 1}${moment === "end" ? "-end" : ""}.jpg`,
          );
      await sharp({
        create: {
          width: 1080,
          height: Math.ceil(count / 3) * 680,
          channels: 3,
          background: "#10181d",
        },
      })
        .composite(entries)
        .jpeg({ quality: 90 })
        .toFile(out);
      console.log(out);
    }
  }
  repo.close();
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
