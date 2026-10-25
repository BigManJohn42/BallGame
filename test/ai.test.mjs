import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isGrounded } from "../src/lib/ai.ts";
import { reportFacts } from "../src/lib/prompts.ts";

const FACTS = [
  "Club: Internazionale",
  "Opponent: Bologna",
  "Venue: Internazionale were away",
  "Competition: Serie A",
  "Result: Internazionale 3-3 Bologna — a draw for Internazionale",
  "Internazionale goals: Federico Dimarco 22'; Pio Esposito 64'; Andy Diouf 86'",
  "Bologna goals: Federico Bernardeschi 25'; Tommaso Pobega 42'; own goal by Piotr Zielinski 48'",
  "Points earned: 4",
].join("\n");

describe("the grounding check", () => {
  it("accepts a report built only from the facts", () => {
    assert.ok(
      isGrounded(
        "Internazionale shared six goals away at Bologna. Federico Dimarco opened the scoring before Federico Bernardeschi and Tommaso Pobega replied, and Piotr Zielinski turned one into his own net. Pio Esposito and Andy Diouf finished the scoring, and it was worth 4 points.",
        FACTS,
      ),
    );
  });

  it("rejects a venue nobody mentioned", () => {
    // The real thing Haiku did: correct stadium, never supplied.
    assert.ok(
      !isGrounded(
        "Internazionale and Bologna shared six goals at the Stadio Dall'Ara. It was worth 4 points.",
        FACTS,
      ),
    );
  });

  it("rejects an invented scorer", () => {
    assert.ok(
      !isGrounded("Lautaro Martinez struck late to rescue a point. Worth 4 points.", FACTS),
    );
  });

  it("rejects an invented manager", () => {
    assert.ok(
      !isGrounded("Cristian Chivu will have been satisfied with a point. Worth 4 points.", FACTS),
    );
  });

  it("allows football vocabulary and sentence-opening capitals", () => {
    assert.ok(
      isGrounded(
        "Honours even in Serie A. Three goals apiece, one of them an own goal. Worth 4 points.",
        FACTS,
      ),
    );
  });

  it("allows competitions named in the facts", () => {
    const cup = FACTS.replace("Serie A", "Coppa Italia");
    assert.ok(isGrounded("A draw in the Coppa Italia. Worth 4 points.", cup));
  });

  it("is not fooled by a name appearing only in the output", () => {
    assert.ok(!isGrounded("Nicolo Barella was everywhere. Worth 4 points.", FACTS));
  });
});

describe("the facts handed to the model", () => {
  const match = (over = {}) => ({
    fixtureId: 1, teamId: 110, competitionId: 1, competitionName: "Serie A", round: "",
    date: "2026-05-01T18:00Z", opponent: "Bologna", opponentLogo: "", home: false,
    goalsFor: 2, goalsAgainst: 2, outcome: "D", viaPenalties: false, points: 3, ...over,
  });
  const ev = (teamId, scorer, minute, o = {}) => ({
    kind: o.ownGoal ? "Own Goal" : "Goal", ownGoal: !!o.ownGoal, penalty: !!o.penalty,
    minute, scorer, assist: o.assist ?? null, teamId,
  });

  it("states which side was at home", () => {
    const away = reportFacts({ match: match(), teamName: "Inter", events: [] });
    assert.match(away, /Inter were away/);
    const home = reportFacts({ match: match({ home: true }), teamName: "Inter", events: [] });
    assert.match(home, /Inter were at home/);
  });

  it("flags goals with no recorded scorer rather than leaving a gap", () => {
    const facts = reportFacts({
      match: match(),
      teamName: "Inter",
      events: [ev(110, "Thuram", "23'"), ev(110, "Bisseck", "61'"), ev(107, "Simeone", "70'")],
    });
    assert.match(facts, /IMPORTANT: 1 of Bologna's goals have no recorded scorer/);
    assert.match(facts, /do not guess/i);
  });

  it("says plainly when a side did not score", () => {
    const facts = reportFacts({
      match: match({ goalsFor: 0, goalsAgainst: 1, outcome: "L", points: 0 }),
      teamName: "Inter",
      events: [ev(107, "Orsolini", "78'")],
    });
    assert.match(facts, /Inter did not score/);
  });

  it("marks an own goal as one", () => {
    const facts = reportFacts({
      match: match(),
      teamName: "Inter",
      events: [ev(110, "Zielinski", "48'", { ownGoal: true })],
    });
    assert.match(facts, /own goal by Zielinski/);
  });

  it("carries the shootout and the points", () => {
    const facts = reportFacts({
      match: match({ viaPenalties: true, outcome: "L", points: 1 }),
      teamName: "Inter",
      events: [],
    });
    assert.match(facts, /penalty shootout, which Inter lost/);
    assert.match(facts, /Points earned: 1/);
  });
});
