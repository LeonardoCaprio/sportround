import type { NextRequest } from "next/server";

import { jsonError, readJson } from "@/lib/server/api";
import { hostCookieName } from "@/lib/server/security";
import { substitutePlayer } from "@/lib/server/session-service";
import { substituteSchema } from "@/lib/validation/schemas";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; matchId: string }> },
) {
  try {
    const { sessionId, matchId } = await params;
    const input = substituteSchema.parse(await readJson(request));
    const token = request.cookies.get(hostCookieName(sessionId))?.value;
    return Response.json({
      data: await substitutePlayer(
        sessionId,
        matchId,
        token,
        input.outgoingAssignmentId,
        input.replacementPlayerId,
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}
