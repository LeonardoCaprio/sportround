import type { NextRequest } from "next/server";

import { jsonError } from "@/lib/server/api";
import { hostCookieName } from "@/lib/server/security";
import { getHostSession } from "@/lib/server/session-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const token = request.cookies.get(hostCookieName(sessionId))?.value;
    return Response.json({ data: await getHostSession(sessionId, token) });
  } catch (error) {
    return jsonError(error);
  }
}
