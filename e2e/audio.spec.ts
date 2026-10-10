import { test, expect } from "@playwright/test";
test("automatic narration settings persist and the worker exports a playable MP4 with AAC", async ({
  page,
  request,
}) => {
  test.setTimeout(420000);
  const health = await (await request.get("/api/health")).json();
  test.skip(
    !health.automaticVoice,
    "The optional local speech engine is not installed",
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Nuevo proyecto", exact: true })
    .click();
  await page
    .getByLabel("Usar Director con aprobación del storyboard")
    .uncheck();
  await page.getByLabel("Nombre del proyecto").fill(`QA · voz ${Date.now()}`);
  await page
    .getByTestId("story-input")
    .fill("José caminó hacia Egipto. José decidió permanecer fiel a Dios.");
  await page
    .getByRole("combobox", { name: "Narración", exact: true })
    .selectOption("automatic");
  await page
    .getByRole("button", { name: "Analizar historia", exact: true })
    .click();
  await expect(page).toHaveURL(/\/projects\//, { timeout: 60000 });
  const id = page.url().split("/").at(-1)!;
  await page.getByRole("tab", { name: "Audio", exact: true }).click();
  if (health.voices?.includes("es_MX-claude-high")) {
    await expect(
      page.getByRole("combobox", { name: "Voz", exact: true }),
    ).toHaveValue("es_MX-claude-high");
    await expect(
      page.getByRole("combobox", { name: "Forma de narrar", exact: true }),
    ).toHaveValue("narrator");
  }
  await page.getByLabel("Velocidad de la voz").selectOption("0.9");
  await page.getByRole("button", { name: "Guardar audio" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Audio guardado" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "Audio", exact: true }).click();
  await expect(page.getByLabel("Velocidad de la voz")).toHaveValue("0.9");
  const saved = await (await request.get(`/api/projects/${id}`)).json();
  expect(saved.audio.mode).toBe("automatic");
  if (health.voices?.includes("es_MX-claude-high")) {
    expect(saved.audio.voice).toBe("es_MX-claude-high");
    expect(saved.audio.delivery).toBe("narrator");
  }
  await page.getByRole("tab", { name: "Render", exact: true }).click();
  await page
    .getByRole("button", { name: "Renderizar MP4", exact: true })
    .click();
  let latest:
    | {
        state: string;
        probe?: { audioStreams: number; audioCodec: string };
        error?: string;
      }
    | undefined;
  await expect
    .poll(
      async () => {
        const project = await (await request.get(`/api/projects/${id}`)).json();
        latest = project.jobs[0];
        return latest?.state === "FAILED" ? latest.error : latest?.state;
      },
      { timeout: 360000, intervals: [2000] },
    )
    .toBe("COMPLETE");
  expect(latest?.probe?.audioStreams).toBe(1);
  expect(latest?.probe?.audioCodec).toBe("aac");
  await expect(page.locator(".render-preview video")).toBeVisible();
  const metadata = await page
    .locator("video")
    .evaluate(async (element: HTMLVideoElement) => {
      if (element.readyState < 1)
        await new Promise((resolve) =>
          element.addEventListener("loadedmetadata", resolve, { once: true }),
        );
      element.muted = true;
      await element.play();
      return {
        width: element.videoWidth,
        height: element.videoHeight,
        duration: element.duration,
        paused: element.paused,
      };
    });
  expect(metadata.width).toBe(1080);
  expect(metadata.height).toBe(1920);
  expect(metadata.paused).toBe(false);
  expect(metadata.duration).toBeGreaterThan(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
