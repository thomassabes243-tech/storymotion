import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

test("Hosted owner gate protects the app, assets, mutations and MP4 downloads", () => {
  const previous = process.env.STORYMOTION_ACCESS_PASSWORD;
  process.env.STORYMOTION_ACCESS_PASSWORD = "test-only-password";
  try {
    for (const route of [
      "/",
      "/api/projects",
      "/api/assets/a/data",
      "/api/jobs/j/video",
      "/api/deliveries/d/video",
      "/delivery/d",
    ])
      assert.equal(
        proxy(new NextRequest(`https://storymotion.example${route}`)).status,
        401,
      );
    const authorization = `Basic ${Buffer.from("storymotion:test-only-password").toString("base64")}`;
    const headers = { authorization, host: "storymotion.example" };
    assert.equal(
      proxy(
        new NextRequest("https://storymotion.example/api/projects", {
          headers,
        }),
      ).status,
      200,
    );
    assert.equal(
      proxy(
        new NextRequest("https://storymotion.example/api/projects", {
          method: "POST",
          headers: { ...headers, origin: "https://other.example" },
        }),
      ).status,
      403,
    );
    assert.equal(
      proxy(
        new NextRequest("https://storymotion.example/api/projects", {
          method: "POST",
          headers: { ...headers, origin: "https://storymotion.example" },
        }),
      ).status,
      200,
    );
    assert.equal(
      proxy(new NextRequest("https://storymotion.example/api/health")).status,
      200,
    );
    assert.equal(
      proxy(
        new NextRequest("https://storymotion.example/api/health", {
          method: "POST",
        }),
      ).status,
      401,
    );
    assert.equal(
      proxy(
        new NextRequest("https://storymotion.example/", {
          headers: {
            authorization: `Basic ${Buffer.from("other:test-only-password").toString("base64")}`,
          },
        }),
      ).status,
      401,
    );
  } finally {
    if (previous === undefined) delete process.env.STORYMOTION_ACCESS_PASSWORD;
    else process.env.STORYMOTION_ACCESS_PASSWORD = previous;
  }
});

test("Local usage remains available without a hosting password", () => {
  const previous = process.env.STORYMOTION_ACCESS_PASSWORD;
  delete process.env.STORYMOTION_ACCESS_PASSWORD;
  try {
    assert.equal(
      proxy(new NextRequest("http://localhost:3000/api/projects")).status,
      200,
    );
  } finally {
    if (previous !== undefined)
      process.env.STORYMOTION_ACCESS_PASSWORD = previous;
  }
});
