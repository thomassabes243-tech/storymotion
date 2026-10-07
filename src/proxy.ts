import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/** Optional single-owner gate for a hosted local MVP; not multi-user auth. */
export function proxy(request: NextRequest) {
  const password = process.env.STORYMOTION_ACCESS_PASSWORD;
  if (!password) return NextResponse.next();
  if (
    request.nextUrl.pathname === "/api/health" &&
    ["GET", "HEAD"].includes(request.method)
  )
    return NextResponse.next();

  const authorization = request.headers.get("authorization") || "";
  let supplied = "";
  if (authorization.startsWith("Basic ")) {
    const credentials = Buffer.from(authorization.slice(6), "base64").toString(
      "utf8",
    );
    if (credentials.startsWith("storymotion:"))
      supplied = credentials.slice("storymotion:".length);
  }
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!supplied || !timingSafeEqual(digest(supplied), digest(password)))
    return new NextResponse("Accede a StoryMotion con tu contraseña.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="StoryMotion", charset="UTF-8"',
        "Cache-Control": "private, no-store",
      },
    });

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== request.headers.get("host"))
          return new NextResponse("Origen no permitido", { status: 403 });
      } catch {
        return new NextResponse("Origen no permitido", { status: 403 });
      }
    }
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: "/:path*" };
