import { Redis } from "@upstash/redis";
import type { ChatMessage, Player } from "./types";

const K = {
  players: "bg:players",
  tokens: "bg:tokens",
  names: "bg:names",
  chat: "bg:chat",
  cache: (key: string) => `bg:cache:${key}`,
  lock: (key: string) => `bg:lock:${key}`,
};

export interface Store {
  kind: "redis" | "memory";
  cacheGet<T>(key: string): Promise<T | null>;
  cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  cacheDrop(key: string): Promise<void>;
  /** True when the caller took the lock. Used to throttle provider calls. */
  acquireLock(key: string, ttlSeconds: number): Promise<boolean>;
  listPlayers(): Promise<Player[]>;
  getPlayer(id: string): Promise<Player | null>;
  playerIdForToken(token: string): Promise<string | null>;
  claimName(name: string, playerId: string): Promise<boolean>;
  savePlayer(player: Player, token: string): Promise<void>;
  deletePlayer(id: string): Promise<void>;
  /**
   * Appends atomically and trims to `cap`. A read-modify-write on a plain key
   * would drop messages whenever two people posted at once.
   */
  pushChat(message: ChatMessage, cap: number): Promise<void>;
  /** Newest first. */
  listChat(limit: number): Promise<ChatMessage[]>;
  reset(): Promise<void>;
}

/**
 * Upstash serialises values itself, so a stored object may come back already
 * parsed or still as a string depending on the client version. Handle both.
 */
function asMessage(raw: unknown): ChatMessage | null {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (value && typeof value === "object" && typeof (value as ChatMessage).text === "string") {
      return value as ChatMessage;
    }
  } catch {
    /* a corrupt entry should not take the whole log down */
  }
  return null;
}

function redisCredentials(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url, token };
  return null;
}

function normaliseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/* ------------------------------------------------------------------ redis */

function createRedisStore(url: string, token: string): Store {
  const redis = new Redis({ url, token });

  const readPlayer = async (id: string): Promise<Player | null> =>
    ((await redis.hget(K.players, id)) as Player | null) ?? null;

  return {
    kind: "redis",

    async cacheGet<T>(key: string) {
      return ((await redis.get(K.cache(key))) as T | null) ?? null;
    },

    async cacheSet<T>(key: string, value: T, ttlSeconds: number) {
      await redis.set(K.cache(key), value, { ex: ttlSeconds });
    },

    async cacheDrop(key: string) {
      await redis.del(K.cache(key));
    },

    async acquireLock(key: string, ttlSeconds: number) {
      const res = await redis.set(K.lock(key), Date.now(), { nx: true, ex: ttlSeconds });
      return res === "OK";
    },

    async listPlayers() {
      const all = ((await redis.hgetall(K.players)) as Record<string, Player> | null) ?? {};
      return Object.values(all).filter(Boolean);
    },

    getPlayer: readPlayer,

    async playerIdForToken(token: string) {
      return ((await redis.hget(K.tokens, token)) as string | null) ?? null;
    },

    async claimName(name: string, playerId: string) {
      const ok = await redis.hsetnx(K.names, normaliseName(name), playerId);
      return ok === 1;
    },

    async savePlayer(player: Player, token: string) {
      await redis.hset(K.players, { [player.id]: player });
      await redis.hset(K.tokens, { [token]: player.id });
    },

    async deletePlayer(id: string) {
      const player = await readPlayer(id);
      await redis.hdel(K.players, id);
      if (player) await redis.hdel(K.names, normaliseName(player.name));
      const tokens = ((await redis.hgetall(K.tokens)) as Record<string, string> | null) ?? {};
      const mine = Object.entries(tokens)
        .filter(([, pid]) => pid === id)
        .map(([t]) => t);
      if (mine.length) await redis.hdel(K.tokens, ...mine);
    },

    async pushChat(message: ChatMessage, cap: number) {
      await redis.lpush(K.chat, JSON.stringify(message));
      await redis.ltrim(K.chat, 0, cap - 1);
    },

    async listChat(limit: number) {
      const raw = (await redis.lrange(K.chat, 0, limit - 1)) as unknown[];
      return raw.map(asMessage).filter((m): m is ChatMessage => m !== null);
    },

    async reset() {
      await redis.del(K.players, K.tokens, K.names, K.chat);
    },
  };
}

/* ----------------------------------------------------------------- memory */

type MemoryData = {
  players: Map<string, Player>;
  tokens: Map<string, string>;
  names: Map<string, string>;
  cache: Map<string, { value: unknown; expires: number }>;
  locks: Map<string, number>;
  chat: ChatMessage[];
};

// Survives hot reloads in dev; does NOT survive between serverless invocations,
// which is exactly why Redis is recommended for anything shared.
const globalMemory = globalThis as unknown as { __ballgame?: MemoryData };
const memory: MemoryData = (globalMemory.__ballgame ??= {
  players: new Map(),
  tokens: new Map(),
  names: new Map(),
  cache: new Map(),
  locks: new Map(),
  chat: [],
});

function createMemoryStore(): Store {
  const readPlayer = async (id: string): Promise<Player | null> =>
    memory.players.get(id) ?? null;

  return {
    kind: "memory",

    async cacheGet<T>(key: string) {
      const hit = memory.cache.get(key);
      if (!hit) return null;
      if (hit.expires < Date.now()) {
        memory.cache.delete(key);
        return null;
      }
      return hit.value as T;
    },

    async cacheSet<T>(key: string, value: T, ttlSeconds: number) {
      memory.cache.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
    },

    async cacheDrop(key: string) {
      memory.cache.delete(key);
    },

    async acquireLock(key: string, ttlSeconds: number) {
      const until = memory.locks.get(key) ?? 0;
      if (until > Date.now()) return false;
      memory.locks.set(key, Date.now() + ttlSeconds * 1000);
      return true;
    },

    async listPlayers() {
      return [...memory.players.values()];
    },

    getPlayer: readPlayer,

    async playerIdForToken(token: string) {
      return memory.tokens.get(token) ?? null;
    },

    async claimName(name: string, playerId: string) {
      const key = normaliseName(name);
      if (memory.names.has(key)) return false;
      memory.names.set(key, playerId);
      return true;
    },

    async savePlayer(player: Player, token: string) {
      memory.players.set(player.id, player);
      memory.tokens.set(token, player.id);
    },

    async deletePlayer(id: string) {
      const player = memory.players.get(id);
      memory.players.delete(id);
      if (player) memory.names.delete(normaliseName(player.name));
      for (const [token, pid] of memory.tokens) {
        if (pid === id) memory.tokens.delete(token);
      }
    },

    async pushChat(message: ChatMessage, cap: number) {
      memory.chat.unshift(message);
      if (memory.chat.length > cap) memory.chat.length = cap;
    },

    async listChat(limit: number) {
      return memory.chat.slice(0, limit);
    },

    async reset() {
      memory.players.clear();
      memory.tokens.clear();
      memory.names.clear();
      memory.chat.length = 0;
    },
  };
}

let store: Store | null = null;

export function getStore(): Store {
  if (store) return store;
  const creds = redisCredentials();
  store = creds ? createRedisStore(creds.url, creds.token) : createMemoryStore();
  return store;
}
