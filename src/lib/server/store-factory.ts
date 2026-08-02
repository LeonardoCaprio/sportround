import "server-only";

import { MemorySportRoundStore } from "./memory-store";
import type { SportRoundStore } from "./store";

let store: SportRoundStore | undefined;

export async function getStore(): Promise<SportRoundStore> {
  if (store) return store;

  if (process.env.DATA_BACKEND === "supabase") {
    const { SupabaseSportRoundStore } = await import("./supabase-store");
    store = new SupabaseSportRoundStore();
  } else {
    store = new MemorySportRoundStore();
  }

  return store;
}
