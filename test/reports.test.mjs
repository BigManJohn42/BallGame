import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReport, inForm } from "../src/lib/reports.ts";

/**
 * These assert facts and behaviour, never exact wording — the prose is
 * generated, so pinning a sentence would only test the grammar's current mood.
 * What must hold is that the words never contradict the data.
 */

const ev = (teamId, scorer, minute, opts = {}) => ({
  kind: opts.ownGoal ? "Own Goal" : "Goal",
  ownGoal: !!opts.ownGoal,
  penalty: !!opts.penalty,
  minute,
  scorer,
  assist: opts.assist ?? null,
  teamId,
});

const match = (over = {}) => ({
  fixtureId: 1,
  teamId: 110,
  competitionId: 1,
  competitionName: "Serie A",
  round: "",
  date: "2026-05-01T18:00Z",
  opponent: "Bologna",
  opponentLogo: "",
  home: false,
  goalsFor: 3,
  goalsAgainst: 3,
  outcome: "D",
  viaPenalties: false,
  points: 4,
  ...over,
});

const report = (m, events) =>
  buildReport({ match: m, teamName: "Internazionale", teamLogo: "", events });

/** The 3-3 at Bologna that exposed the own-goal bug. */
const BOLOGNA_EVENTS = [
  ev(110, "Federico Dimarco", "22'"),
  ev(107, "Federico Bernardeschi", "25'"),
  ev(107, "Tommaso Pobega", "42'"),
  ev(107, "Piotr Zielinski", "48'", { ownGoal: true }),
  ev(110, "Pio Esposito", "64'"),
  ev(110, "Andy Diouf", "86'"),
];

describe("own goals belong to the side they count for", () => {
  const r = report(match(), BOLOGNA_EVENTS);

  it("credits us with exactly our goals", () => {
    assert.equal(r.scorers.length, 3);
  });

  it("does not credit us with the opposition's own goal", () => {
    assert.ok(!r.scorers.some((s) => s.name === "Piotr Zielinski"));
  });

  it("names the right three", () => {
    assert.deepEqual(
      r.scorers.map((s) => s.name),
      ["Federico Dimarco", "Pio Esposito", "Andy Diouf"],
    );
  });

  it("mentions everyone who scored, either side", () => {
    for (const name of BOLOGNA_EVENTS.map((e) => e.scorer)) {
      assert.ok(r.body.includes(name), `${name} missing from: ${r.body}`);
    }
  });

  it("describes the own goal as one", () => {
    assert.match(r.body, /own net|own goal|came off Piotr Zielinski/i);
  });

  it("does not describe our scorers as own goals", () => {
    assert.ok(!/own (goal|net)[^.]*(Dimarco|Esposito|Diouf)/i.test(r.body));
  });

  it("an own goal in our favour counts as ours", () => {
    const verona = report(
      match({ fixtureId: 2, home: true, opponent: "Hellas Verona", goalsFor: 1, goalsAgainst: 1, points: 2 }),
      [ev(110, "Andrias Edmundsson", "47'", { ownGoal: true }), ev(119, "Kieron Bowie", "90'+1'")],
    );
    assert.equal(verona.scorers.length, 1);
    assert.equal(verona.scorers[0].ownGoal, true);
    assert.ok(!/\b\d+ scored\b/.test(verona.body), verona.body);
  });
});

describe("facts survive the generated wording", () => {
  it("keeps a brace as one name with both minutes", () => {
    const r = report(
      match({ fixtureId: 3, goalsFor: 2, goalsAgainst: 1, outcome: "W", points: 5 }),
      [ev(110, "Lautaro", "10'"), ev(110, "Lautaro", "70'"), ev(107, "Z", "80'")],
    );
    assert.match(r.body, /Lautaro \(10', 70'\)/);
    assert.match(r.body, /brace|two|twice/i);
  });

  it("calls out a hat-trick", () => {
    const r = report(
      match({ fixtureId: 4, goalsFor: 3, goalsAgainst: 0, outcome: "W", points: 8 }),
      [ev(110, "Thuram", "10'"), ev(110, "Thuram", "40'"), ev(110, "Thuram", "70'")],
    );
    assert.match(r.body, /hat-trick|three|match ball/i);
  });

  it("notes a clean sheet and names the assister", () => {
    const r = report(
      match({ fixtureId: 5, goalsFor: 1, goalsAgainst: 0, outcome: "W", points: 6 }),
      [ev(110, "Lautaro", "35'", { assist: "Dumfries" })],
    );
    assert.match(r.body, /clean sheet|nothing conceded|not breached|shut out|no reply/i);
    assert.ok(r.body.includes("Dumfries"));
  });

  it("always states the points", () => {
    const r = report(
      match({ fixtureId: 5, goalsFor: 1, goalsAgainst: 0, outcome: "W", points: 6 }),
      [ev(110, "Lautaro", "35'")],
    );
    assert.match(r.body, /\b6 points?\b/);
  });

  it("accounts for goals ESPN did not name a scorer for", () => {
    // A real 2-2 where ESPN listed three of the four goals.
    const r = report(
      match({ fixtureId: 12, goalsFor: 2, goalsAgainst: 2, outcome: "D", points: 4 }),
      [ev(110, "Thuram", "23'"), ev(110, "Bisseck", "61'"), ev(107, "Simeone", "70'")],
    );
    assert.match(r.body, /not recorded|without scorer detail|not listed/i, r.body);
    assert.match(r.body, /\bone\b/i, `should say one goal is unaccounted for: ${r.body}`);
  });

  it("says nothing about missing goals when every one is named", () => {
    const r = report(
      match({ fixtureId: 13, goalsFor: 2, goalsAgainst: 1, outcome: "W", points: 5 }),
      [ev(110, "A", "10'"), ev(110, "B", "20'"), ev(107, "C", "30'")],
    );
    assert.doesNotMatch(r.body, /not recorded|not listed|without scorer detail/i, r.body);
  });

  it("says so when there is no scorer detail", () => {
    const r = report(match({ fixtureId: 8, goalsFor: 2, goalsAgainst: 0, outcome: "W", points: 7 }), null);
    assert.equal(r.detailed, false);
    assert.match(r.body, /not recorded|no scorer detail/i);
  });
});

describe("a late goal is only news when it decided the match", () => {
  it("gets its own line when it won it", () => {
    const r = report(
      match({ fixtureId: 6, goalsFor: 2, goalsAgainst: 1, outcome: "W", points: 5 }),
      [ev(110, "A", "10'"), ev(110, "B", "88'"), ev(107, "C", "20'")],
    );
    assert.ok((r.body.match(/88'/g) || []).length >= 2, `88' should appear twice: ${r.body}`);
  });

  it("credits the latest goal, not the first late one", () => {
    // The real 3-2 against Como: 69', 86' and the winner at 89'.
    const r = report(
      match({ fixtureId: 14, home: true, opponent: "Como", goalsFor: 3, goalsAgainst: 2, outcome: "W", points: 6 }),
      [
        ev(110, "Calhanoglu", "69'"),
        ev(110, "Calhanoglu", "86'"),
        ev(110, "Sucic", "89'"),
        ev(2572, "Baturina", "32'"),
        ev(2572, "Da Cunha", "48'"),
      ],
    );
    const winner = r.body.match(/(Sucic|Calhanoglu)[^.]*89'|89'[^.]*(Sucic|Calhanoglu)/);
    assert.ok(winner, `no late-winner line naming 89': ${r.body}`);
    assert.ok(/Sucic/.test(winner[0]), `the 89' winner should be Sucic: ${winner[0]}`);
  });

  it("counts stoppage time as later than the 90th", () => {
    const r = report(
      match({ fixtureId: 15, goalsFor: 2, goalsAgainst: 1, outcome: "W", points: 5 }),
      [ev(110, "Early", "86'"), ev(110, "Latest", "90'+4'"), ev(107, "X", "20'")],
    );
    const line = r.body.split(". ").find((s) => /90'\+4'/.test(s));
    assert.ok(line && /Latest/.test(line), `stoppage-time winner not credited: ${r.body}`);
  });

  it("is not repeated in a rout", () => {
    const r = report(
      match({ fixtureId: 7, goalsFor: 4, goalsAgainst: 0, outcome: "W", points: 9 }),
      [ev(110, "A", "10'"), ev(110, "B", "20'"), ev(110, "C", "30'"), ev(110, "D", "89'")],
    );
    assert.equal((r.body.match(/89'/g) || []).length, 1, r.body);
  });
});

describe("tone follows the result", () => {
  const blanked = report(
    match({ fixtureId: 9, home: true, goalsFor: 0, goalsAgainst: 1, outcome: "L", points: 0 }),
    [ev(107, "Orsolini", "78'")],
  );

  it("says plainly that nothing was scored", () => {
    assert.match(blanked.body, /nothing at the right end|no way through|would not come|blank up front/i);
  });

  it("does not call their goal a reply when we scored none", () => {
    assert.ok(!/replied|pulled one back|answered|got one back/i.test(blanked.body), blanked.body);
  });

  it("does not talk about banking zero points", () => {
    assert.ok(!/0 points? (banked|on the board)/i.test(blanked.body), blanked.body);
    assert.match(blanked.body, /nothing from it|no points|nothing to show|will not notice/i);
  });
});

describe("the wording matches the scoreline", () => {
  const narrowish = /odd goal|fine margin|single goal|one short|tight one|so close/i;

  it("does not call a two-goal defeat a narrow one", () => {
    for (let i = 0; i < 80; i++) {
      const body = report(
        match({ fixtureId: 30000 + i, goalsFor: 1, goalsAgainst: 3, outcome: "L", points: 1 }),
        [ev(110, "A", "30'"), ev(107, "B", "20'"), ev(107, "C", "50'"), ev(107, "D", "70'")],
      ).body;
      assert.doesNotMatch(body, narrowish, `two-goal defeat described as narrow: ${body}`);
    }
  });

  it("still calls a one-goal defeat narrow", () => {
    const seen = new Set();
    for (let i = 0; i < 80; i++) {
      seen.add(
        report(
          match({ fixtureId: 31000 + i, goalsFor: 1, goalsAgainst: 2, outcome: "L", points: 1 }),
          [ev(110, "A", "30'"), ev(107, "B", "20'"), ev(107, "C", "50'")],
        ).body,
      );
    }
    assert.ok([...seen].some((b) => narrowish.test(b)), "no narrow-defeat wording at all");
  });

  it("does not call a three-goal defeat narrow either", () => {
    for (let i = 0; i < 60; i++) {
      const body = report(
        match({ fixtureId: 32000 + i, goalsFor: 0, goalsAgainst: 3, outcome: "L", points: 0 }),
        [ev(107, "B", "20'")],
      ).body;
      assert.doesNotMatch(body, narrowish, `heavy defeat described as narrow: ${body}`);
    }
  });

  it("notes the clean sheet in a goalless draw", () => {
    const r = report(
      match({ fixtureId: 33000, goalsFor: 0, goalsAgainst: 0, outcome: "D", points: 3 }),
      [],
    );
    assert.match(r.body, /clean sheet|nothing conceded|not breached|shut out|no reply/i, r.body);
  });
});

describe("generated, but stable", () => {
  it("reads the same way every time for the same match", () => {
    const a = report(match(), BOLOGNA_EVENTS);
    const b = report(match(), BOLOGNA_EVENTS);
    assert.equal(a.body, b.body);
  });

  it("reads differently across fixtures", () => {
    const bodies = new Set();
    const openers = new Set();
    for (let i = 0; i < 60; i++) {
      const r = report(
        match({ fixtureId: 1000 + i, goalsFor: 2, goalsAgainst: 0, outcome: "W", points: 7 }),
        [ev(110, "A", "10'"), ev(110, "B", "20'")],
      );
      bodies.add(r.body);
      openers.add(r.body.split(".")[0]);
    }
    // Identical facts, 60 fixtures: the wording still has to move around.
    assert.ok(openers.size >= 20, `only ${openers.size} distinct openings`);
    assert.ok(bodies.size >= 30, `only ${bodies.size} distinct reports`);
  });

  it("does not repeat a verb inside one report", () => {
    const r = report(
      match({ fixtureId: 11, goalsFor: 2, goalsAgainst: 2, outcome: "D", points: 4 }),
      [ev(110, "A", "10'"), ev(110, "B", "20'"), ev(107, "C", "30'"), ev(107, "D", "40'")],
    );
    const scored = (r.body.match(/\bscored\b/g) || []).length;
    assert.ok(scored <= 1, `"scored" used ${scored} times: ${r.body}`);
  });

  it("produces clean sentences for every shape", () => {
    const shapes = [
      { goalsFor: 4, goalsAgainst: 0, outcome: "W", points: 9 },
      { goalsFor: 3, goalsAgainst: 0, outcome: "W", points: 8 },
      { goalsFor: 2, goalsAgainst: 0, outcome: "W", points: 7 },
      { goalsFor: 2, goalsAgainst: 1, outcome: "W", points: 5 },
      { goalsFor: 0, goalsAgainst: 0, outcome: "D", points: 1 },
      { goalsFor: 1, goalsAgainst: 1, outcome: "D", points: 2 },
      { goalsFor: 0, goalsAgainst: 3, outcome: "L", points: 0 },
      { goalsFor: 1, goalsAgainst: 3, outcome: "L", points: 1 },
      { goalsFor: 1, goalsAgainst: 2, outcome: "L", points: 1 },
      { goalsFor: 1, goalsAgainst: 1, outcome: "W", points: 2, viaPenalties: true },
      { goalsFor: 1, goalsAgainst: 1, outcome: "L", points: 1, viaPenalties: true },
    ];
    for (const [i, over] of shapes.entries()) {
      for (let seed = 0; seed < 40; seed++) {
        const body = report(match({ fixtureId: 5000 + i * 100 + seed, ...over }), [
          ...(over.goalsFor > 0 ? [ev(110, "A", "10'")] : []),
          ...(over.goalsAgainst > 0 ? [ev(107, "B", "20'")] : []),
        ]).body;

        assert.ok(body.length > 0, "empty body");
        // Whatever shape the sentence takes, it has to say who they played.
        assert.ok(body.includes("Bologna"), `opponent not named: ${body}`);
        assert.doesNotMatch(body, /\s{2,}/, `double space: ${body}`);
        assert.doesNotMatch(body, /\s[,.]/, `space before punctuation: ${body}`);
        assert.doesNotMatch(body, /~a/, `unresolved article: ${body}`);
        assert.doesNotMatch(body, /[<>{}]/, `unexpanded symbol or slot: ${body}`);
        assert.doesNotMatch(body, /\.\./, `doubled stop: ${body}`);
        assert.doesNotMatch(body, /\ba [aeiou]/i, `"a" before a vowel: ${body}`);
        assert.doesNotMatch(body, /\ban [^aeiou]/i, `"an" before a consonant: ${body}`);
        assert.match(body, /^[A-Z{]/, `does not open with a capital: ${body}`);
        assert.match(body, /[.!?]$/, `does not close with a stop: ${body}`);
      }
    }
  });
});

describe("in form", () => {
  const form = inForm({
    teamId: 110,
    matches: [
      { match: match(), events: [ev(110, "Lautaro", "10'", { assist: "Dimarco" }), ev(107, "Other", "20'")] },
      { match: match(), events: [ev(110, "Lautaro", "30'"), ev(110, "Thuram", "40'", { assist: "Lautaro" })] },
      { match: match(), events: [ev(110, "Zielinski", "50'", { ownGoal: true })] },
    ],
    window: 5,
  });

  it("counts goals and assists", () => {
    assert.equal(form[0].name, "Lautaro");
    assert.equal(form[0].goals, 2);
    assert.equal(form[0].assists, 1);
  });

  it("ignores the opposition and own goals", () => {
    assert.ok(!form.some((p) => p.name === "Other"));
    assert.ok(!form.some((p) => p.name === "Zielinski"));
  });

  it("has nothing to say without events", () => {
    assert.equal(inForm({ teamId: 110, matches: [{ match: match(), events: null }], window: 5 }).length, 0);
  });
});
