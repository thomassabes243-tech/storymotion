import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("create from text, edit camera/duration, import a cutout and reopen the storyboard", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Nuevo proyecto", exact: true })
    .click();
  await page.getByLabel("Nombre del proyecto").fill(`QA · Elena ${Date.now()}`);
  await page
    .getByTestId("story-input")
    .fill(
      "Elena caminó por un bosque al amanecer. Elena encontró un libro mágico y huyó hacia el castillo.",
    );
  await page
    .getByRole("combobox", { name: "Duración", exact: true })
    .selectOption("target");
  await page.getByRole("button", { name: "30 s", exact: true }).click();
  await page
    .getByRole("button", { name: "Analizar historia", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects\//, { timeout: 60000 });
  await expect(page.locator(".scene-card").first()).toBeVisible();
  const id = page.url().split("/").at(-1)!;
  const original = await (await request.get(`/api/projects/${id}`)).json();
  expect(
    original.analysis.characters.find(
      (c: { name: string }) => c.name === "Elena",
    ),
  ).toBeTruthy();
  expect(original.scenes.length).toBeGreaterThan(3);
  expect(
    original.scenes.every(
      (s: { duration: number; camera: { movement: string } }) =>
        s.duration > 0 && s.camera.movement !== "static",
    ),
  ).toBeTruthy();
  const secondSnapshot = JSON.stringify(original.scenes[1]);
  await page
    .getByRole("button", { name: "Editar plano 1", exact: true })
    .click();
  await page
    .getByLabel("Descripción visual")
    .fill("Elena atraviesa el bosque entre árboles y niebla");
  await page.getByLabel("Duración (segundos)", { exact: true }).fill("4");
  await page
    .getByRole("combobox", { name: "Movimiento", exact: true })
    .selectOption("pan_right");
  await page
    .getByRole("button", { name: "Guardar escena", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Escena guardada" }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Editar plano 1", exact: true })
    .click();
  await expect(page.getByLabel("Descripción visual")).toHaveValue(
    "Elena atraviesa el bosque entre árboles y niebla",
  );
  await expect(
    page.getByRole("combobox", { name: "Movimiento", exact: true }),
  ).toHaveValue("pan_right");
  const saved = await (await request.get(`/api/projects/${id}`)).json();
  expect(saved.scenes[0].duration).toBe(4);
  const rest = { ...saved.scenes[1], start: original.scenes[1].start };
  expect(JSON.stringify(rest)).toBe(secondSnapshot);
  await page
    .getByRole("button", { name: "Personaje · Elena", exact: false })
    .click();
  await page.locator(".editor-controls input[type=file]").setInputFiles({
    name: "cutout.png",
    mimeType: "image/png",
    buffer: await sharp({
      create: {
        width: 60,
        height: 100,
        channels: 4,
        background: { r: 80, g: 120, b: 90, alpha: 0.7 },
      },
    })
      .png()
      .toBuffer(),
  });
  await expect(
    page.getByRole("combobox", { name: "Asset", exact: true }),
  ).toContainText("cutout.png");
  await page
    .getByRole("button", { name: "Guardar escena", exact: true })
    .first()
    .click();
  await page.reload();
  const uploaded = await (await request.get(`/api/projects/${id}`)).json();
  expect(
    uploaded.assets.some(
      (a: { name: string; source: string }) =>
        a.name === "cutout.png" && a.source === "upload",
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
test("demo preview animates, mobile views fit and export responds with a queued job", async ({
  page,
  request,
}) => {
  test.setTimeout(650000);
  await page.setViewportSize({ width: 390, height: 844 });
  const demo = await (await request.post("/api/demo")).json();
  expect(demo.scenes.length).toBe(10);
  await page.goto(`/projects/${demo.id}`);
  await expect(page.locator(".scene-card")).toHaveCount(10);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(page.locator(".preview-device img").first()).toBeVisible();
  await page.getByRole("tab", { name: "Personajes", exact: true }).click();
  await expect(page.locator(".character-card")).toHaveCount(2);
  await page.getByRole("tab", { name: "Render", exact: true }).click();
  await expect(
    page.getByText("Sin audio", { exact: true }).last(),
  ).toBeVisible();
  const current = await (await request.get(`/api/projects/${demo.id}`)).json();
  const active = current.jobs.find((j: { state: string }) =>
    ["RENDER_QUEUED", "RENDERING"].includes(j.state),
  );
  let response;
  if (active) {
    // A retried browser run can attach to work resumed by the worker.
    response = await request.post(`/api/projects/${demo.id}/render`);
  } else {
    const enqueueResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/projects/${demo.id}/render`) &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: /Renderizar (cambios|MP4)/ })
      .click();
    response = await enqueueResponse;
  }
  expect(response.status()).toBe(202);
  const job = await response.json();
  expect(["RENDER_QUEUED", "RENDERING"]).toContain(job.state);
  await expect
    .poll(
      async () => {
        const result = await (await request.get(`/api/jobs/${job.id}`)).json();
        return result.state;
      },
      { timeout: 600000 },
    )
    .toBe("COMPLETE");
  const completed = await (await request.get(`/api/jobs/${job.id}`)).json();
  expect(completed.probe).toMatchObject({
    width: 1080,
    height: 1920,
    codec: "h264",
    fps: 30,
    audioStreams: 0,
  });
  const video = await request.get(`/api/jobs/${job.id}/video`, {
    headers: { Range: "bytes=0-99" },
  });
  expect(video.status()).toBe(206);
  expect((await video.body()).length).toBe(100);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/storymotion-mobile.png",
    fullPage: true,
  });
});
test("scene split/move/merge and stale edits respect persistence", async ({
  request,
}) => {
  const demo = await (await request.post("/api/demo")).json();
  const create = await request.post("/api/projects", {
    data: {
      name: `QA structure ${Date.now()}`,
      story: "Un caballero entró al castillo. El caballero levantó la espada.",
      config: { ...demo.config, durationMode: "target", targetDuration: 12 },
    },
  });
  const draft = await create.json();
  let p = await (
    await request.post(`/api/projects/${draft.id}/analyze`)
  ).json();
  const count = p.scenes.length,
    total = p.scenes.reduce(
      (n: number, s: { durationFrames: number }) => n + s.durationFrames,
      0,
    ),
    first = p.scenes[0];
  p = await (
    await request.post(`/api/projects/${p.id}/scenes/${first.sceneId}`, {
      data: { action: "split", revision: p.revision },
    })
  ).json();
  expect(p.scenes.length).toBe(count + 1);
  expect(
    p.scenes.reduce(
      (n: number, s: { durationFrames: number }) => n + s.durationFrames,
      0,
    ),
  ).toBe(total);
  p = await (
    await request.post(`/api/projects/${p.id}/scenes/${p.scenes[1].sceneId}`, {
      data: { action: "move", direction: "down", revision: p.revision },
    })
  ).json();
  const stale = await request.patch(
    `/api/projects/${p.id}/scenes/${first.sceneId}`,
    { data: { revision: 0, scene: p.scenes[0] } },
  );
  expect(stale.status()).toBe(409);
  p = await (
    await request.post(`/api/projects/${p.id}/scenes/${p.scenes[0].sceneId}`, {
      data: { action: "merge", revision: p.revision },
    })
  ).json();
  expect(p.scenes.length).toBe(count);
});

test("a failed image affects only its scene and can be retried independently", async ({
  request,
}) => {
  const health = await (await request.get("/api/health")).json();
  test.skip(
    health.imageProvider,
    "La prueba de fallo aislado necesita el proveedor externo desactivado.",
  );
  const demo = await (await request.post("/api/demo")).json();
  const draft = await (
    await request.post("/api/projects", {
      data: {
        name: `QA failure ${Date.now()}`,
        story:
          "Elena entró en el bosque. Elena observó una luz entre los árboles.",
        config: { ...demo.config, targetDuration: 12 },
      },
    })
  ).json();
  let p = await (
    await request.post(`/api/projects/${draft.id}/analyze`)
  ).json();
  const id = p.scenes[0].sceneId,
    others = JSON.stringify(p.scenes.slice(1));
  const response = await request.post(`/api/projects/${p.id}/scenes/${id}`, {
    data: { action: "generate", kind: "background", revision: p.revision },
  });
  expect(response.status()).toBe(400);
  p = await (await request.get(`/api/projects/${p.id}`)).json();
  expect(p.scenes[0].status).toBe("FAILED");
  expect(JSON.stringify(p.scenes.slice(1))).toBe(others);
  p = await (
    await request.post(`/api/projects/${p.id}/scenes/${id}`, {
      data: { action: "regenerate", revision: p.revision },
    })
  ).json();
  expect(p.scenes[0].status).toBe("READY");
  expect(JSON.stringify(p.scenes.slice(1))).toBe(others);
});
