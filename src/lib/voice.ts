/**
 * Phrasing for generated copy.
 *
 * Every choice is seeded on something fixed about the thing being described —
 * a fixture id, usually — so the same match always reads the same way. Variety
 * that reshuffled on each page load would read as a glitch, not as character.
 *
 * Only the wording varies. Names, minutes, scores and points are always
 * generated from the data, never from here.
 */

export function seedFrom(value: string | number): number {
  const text = String(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/** Deterministic choice. `salt` keeps two picks on the same seed independent. */
export function pick<T>(options: readonly T[], seed: number, salt = 0): T {
  if (!options.length) throw new Error("pick called with no options");
  return options[(seed + salt * 2654435761) % options.length];
}

/* --------------------------------------------------------------- results */

export type MatchShape =
  | "rout"
  | "goalFest"
  | "comfortable"
  | "narrow"
  | "goalless"
  | "shareOfSpoils"
  | "heavyDefeat"
  | "narrowDefeat"
  | "shootoutWin"
  | "shootoutLoss";

export function shapeOf(input: {
  outcome: "W" | "D" | "L";
  goalsFor: number;
  goalsAgainst: number;
  viaPenalties: boolean;
}): MatchShape {
  const margin = input.goalsFor - input.goalsAgainst;
  if (input.viaPenalties) return input.outcome === "W" ? "shootoutWin" : "shootoutLoss";
  if (input.outcome === "D") {
    return input.goalsFor === 0 ? "goalless" : "shareOfSpoils";
  }
  if (input.outcome === "W") {
    if (input.goalsFor >= 4) return "goalFest";
    if (margin >= 3) return "rout";
    if (margin === 1) return "narrow";
    return "comfortable";
  }
  return margin <= -3 ? "heavyDefeat" : "narrowDefeat";
}

/** {opp} is filled in by the caller; {where} becomes "at home to" or "away at". */
const OPENERS: Record<MatchShape, readonly string[]> = {
  rout: [
    "No arguments {where} {opp} — this one was settled early.",
    "A thorough afternoon's work {where} {opp}.",
    "{opp} were taken apart.",
    "About as comfortable as it gets {where} {opp}.",
  ],
  goalFest: [
    "The goals would not stop {where} {opp}.",
    "A proper haul {where} {opp}.",
    "Four or more, and {opp} had no answer.",
    "Someone left the gate open {where} {opp}.",
  ],
  comfortable: [
    "Handled {where} {opp} without much fuss.",
    "A solid win {where} {opp}.",
    "Two clear goals and the job was done {where} {opp}.",
    "Controlled from early on {where} {opp}.",
  ],
  narrow: [
    "A single goal in it {where} {opp}, and it stayed that way.",
    "Nervy to the end {where} {opp}, but the points came home.",
    "Won it the hard way {where} {opp}.",
    "One goal was enough {where} {opp}. Only just.",
  ],
  goalless: [
    "Nothing to report at either end {where} {opp}.",
    "A goalless afternoon {where} {opp}.",
    "Neither side could find a way through {where} {opp}.",
    "Ninety minutes, no goals, one point {where} {opp}.",
  ],
  shareOfSpoils: [
    "Honours even {where} {opp}.",
    "A point apiece {where} {opp}.",
    "Shared the goals and the points {where} {opp}.",
    "Could not be separated {where} {opp}.",
  ],
  heavyDefeat: [
    "One to forget {where} {opp}.",
    "Comfortably beaten {where} {opp}.",
    "This got away early {where} {opp}.",
    "No excuses {where} {opp} — outplayed.",
  ],
  narrowDefeat: [
    "Beaten by the odd goal {where} {opp}.",
    "So close {where} {opp}, and still nothing to show for it.",
    "A single goal decided it {where} {opp}, the wrong way.",
    "Undone by a fine margin {where} {opp}.",
  ],
  shootoutWin: [
    "Survived the shootout {where} {opp}.",
    "Through on penalties {where} {opp}, with the nerves intact.",
    "It went to spot kicks {where} {opp}, and they held.",
  ],
  shootoutLoss: [
    "Out on penalties {where} {opp}. Cruel.",
    "The shootout went the other way {where} {opp}.",
    "Beaten from twelve yards {where} {opp}.",
  ],
};

export function opener(shape: MatchShape, where: string, opponent: string, seed: number): string {
  return pick(OPENERS[shape], seed)
    .replace("{where}", where)
    .replace("{opp}", opponent);
}

const SCORED_VERBS = ["scored", "got on the scoresheet", "found the net", "did the damage"] as const;
const REPLIED_VERBS = ["replied", "pulled one back", "answered", "responded"] as const;
const REPLIED_PLURAL = ["replied", "hit back", "answered"] as const;
/** Nothing was scored at our end, so there is nothing for them to reply to. */
const UNANSWERED_VERBS = ["settled it", "had the only goal", "made it count"] as const;
const UNANSWERED_PLURAL = ["did the damage", "had it all their own way", "ran through us"] as const;

export function scoredVerb(seed: number): string {
  return pick(SCORED_VERBS, seed, 1);
}

export function repliedVerb(seed: number, many: boolean, weScored: boolean): string {
  if (!weScored) return pick(many ? UNANSWERED_PLURAL : UNANSWERED_VERBS, seed, 9);
  return pick(many ? REPLIED_PLURAL : REPLIED_VERBS, seed, 2);
}

const BLANKED = [
  "Nothing at the right end.",
  "No way through at the other end.",
  "The goal would not come.",
  "Blank at our end.",
] as const;

export function blankedPhrase(seed: number): string {
  return pick(BLANKED, seed, 10);
}

const ASSIST_PHRASES = [
  "{names} laid {it} on.",
  "{names} supplied {it}.",
  "The {assist} came from {names}.",
  "{names} did the setting up.",
] as const;

export function assistPhrase(names: string, many: boolean, seed: number): string {
  return pick(ASSIST_PHRASES, seed, 3)
    .replace("{names}", names)
    .replace("{it}", many ? "them" : "it")
    .replace("{assist}", many ? "assists" : "assist");
}

const CLEAN_SHEET = [
  "Nothing conceded.",
  "A clean sheet to go with it.",
  "The back line was not breached.",
  "Shut out at the other end.",
] as const;

export function cleanSheetPhrase(seed: number): string {
  return pick(CLEAN_SHEET, seed, 4);
}

/** A brace or better deserves saying out loud. */
export function haulPhrase(name: string, goals: number, seed: number): string | null {
  if (goals >= 3) {
    return pick(
      [
        `A hat-trick for ${name}.`,
        `${name} helped himself to three.`,
        `Three of them from ${name} alone.`,
      ],
      seed,
      5,
    );
  }
  if (goals === 2) {
    return pick(
      [`A brace for ${name}.`, `${name} got two.`, `Two from ${name}.`],
      seed,
      6,
    );
  }
  return null;
}

/** Something happening after the 85th minute is worth a line. */
export function latePhrase(minute: string, scorer: string, decisive: boolean, seed: number): string {
  return pick(
    decisive
      ? [
          `${scorer} settled it at ${minute}.`,
          `It took until ${minute}, and ${scorer} found it.`,
          `${scorer} left it late — ${minute}.`,
        ]
      : [
          `${scorer} struck at ${minute}.`,
          `There was still time for ${scorer} at ${minute}.`,
        ],
    seed,
    7,
  );
}

const POINTS_TAIL = [
  "Worth {n} {unit}.",
  "{n} {unit} banked.",
  "That is {n} {unit} on the board.",
  "{n} {unit} from it.",
] as const;

/** "0 points banked" reads like a joke, so nothing gained gets its own line. */
const NO_POINTS = [
  "Nothing from it.",
  "No points, no consolation.",
  "Nothing to show for it.",
] as const;

export function pointsPhrase(points: number, seed: number): string {
  if (points <= 0) return pick(NO_POINTS, seed, 11);
  return pick(POINTS_TAIL, seed, 8)
    .replace("{n}", String(points))
    .replace("{unit}", points === 1 ? "point" : "points");
}
