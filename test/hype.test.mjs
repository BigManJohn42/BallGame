import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHype } from "../src/lib/hype.ts";

const row = (teamId, name, rank, points, played = 6) => ({
  teamId, name, rank, points, played,
  logo: "", won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, form: [],
});

const base = {
  fixtureId: 501,
  homeTeamId: 110,
  homeName: "Internazionale",
  homeOwner: "Adam",
  awayTeamId: 103,
  awayName: "AC Milan",
  awayOwner: "Sam",
  competitionName: "Serie A",
  headToHead: {
    summary: "Inter 4 wins, Milan 3, 3 draws",
    meetings: [
      { date: "2026-02-15T19:45Z", homeName: "AC Milan", awayName: "Internazionale", homeScore: 1, awayScore: 2 },
    ],
  },
  homeRow: row(110, "Internazionale", 2, 14),
  awayRow: row(103, "AC Milan", 5, 11),
  homeScorer: { name: "Lautaro Martínez", goals: 7 },
  awayScorer: { name: "Rafael Leão", goals: 5 },
};

const hype = (over = {}) => buildHype({ ...base, ...over });

describe("derby write-ups carry the facts", () => {
  const h = hype();

  it("names both owners and both clubs somewhere", () => {
    assert.ok(h.blurb.includes("Adam") && h.blurb.includes("Sam"), h.blurb);
  });

  it("states both league positions and points", () => {
    assert.match(h.blurb, /2nd/);
    assert.match(h.blurb, /5th/);
    assert.match(h.blurb, /\b14\b/);
    assert.match(h.blurb, /\b11\b/);
  });

  it("reports the last meeting with winner, score and month", () => {
    assert.ok(h.blurb.includes("Internazionale"), h.blurb);
    assert.match(h.blurb, /2-1/);
    assert.match(h.blurb, /February 2026/);
  });

  it("names the scorers to watch", () => {
    assert.ok(h.blurb.includes("Lautaro Martínez") && h.blurb.includes("Rafael Leão"), h.blurb);
  });

  it("keeps the rivalry note as written, not generated", () => {
    assert.equal(h.rivalry, "Derby della Madonnina");
    assert.match(h.rivalryNote, /1908/);
  });

  it("carries the facts list for the panel", () => {
    const labels = h.facts.map((f) => f.label);
    assert.deepEqual(labels, ["In the table", "Head-to-head", "Last meeting"].filter((l) => labels.includes(l)).concat(labels.includes("Leading scorers") ? ["Leading scorers"] : []));
    assert.ok(h.facts.some((f) => f.value === "2nd v 5th"));
  });
});

describe("derby write-ups handle thin data", () => {
  it("says so when the season has not started", () => {
    const h = hype({ homeRow: row(110, "Internazionale", 1, 0, 0), awayRow: row(103, "AC Milan", 2, 0, 0) });
    assert.match(h.blurb, /early|nothing in the standings|still taking shape|not mean much/i);
  });

  it("falls back to club names with no owners", () => {
    const h = hype({ homeOwner: null, awayOwner: null });
    assert.ok(h.blurb.includes("Internazionale") && h.blurb.includes("AC Milan"), h.blurb);
  });

  it("copes with one scorer, no head-to-head and no rivalry", () => {
    const h = hype({
      homeTeamId: 105, awayTeamId: 107, homeName: "Atalanta", awayName: "Bologna",
      headToHead: null, awayScorer: null,
      homeRow: row(105, "Atalanta", 7, 9), awayRow: row(107, "Bologna", 9, 8),
    });
    assert.equal(h.rivalry, null);
    assert.ok(h.blurb.includes("Lautaro Martínez"), h.blurb);
    assert.ok(!/undefined|null|NaN/.test(h.blurb), h.blurb);
  });

  it("survives a drawn last meeting", () => {
    const h = hype({
      headToHead: {
        summary: "even",
        meetings: [{ date: "2025-11-03T19:45Z", homeName: "AC Milan", awayName: "Internazionale", homeScore: 1, awayScore: 1 }],
      },
    });
    assert.match(h.blurb, /1-1/);
    assert.match(h.blurb, /November 2025/);
  });
});

describe("derby write-ups are generated, not canned", () => {
  it("reads the same for the same fixture", () => {
    assert.equal(hype().blurb, hype().blurb);
  });

  it("reads differently across fixtures", () => {
    const seen = new Set();
    for (let i = 0; i < 60; i++) seen.add(hype({ fixtureId: 9000 + i }).blurb);
    assert.ok(seen.size >= 25, `only ${seen.size} distinct write-ups`);
  });

  it("produces clean sentences whatever the inputs", () => {
    for (let i = 0; i < 200; i++) {
      for (const over of [
        {},
        { homeOwner: null, awayOwner: null },
        { headToHead: null },
        { homeScorer: null, awayScorer: null },
        { homeRow: row(110, "Internazionale", 1, 0, 0), awayRow: row(103, "AC Milan", 2, 0, 0) },
        { homeRow: null, awayRow: null, headToHead: null, awayScorer: null },
      ]) {
        const blurb = hype({ fixtureId: 20000 + i, ...over }).blurb;
        assert.doesNotMatch(blurb, /\s{2,}/, `double space: ${blurb}`);
        assert.doesNotMatch(blurb, /~a/, `unresolved article: ${blurb}`);
        assert.doesNotMatch(blurb, /[<>{}]/, `unexpanded symbol: ${blurb}`);
        assert.doesNotMatch(blurb, /undefined|NaN/, `bad value: ${blurb}`);
        assert.doesNotMatch(blurb, /\s[,.]/, `space before punctuation: ${blurb}`);
        assert.doesNotMatch(blurb, /\.\./, `doubled stop: ${blurb}`);
        assert.doesNotMatch(blurb, /\ba [aeiou]/i, `"a" before a vowel: ${blurb}`);
        if (blurb) assert.match(blurb, /[.!?]$/, `does not close with a stop: ${blurb}`);
      }
    }
  });
});
