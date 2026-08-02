import { jsonError, readJson } from "@/lib/server/api";
import { saveSharedScore } from "@/lib/server/session-service";
import { finalScoreSchema } from "@/lib/validation/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareCode: string; matchId: string }> },
) {
  try {
    const { shareCode, matchId } = await params;
    const score = finalScoreSchema.parse(await readJson(request));
    return Response.json({ data: await saveSharedScore(shareCode, matchId, score) });
  } catch (error) {
    return jsonError(error);
  }
}
