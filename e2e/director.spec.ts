import { test, expect } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { runProcess, FFmpegService } from "../src/lib/render/FFmpegService";
test("mobile story → persistent director → approval → illustrated MP4, optional imported audio and scene clip", async ({
  page,
  request,
}) => {
  test.setTimeout(420000);
  const start = Date.now(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  const dir = await mkdtemp(path.join(tmpdir(), "actionmotion-mobile-"));
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Nuevo proyecto", exact: true })
      .click();
    await expect(
      page.getByLabel("Usar Director con aprobación del storyboard"),
    ).toBeChecked();
    await expect(
      page.getByRole("combobox", { name: "Narración", exact: true }),
    ).toHaveValue("off");
    await page
      .getByLabel("Nombre del proyecto")
      .fill(`ActionMotion QA ${Date.now()}`);
    await page
      .getByTestId("story-input")
      .fill(
        "Elena caminó con Marcos por un bosque al amanecer. Elena observó una luz entre los árboles. Marcos entró al castillo. Elena levantó una antorcha.",
      );
    await page
      .getByRole("combobox", { name: "Duración", exact: true })
      .selectOption("target");
    await page.getByLabel("Duración objetivo (segundos)").fill("6");
    await page
      .getByRole("button", { name: "Analizar historia", exact: true })
      .click();
    await expect(page).toHaveURL(/\/projects\/.*tab=director/);
    const id = new URL(page.url()).pathname.split("/").at(-1)!;
    let agent: any;
    await expect
      .poll(
        async () => {
          agent = (
            await (await request.get(`/api/projects/${id}/director`)).json()
          )[0];
          return agent?.state;
        },
        { timeout: 60000 },
      )
      .toBe("STORYBOARD");
    await expect(
      page.getByRole("button", { name: "Aprobar storyboard y producir" }),
    ).toBeVisible();
    expect(
      (await (await request.get(`/api/projects/${id}`)).json()).jobs,
    ).toHaveLength(0);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Aprobar storyboard y producir" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Storyboard", exact: true }).click();
    await expect(page.locator(".scene-card").first()).toBeVisible();
    let project = await (await request.get(`/api/projects/${id}`)).json();
    expect(
      project.analysis.characters.some(
        (c: { name: string }) => c.name === "Elena",
      ),
    ).toBeTruthy();
    expect(
      project.analysis.characters.some(
        (c: { name: string }) => c.name === "Marcos",
      ),
    ).toBeTruthy();
    const beforeSecond = JSON.stringify(project.scenes[1]);
    // A real moving test pattern exercises the clip path. It is not generative/cinematic inference.
    const clip = path.join(dir, "motion.mp4");
    await runProcess("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=180x320:rate=24:duration=1",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      clip,
    ]);
    await page
      .getByRole("button", { name: "Editar plano 1", exact: true })
      .click();
    await page
      .getByLabel("Clip con movimiento (MP4, hasta 50 MB)")
      .setInputFiles(clip);
    await expect
      .poll(async () => {
        project = await (await request.get(`/api/projects/${id}`)).json();
        return project.scenes[0].clipAssetId;
      })
      .toBeTruthy();
    const other = {
      ...project.scenes[1],
      start: JSON.parse(beforeSecond).start,
    };
    expect(JSON.stringify(other)).toBe(beforeSecond);
    const audio = path.join(dir, "voice.wav");
    await runProcess("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=750:duration=1",
      audio,
    ]);
    await page.getByRole("tab", { name: "Audio", exact: true }).click();
    await page.getByLabel("Tratamiento de la grabación").selectOption("clean");
    await page
      .getByLabel("Importar voz o audio (hasta 50 MB)")
      .setInputFiles(audio);
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Audio importado y normalizado" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Director", exact: true }).click();
    await page
      .getByRole("button", { name: "Aprobar storyboard y producir" })
      .click();
    await expect
      .poll(
        async () => {
          agent = (
            await (await request.get(`/api/projects/${id}/director`)).json()
          )[0];
          return agent?.state === "FAILED" ? agent.error : agent?.state;
        },
        { timeout: 300000, intervals: [1500] },
      )
      .toBe("READY_FOR_REVIEW");
    await expect(page.locator(".agent-result video")).toBeVisible();
    await page.waitForFunction(() => {
      const v = document.querySelector(
        ".agent-result video",
      ) as HTMLVideoElement;
      return v && v.readyState >= 2;
    });
    const metadata = await page
      .locator(".agent-result video")
      .evaluate(async (v: HTMLVideoElement) => {
        v.muted = true;
        await v.play();
        return {
          width: v.videoWidth,
          height: v.videoHeight,
          duration: v.duration,
          playing: !v.paused,
        };
      });
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(1920);
    expect(metadata.playing).toBe(true);
    const imported = await (
      await request.get(
        `/api/audio-assets/${project.audio.importedAssetId || (await (await request.get(`/api/projects/${id}`)).json()).audio.importedAssetId}/original?download=1`,
      )
    ).body();
    expect(imported).toEqual(await readFile(audio));
    const job = await (
      await request.get(`/api/jobs/${agent.renderJobId}`)
    ).json();
    expect(job.probe).toMatchObject({
      width: 1080,
      height: 1920,
      codec: "h264",
      fps: 30,
      audioStreams: 1,
      audioCodec: "aac",
    });
    const video = await request.get(`/api/jobs/${job.id}/video?download=1`);
    expect(video.status()).toBe(200);
    expect(video.headers()["content-disposition"]).toContain("attachment");
    const file = path.join(dir, "output.mp4");
    await writeFile(file, await video.body());
    await runProcess("ffmpeg", [
      "-v",
      "error",
      "-xerror",
      "-i",
      file,
      "-f",
      "null",
      "-",
    ]);
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    expect(fits).toBeTruthy();
    expect(errors).toEqual([]);
    await page.screenshot({
      path: "docs/actionmotion-mobile.png",
      fullPage: true,
    });
    await copyFile(file, "docs/actionmotion-demo.mp4");
    await writeFile(
      "docs/actionmotion-verification.json",
      JSON.stringify(
        {
          story: project.story,
          projectId: id,
          agentId: agent.id,
          renderJobId: job.id,
          state: agent.state,
          probe: job.probe,
          mobile: { viewport: "390x844", fits, metadata, errors },
          durationMs: Date.now() - start,
          clipSource: "synthetic moving test pattern; not generative AI",
          audioSource:
            "synthetic 1-second signal for pipeline measurement; not narration",
          limitations: [
            "No image-to-video model or GPU is installed.",
            "Remaining shots are articulated illustrations, not photorealistic animation.",
          ],
          events: agent.events,
        },
        null,
        2,
      ),
    );
    // Separately prove that audio remains optional using the same cached visual render.
    project = await (await request.get(`/api/projects/${id}`)).json();
    await request.patch(`/api/projects/${id}/audio`, {
      data: {
        revision: project.revision,
        audio: { ...project.audio, mode: "off" },
      },
    });
    const silent = await (
      await request.post(`/api/projects/${id}/render`)
    ).json();
    await expect
      .poll(
        async () => {
          const j = await (await request.get(`/api/jobs/${silent.id}`)).json();
          return j.state === "FAILED" ? j.error : j.state;
        },
        { timeout: 120000, intervals: [1000] },
      )
      .toBe("COMPLETE");
    const silentJob = await (
      await request.get(`/api/jobs/${silent.id}`)
    ).json();
    expect(silentJob.probe.audioStreams).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
