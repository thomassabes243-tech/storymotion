import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  VideoDeliveryManager,
  deliveryChunkSize,
} from "../src/lib/delivery/VideoDelivery";
import { FileSystemStorage } from "../src/lib/storage/StorageProvider";
import { runProcess } from "../src/lib/render/FFmpegService";
import { videoResponse } from "../src/lib/render/VideoResponse";

async function fixture() {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "storymotion-delivery-"),
  );
  const file = path.join(directory, "original.mp4");
  await runProcess("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=s=1080x1920:r=30",
    "-t",
    "1",
    "-an",
    "-c:v",
    "libx264",
    "-threads",
    "2",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    file,
  ]);
  const storage = new FileSystemStorage(directory);
  const data = await readFile(file);
  return { directory, storage, data, file };
}
const request = (data: Buffer) => ({
  title: "José",
  filename: "Jose.mp4",
  bytes: data.length,
  sha256: createHash("sha256").update(data).digest("hex"),
  duration: 1,
  audioStreams: 0 as const,
});

test("finished MP4 chunks survive reopening, detect a missing part, and publish byte-identical video", async () => {
  const f = await fixture();
  try {
    // A legal MP4 free atom makes this a genuine two-part upload without changing the movie.
    const free = Buffer.alloc(deliveryChunkSize + 64);
    free.writeUInt32BE(free.length);
    free.write("free", 4);
    const data = Buffer.concat([f.data, free]);
    const manager = new VideoDeliveryManager(f.storage);
    const delivery = await manager.begin(request(data));
    await manager.putPart(delivery.id, 0, data.subarray(0, deliveryChunkSize));
    await assert.rejects(() => manager.complete(delivery.id));
    const reopened = new VideoDeliveryManager(f.storage);
    assert.deepEqual(
      await reopened.missingParts(await reopened.get(delivery.id)),
      [1],
    );
    await reopened.putPart(delivery.id, 1, data.subarray(deliveryChunkSize));
    const ready = await reopened.complete(delivery.id);
    assert.equal(ready.state, "READY");
    assert.equal(ready.probe?.width, 1080);
    assert.equal(ready.probe?.fps, 30);
    assert.deepEqual(await f.storage.get(reopened.videoKey(delivery.id)), data);
    assert.equal(
      (await new VideoDeliveryManager(f.storage).get(delivery.id)).state,
      "READY",
    );
    assert.equal((await reopened.complete(delivery.id)).state, "READY");
    await assert.rejects(() =>
      reopened.putPart(delivery.id, 0, data.subarray(0, deliveryChunkSize)),
    );
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("corrupt uploads remain retryable and invalid IDs or filenames cannot select filesystem paths", async () => {
  const f = await fixture();
  try {
    const manager = new VideoDeliveryManager(f.storage);
    const delivery = await manager.begin(request(f.data));
    const corrupt = Buffer.from(f.data);
    corrupt[200] ^= 1;
    await manager.putPart(delivery.id, 0, corrupt);
    await assert.rejects(() => manager.complete(delivery.id), /no coincide/);
    assert.equal((await manager.get(delivery.id)).state, "UPLOADING");
    await manager.putPart(delivery.id, 0, f.data);
    assert.equal((await manager.complete(delivery.id)).state, "READY");
    await assert.rejects(() => manager.get("../../outside"));
    await assert.rejects(() =>
      manager.begin({ ...request(f.data), filename: "x\r\nHeader.mp4" }),
    );
    await assert.rejects(() => manager.putPart(delivery.id, -1, f.data));
  } finally {
    await rm(f.directory, { recursive: true, force: true });
  }
});

test("phone playback supports byte ranges, suffix seeks, HEAD and downloadable filenames", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "storymotion-range-"));
  try {
    const file = path.join(directory, "video.mp4");
    await writeFile(file, Buffer.from("0123456789"));
    const partial = await videoResponse(
      new Request("https://storymotion.example/video", {
        headers: { range: "bytes=2-5" },
      }),
      file,
      "Jose.mp4",
    );
    assert.equal(partial.status, 206);
    assert.equal(await partial.text(), "2345");
    const suffix = await videoResponse(
      new Request("https://storymotion.example/video", {
        headers: { range: "bytes=-3" },
      }),
      file,
      "Jose.mp4",
    );
    assert.equal(await suffix.text(), "789");
    for (const range of [
      "bytes=-0",
      "bytes=100-",
      "bytes=-",
      "bytes=5-2",
      "bytes=0-1,3-4",
    ]) {
      const bad = await videoResponse(
        new Request("https://storymotion.example/video", {
          headers: { range },
        }),
        file,
        "Jose.mp4",
      );
      assert.equal(bad.status, 416);
    }
    const head = await videoResponse(
      new Request("https://storymotion.example/video?download=1", {
        method: "HEAD",
      }),
      file,
      "Jose.mp4",
    );
    assert.equal(head.headers.get("content-length"), "10");
    assert.match(head.headers.get("content-disposition") || "", /Jose.mp4/);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
