/**
 * A small generative grammar.
 *
 * Copy is built rather than looked up: a rule names a shape of sentence, its
 * parts name smaller parts, and the leaves are words. Nothing in a grammar is
 * a finished sentence, so the output is not one of N prewritten lines with the
 * names swapped in — it is assembled per match from clauses that have never
 * necessarily appeared in that combination before.
 *
 * Two rules keep it usable:
 *
 *   Seeded. One writer per subject, seeded on something fixed about it, so the
 *   same match always reads the same way. Prose that reshuffled on every page
 *   load would read as a glitch rather than as character.
 *
 *   Non-repeating. A writer remembers the alternatives it has already spent,
 *   so a single report works through a symbol's options before coming back to
 *   one. That is what stops three sentences in a row all saying "scored".
 */

export type Grammar = Record<string, readonly string[]>;

/** Small fast seeded PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(value: string | number): number {
  const text = String(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

const SYMBOL = /<([A-Za-z][A-Za-z0-9]*)>/;
const SLOT = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
const MAX_DEPTH = 12;

export type Vars = Record<string, string | number>;

/**
 * Tidies a generated string into a sentence: collapses the whitespace left by
 * empty expansions, pulls punctuation back onto the preceding word, resolves
 * "~a" to a or an by what follows it, and makes sure it opens with a capital
 * and closes with a stop.
 */
export function finish(raw: string): string {
  let out = raw
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?'’])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+—\s+/g, " — ")
    .replace(/,\s*,/g, ",")
    .replace(/\s*—\s*\./g, ".")
    .replace(/,\s*\./g, ".")
    .trim();

  out = out.replace(/~a\s+(\w)/g, (_m, first: string) =>
    /[aeiou]/i.test(first) ? `an ${first}` : `a ${first}`,
  );

  if (!out) return "";
  out = out[0].toUpperCase() + out.slice(1);
  if (!/[.!?]$/.test(out)) out += ".";
  return out;
}

export class Writer {
  private readonly rng: () => number;
  private readonly grammar: Grammar;
  private readonly spent = new Map<string, Set<number>>();

  // Assigned longhand rather than as constructor parameter properties, which
  // Node cannot run when it strips types to test these files directly.
  constructor(grammar: Grammar, seed: number) {
    this.grammar = grammar;
    this.rng = mulberry32(seed);
  }

  /** True when the grammar can produce this symbol at all. */
  has(symbol: string): boolean {
    return (this.grammar[symbol]?.length ?? 0) > 0;
  }

  /** Builds one sentence from `symbol`, or "" if the grammar cannot. */
  say(symbol: string, vars: Vars = {}): string {
    if (!this.has(symbol)) return "";
    return finish(this.expand(symbol, vars, 0));
  }

  /** Builds a fragment, left uncapitalised and unpunctuated for embedding. */
  fragment(symbol: string, vars: Vars = {}): string {
    if (!this.has(symbol)) return "";
    return this.expand(symbol, vars, 0).replace(/\s+/g, " ").trim();
  }

  /**
   * Picks an alternative this writer has not used yet, so a report cycles
   * through a symbol's wording instead of landing on the same choice twice.
   */
  private choose(symbol: string): string {
    const options = this.grammar[symbol] ?? [];
    let seen = this.spent.get(symbol);
    if (!seen || seen.size >= options.length) {
      seen = new Set<number>();
      this.spent.set(symbol, seen);
    }
    const free: number[] = [];
    for (let i = 0; i < options.length; i++) if (!seen.has(i)) free.push(i);
    const index = free[Math.floor(this.rng() * free.length)] ?? 0;
    seen.add(index);
    return options[index];
  }

  private expand(symbol: string, vars: Vars, depth: number): string {
    if (depth > MAX_DEPTH) return "";
    let text = this.choose(symbol);

    // Rewrite the leftmost symbol until none are left. Bounded so a grammar
    // that refers to itself cannot hang the request.
    for (let guard = 0; guard < 64; guard++) {
      const found = SYMBOL.exec(text);
      if (!found) break;
      const replacement = this.has(found[1]) ? this.expand(found[1], vars, depth + 1) : "";
      text = text.slice(0, found.index) + replacement + text.slice(found.index + found[0].length);
    }

    return text.replace(SLOT, (_m, key: string) => {
      const value = vars[key];
      return value === undefined || value === null ? "" : String(value);
    });
  }
}

/** English list: "a", "a and b", "a, b and c". */
export function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
