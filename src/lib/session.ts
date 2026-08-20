import { cookies } from "next/headers";
import { getStore } from "./store";
import type { Player } from "./types";

export const PLAYER_COOKIE = "ballgame_player";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // a full season and then some

export function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function currentToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(PLAYER_COOKIE)?.value ?? null;
}

/**
 * The player this browser is signed in as, if any. A storage outage reads as
 * "signed out" rather than taking the whole page down with it.
 */
export async function currentPlayer(): Promise<Player | null> {
  try {
    const token = await currentToken();
    if (!token) return null;
    const store = getStore();
    const id = await store.playerIdForToken(token);
    if (!id) return null;
    return await store.getPlayer(id);
  } catch {
    return null;
  }
}
