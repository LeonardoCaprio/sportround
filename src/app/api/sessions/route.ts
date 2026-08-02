import { NextResponse } from "next/server";

import { createSession } from "@/lib/server/session-service";
import { hostCookieName } from "@/lib/server/security";
import { jsonError, readJson } from "@/lib/server/api";
import { createSessionSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  try {
    const input = createSessionSchema.parse(await readJson(request));
    const result = await createSession(input);
    const response = NextResponse.json({ data: result.snapshot }, { status: 201 });
    response.cookies.set({
      name: hostCookieName(result.snapshot.session.id),
      value: result.hostToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      priority: "high",
    });
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
