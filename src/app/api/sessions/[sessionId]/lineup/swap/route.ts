import type { NextRequest } from "next/server";

import { jsonError, readJson } from "@/lib/server/api";
import { hostCookieName } from "@/lib/server/security";
import { replaceLineupPlayer } from "@/lib/server/session-service";
import { swapLineupSchema } from "@/lib/validation/schemas";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const input = swapLineupSchema.parse(await readJson(request));
    const token = request.cookies.get(hostCookieName(sessionId))?.value;
    return Response.json({
      data: await replaceLineupPlayer(
        sessionId,
        token,
        input.assignmentId,
        input.replacementPlayerId,
      ),
    });
  } catch (error) {
    return jsonError(error);
  }
}
