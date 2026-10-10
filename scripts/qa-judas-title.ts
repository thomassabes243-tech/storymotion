import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import assert from "node:assert/strict";
import sharp from "sharp";
import { runProcess } from "../src/lib/render/FFmpegService";
import { JUDAS_TITLE } from "./judas-test-plan";
async function main() {
  const file = "docs/actionmotion-e2e-judas.mp4";
  const width = 396,
    height = 90,
    size = width * height;
  let buffer = Buffer.alloc(0),
    reference: Uint8Array | undefined,
    frames = 0,
    minIou = 1,
    referencePixels = 0;
  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        file,
        "-an",
        "-vf",
        "crop=792:180:138:255,scale=396:90",
        "-pix_fmt",
        "gray",
        "-f",
        "rawvideo",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let error = "";
    child.stderr.on("data", (b) => (error += b.toString()));
    child.stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= size) {
        const frame = buffer.subarray(0, size);
        buffer = buffer.subarray(size);
        const mask = Uint8Array.from(frame, (v) => (v > 180 ? 1 : 0));
        if (!reference) {
          reference = mask;
          for (let j = 0; j < size; j++)
            if (mask[j]) {
              referencePixels++;
              minX = Math.min(minX, j % width);
              maxX = Math.max(maxX, j % width);
              minY = Math.min(minY, Math.floor(j / width));
              maxY = Math.max(maxY, Math.floor(j / width));
            }
        }
        let intersection = 0,
          union = 0;
        for (let j = 0; j < size; j++) {
          if (mask[j] && reference[j]) intersection++;
          if (mask[j] || reference[j]) union++;
        }
        minIou = Math.min(minIou, union ? intersection / union : 0);
        frames++;
      }
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(Error(error)),
    );
  });
  assert(referencePixels > 500, "Title text must be visible");
  assert(minIou > 0.94, `Title mask changed: ${minIou}`);
  const crop = "/tmp/actionmotion-judas-title.png";
  await runProcess("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    file,
    "-frames:v",
    "1",
    "-vf",
    "crop=792:180:138:255",
    crop,
  ]);
  await sharp(crop)
    .resize({ width: 1584 })
    .png()
    .toFile(crop + ".ocr.png");
  const observed = (
    await runProcess("tesseract", [
      crop + ".ocr.png",
      "stdout",
      "-l",
      "eng",
      "--psm",
      "6",
    ])
  ).trim();
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z]+/g, "");
  assert.equal(normalize(observed), normalize(JUDAS_TITLE));
  const bounds = {
    left: 138 + minX * 2,
    top: 255 + minY * 2,
    right: 138 + (maxX + 1) * 2,
    bottom: 255 + (maxY + 1) * 2,
  };
  const result = {
    passed: true,
    expected: JUDAS_TITLE,
    ocrObserved: observed,
    ocrLanguage: "eng; matching ignores case, punctuation and accents",
    framesChecked: frames,
    minimumTextMaskIoU: minIou,
    textPixelBounds: bounds,
    safeBox: { left: 138, top: 255, right: 930, bottom: 435 },
    limitation: "Conservative framing; platform UI and captions vary.",
  };
  await fs.writeFile(
    "docs/actionmotion-e2e-judas-title-qa.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
