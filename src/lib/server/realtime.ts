import "server-only";

import { SESSION_UPDATED_EVENT, sessionRealtimeTopic } from "@/lib/realtime";

export async function broadcastSessionUpdate(shareCode: string): Promise<boolean> {
  if (process.env.DATA_BACKEND !== "supabase") return false;

  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secretKey) return false;

  const topic = encodeURIComponent(sessionRealtimeTopic(shareCode));

  try {
    const response = await fetch(
      `${url}/realtime/v1/api/broadcast/${topic}/events/${SESSION_UPDATED_EVENT}`,
      {
        method: "POST",
        headers: {
          apikey: secretKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ changedAt: new Date().toISOString() }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      console.error(`Realtime broadcast failed with status ${response.status}.`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Realtime broadcast could not be delivered.", error);
    return false;
  }
}
