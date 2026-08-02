import type { NextRequest } from "next/server";

import { jsonError, readJson } from "@/lib/server/api";
import { hostCookieName } from "@/lib/server/security";
import { saveHostScore } from "@/lib/server/session-service";
import { finalScoreSchema } from "@/lib/validation/schemas";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; matchId: string }> },
) {
  try {
    const { sessionId, matchId } = await params;
    const score = finalScoreSchema.parse(await readJson(request));
    const token = request.cookies.get(hostCookieName(sessionId))?.value;
    return Response.json({ data: await saveHostScore(sessionId, matchId, token, score) });
  } catch (error) {
    return jsonError(error);
  }
}
