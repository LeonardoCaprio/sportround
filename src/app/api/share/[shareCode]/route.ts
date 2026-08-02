import { jsonError } from "@/lib/server/api";
import { getSharedSession } from "@/lib/server/session-service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareCode: string }> },
) {
  try {
    const { shareCode } = await params;
    return Response.json({ data: await getSharedSession(shareCode) });
  } catch (error) {
    return jsonError(error);
  }
}
