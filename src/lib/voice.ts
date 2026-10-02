import { type Grammar, Writer, list, seedFrom } from "./grammar";

/**
 * The football grammar: how a match gets described.
 *
 * Nothing here is a sentence. The leaves are verbs, evaluations, codas and
 * venue phrases, and a report's sentences are assembled from them per match by
 * the writer in grammar.ts. A rout opening, for instance, is a structure
 * crossed with an evaluation crossed with a coda crossed with a venue — a few
 * hundred possible sentences from a couple of dozen words, rather than a list
 * of four finished lines.
 *
 * Only the wording is generated. Names, minutes, scores and points are passed
 * in as values and never invented here, and nothing in the vocabulary claims
 * anything the data does not say — no "deserved it", no "never looked like
 * scoring", because a scoreline does not know that.
 */

export { seedFrom, list };

export type MatchShape =
  | "rout"
  | "goalFest"
  | "comfortable"
  | "narrow"
  | "goalless"
  | "shareOfSpoils"
  | "heavyDefeat"
  | "clearDefeat"
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
  if (input.outcome === "D") return input.goalsFor === 0 ? "goalless" : "shareOfSpoils";
  if (input.outcome === "W") {
    if (input.goalsFor >= 4) return "goalFest";
    if (margin >= 3) return "rout";
    if (margin === 1) return "narrow";
    return "comfortable";
  }
  // Two goals is not a fine margin, and should not be described as one.
  if (margin <= -3) return "heavyDefeat";
  return margin === -2 ? "clearDefeat" : "narrowDefeat";
}

/* ------------------------------------------------------------- the grammar */

/** Structures shared by every shape: an evaluation, a verb, and an optional coda. */
const SHAPE_FRAMES: readonly string[] = [
  "<eval> <venue>",
  "<eval> <venue> <coda>",
  "<verb> <venue>",
  "<verb> <venue> <coda>",
  "<eval> <venue>, and <bare>",
];

type ShapeWords = {
  eval: readonly string[];
  verb: readonly string[];
  coda: readonly string[];
  /** Clauses that stand alone after "and", with no venue. */
  bare: readonly string[];
  /** Sentences about the opponent, which carry the venue implicitly. */
  victim?: readonly string[];
};

const SHAPES: Record<MatchShape, ShapeWords> = {
  rout: {
    eval: [
      "never in doubt",
      "no arguments",
      "all one way",
      "~a thorough afternoon's work",
      "comfortable from first to last",
      "about as routine as it gets",
    ],
    verb: ["cruised it", "strolled it", "ran away with it", "took this one apart"],
    coda: [
      "— settled long before the end",
      "— done early",
      "— one of the simpler afternoons",
      ", and the margin flattered nobody",
    ],
    bare: ["it was over by the hour", "three goals clear by the end"],
    victim: ["were taken apart", "had no reply", "were picked off", "never got going"],
  },
  goalFest: {
    eval: [
      "the goals would not stop",
      "~a proper haul",
      "everything went in",
      "~a afternoon of open gates",
      "the net kept bulging",
    ],
    verb: ["filled the net", "helped themselves", "kept going to the whistle"],
    coda: [
      "— nobody was counting by the end",
      "— a forward's day out",
      ", and the goal difference says thank you",
    ],
    bare: ["the goals kept arriving", "it never stopped at four"],
    victim: ["had no answer at all", "could not stem it", "were overrun"],
  },
  comfortable: {
    eval: [
      "~a solid win",
      "handled without much fuss",
      "controlled from early on",
      "never in much trouble",
      "professional enough",
    ],
    verb: ["saw it out", "did the job", "won it with a bit to spare"],
    coda: [
      "— never especially troubled",
      "— the second goal settled it",
      ", and it stayed at arm's length",
    ],
    bare: ["the two-goal cushion held", "it was managed rather than scrapped"],
  },
  narrow: {
    eval: [
      "~a single goal in it",
      "nervy to the end",
      "one goal was enough",
      "tight throughout",
      "~a narrow one",
    ],
    verb: ["edged it", "nicked it", "ground it out", "came through"],
    coda: [
      "— and it stayed that way",
      "— but the points came home",
      ", and that was the difference",
      "— no style marks, but three points",
    ],
    bare: ["the one goal held up", "it could have gone either way"],
  },
  goalless: {
    eval: [
      "nothing to report at either end",
      "~a goalless afternoon",
      "neither side could find ~a way through",
      "ninety minutes, no goals",
    ],
    verb: ["played out a blank", "shared a quiet one"],
    coda: ["— one point each", "— as flat as it sounds", ", and little else to say"],
    bare: ["the goalkeepers won the day", "a point each, and that is that"],
  },
  shareOfSpoils: {
    eval: [
      "honours even",
      "~a point apiece",
      "shared the goals and the points",
      "could not be separated",
      "level at the end",
    ],
    verb: ["split the points", "settled for one"],
    coda: [
      "— fair enough on the balance of it",
      "— both will feel they left something",
      ", and the points were shared",
    ],
    bare: ["neither could force it", "a point each in the end"],
  },
  heavyDefeat: {
    eval: [
      "one to forget",
      "comfortably beaten",
      "outplayed",
      "no excuses",
      "~a chastening afternoon",
    ],
    verb: ["came apart", "never turned up", "were well beaten"],
    coda: ["— this got away early", "— the margin was deserved", ", and little to take from it"],
    bare: ["it was three down and gone", "the game had gone by the break"],
    victim: ["had far too much", "were allowed to settle"],
  },
  clearDefeat: {
    eval: [
      "beaten by two",
      "second best on the day",
      "~a clear enough defeat",
      "outdone over the ninety",
    ],
    verb: ["came up short", "could not close the gap", "were held at arm's length"],
    coda: ["— two goals the difference", "— never quite in it", ", and the gap was real enough"],
    bare: ["two goals was the gap", "it did not turn on a single moment"],
  },
  narrowDefeat: {
    eval: [
      "beaten by the odd goal",
      "so close",
      "~a single goal decided it",
      "undone by a fine margin",
      "~a tight one lost",
    ],
    verb: ["fell just short", "came up one short", "lost the close one"],
    coda: [
      "— and still nothing to show for it",
      "— the wrong side of a tight one",
      ", which will sting",
    ],
    bare: ["one goal was the whole story", "it turned on very little"],
  },
  shootoutWin: {
    eval: ["survived the shootout", "through on penalties", "won it from twelve yards"],
    verb: ["held their nerve", "came through the kicks"],
    coda: ["— nerves intact", "— the hard way", ", and into the next round"],
    bare: ["the kicks went our way", "ninety minutes could not settle it"],
  },
  shootoutLoss: {
    eval: ["out on penalties", "the shootout went the other way", "beaten from twelve yards"],
    verb: ["fell at the kicks", "lost the lottery"],
    coda: ["— cruel", "— nothing between them until the kicks", ", and that run ends here"],
    bare: ["the kicks decided it", "ninety minutes could not separate them"],
  },
};

export type MatchContext = {
  shape: MatchShape;
  home: boolean;
  /** True when more than one goal is being described on our side. */
  ourMany: boolean;
  theirMany: boolean;
  weScored: boolean;
};

function matchGrammar(ctx: MatchContext): Grammar {
  const words = SHAPES[ctx.shape];

  const frames = [...SHAPE_FRAMES];
  // Only some shapes have anything to say about the opponent.
  if (words.victim?.length) frames.push("{opp} <victim>");

  return {
    opening: frames,
    eval: words.eval,
    verb: words.verb,
    coda: words.coda,
    bare: words.bare,
    victim: words.victim ?? [],

    venue: ctx.home
      ? ["at home to {opp}", "at home against {opp}", "on home soil against {opp}"]
      : ["away at {opp}", "away to {opp}", "on the road at {opp}"],

    /* ------------------------------------------------------------- goals */

    ourGoals: [
      "{names} <scoredV>",
      "the {goalNoun} came from {names}",
      "it was {names} who <scoredPlain>",
    ],
    scoredV: ctx.ourMany
      ? ["scored", "got on the scoresheet", "found the net", "got the goals", "did the scoring"]
      : ["scored", "got on the scoresheet", "found the net", "struck", "got it"],
    scoredPlain: ["scored", "found the net", "got there"],

    theirGoals: ["{names} <repliedV>", "{opp}'s {goalNoun} came from {names}", "for {opp}, {names} <repliedV>"],
    repliedV: ctx.weScored
      ? ctx.theirMany
        ? ["replied", "answered", "hit back", "responded"]
        : ["replied", "answered", "pulled one back", "got one back"]
      : ctx.theirMany
        ? ["did the damage", "had it all their own way", "scored freely"]
        : ["settled it", "had the only goal", "scored the one that mattered"],

    ownGoal: [
      "~a own goal from {names}",
      "{names} put it in {their} own net",
      "the ball came off {names} and in",
    ],
    ownGoals: ["own goals from {names}", "{names} both turned it into {their} own net"],

    assists: [
      "{names} laid {it} on",
      "{names} supplied {it}",
      "the {assistNoun} came from {names}",
      "{names} did the setting up",
      "{names} turned provider",
    ],

    cleanSheet: [
      "nothing conceded",
      "~a clean sheet to go with it",
      "the back line was not breached",
      "shut out at the other end",
      "no reply",
    ],

    blanked: [
      "nothing at the right end",
      "no way through at the other end",
      "the goal would not come",
      "blank up front",
    ],

    brace: ["~a brace for {name}", "{name} got two", "two from {name}", "{name} scored twice"],
    hatTrick: [
      "~a hat-trick for {name}",
      "three for {name}",
      "{name} scored three",
      "{name} took the match ball home",
    ],
    bigHaul: ["{goals} for {name} alone", "{name} scored {goals} of them"],

    lateWinner: [
      "{scorer} settled it at {minute}",
      "it took until {minute}, and {scorer} found it",
      "{scorer} left it late — {minute}",
      "the winner came at {minute}, through {scorer}",
    ],

    points: [
      "worth {n} {unit}",
      "{n} {unit} banked",
      "that is {n} {unit} on the board",
      "{n} {unit} from it",
      "{n} {unit} for the table",
    ],
    noPoints: [
      "nothing from it",
      "no points, no consolation",
      "nothing to show for it",
      "the table will not notice this one",
    ],

    unknownGoals: [
      "{n} {goalNoun}, scorers not recorded",
      "{n} {goalNoun}, with no scorer detail for this one",
    ],

    // ESPN sometimes lists only some of a match's goals. Saying nothing would
    // leave the report quietly contradicting its own scoreline.
    partialGoals: [
      "{missing} went in, {scorerNoun} not recorded",
      "the other {others} came without {scorerNoun} detail",
      "{missing}, {scorerNoun} not listed",
    ],
  };
}

/** A writer bound to one match, so a report never repeats its own wording. */
export function matchVoice(ctx: MatchContext, seed: number): Writer {
  return new Writer(matchGrammar(ctx), seed);
}

/* ------------------------------------------------------ head-to-head hype */

/**
 * The write-up above a countdown. Same deal: the stakes, the table, the last
 * meeting and the men in form are facts passed in as values, and the sentences
 * that carry them are built here.
 */
const DERBY_GRAMMAR: Grammar = {
  stakesOwned: [
    "{a} against {b} — <zeroSum>",
    "{a}'s {aClub} against {b}'s {bClub}, and <zeroSum>",
    "<noNeutrals>: {a} against {b}",
    "{a} and {b} meet in {comp}, and <zeroSum>",
  ],
  zeroSum: [
    "whatever one of them gains here, the other does not",
    "points here come straight out of the other's pocket",
    "only one of them is enjoying the evening",
    "there is no shared upside in this one",
  ],
  noNeutrals: [
    "no neutrals in this one",
    "nothing friendly about it",
    "bragging rights on the line",
  ],

  stakesPlain: [
    "{aClub} against {bClub} in {comp}",
    "{comp} brings {aClub} and {bClub} together",
    "{aClub} host {bClub}, {comp}",
  ],

  table: [
    "{aClub} come in {aRank} on {aPts} {aUnit}, {bClub} {bRank} on {bPts}",
    "{aRank} against {bRank} in the table — {aPts} {aUnit} against {bPts}",
    "the table has {aClub} {aRank} and {bClub} {bRank}",
    "{aClub} sit {aRank} with {aPts} {aUnit}; {bClub} are {bRank} with {bPts}",
  ],
  tableEarly: [
    "neither has a league position worth the name yet — it is that early",
    "too early for the table to mean much",
    "there is nothing in the standings to go on yet",
    "the table is still taking shape",
  ],

  lastDrawn: [
    "they drew {score} last time out, in {when}",
    "the last meeting finished {score}, back in {when}",
    "{score} when they last met, in {when}",
    "nothing between them last time: {score} in {when}",
  ],
  lastWon: [
    "{winner} took the last one {score}, back in {when}",
    "{winner} won the last meeting {score}, in {when}",
    "last time it was {winner}, {score}, in {when}",
    "{winner} had it {score} when these two last met, in {when}",
  ],

  watchTwo: [
    "{a} and {b} have been the ones finding the net",
    "{a} and {b} carry the goals into this",
    "the goals have been coming from {a} and {b}",
    "{a} and {b} are the two to watch",
  ],
  watchOne: [
    "{a} has been the one finding the net",
    "the goals have been coming from {a}",
    "{a} carries the threat",
    "{a} is the one to watch",
  ],
};

export function derbyVoice(seed: number): Writer {
  return new Writer(DERBY_GRAMMAR, seed);
}
