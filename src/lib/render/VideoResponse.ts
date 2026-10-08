import { Readable } from "node:stream";
import { createReadStream, promises as fs } from "node:fs";

export async function videoResponse(
  request: Request,
  file: string,
  filename: string,
) {
  const stat = await fs.stat(file);
  const range = request.headers.get("range");
  let start = 0,
    end = stat.size - 1,
    status = 200;
  const unsatisfied = () =>
    new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${stat.size}` },
    });
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) return unsatisfied();
    if (match[1]) {
      start = Number(match[1]);
      if (match[2]) end = Math.min(Number(match[2]), end);
    } else {
      const suffix = Number(match[2]);
      if (!Number.isSafeInteger(suffix) || suffix <= 0) return unsatisfied();
      start = Math.max(0, stat.size - suffix);
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start > end ||
      start >= stat.size
    )
      return unsatisfied();
    status = 206;
  }
  const headers = {
    "Content-Type": "video/mp4",
    "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes",
    ...(status === 206
      ? { "Content-Range": `bytes ${start}-${end}/${stat.size}` }
      : {}),
    ...(new URL(request.url).searchParams.has("download")
      ? { "Content-Disposition": `attachment; filename="${filename}"` }
      : {}),
  };
  return new Response(
    request.method === "HEAD"
      ? null
      : (Readable.toWeb(
          createReadStream(file, { start, end }),
        ) as ReadableStream),
    { status, headers },
  );
}
