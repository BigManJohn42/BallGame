export type Team = {
  id: number;
  name: string;
  logo: string;
  /** Final position in the Serie A table we drew from (1-7). */
  rank: number;
};

export type Player = {
  id: string;
  name: string;
  teamId: number;
  teamName: string;
  teamLogo: string;
  teamRank: number;
  joinedAt: number;
};

export type Outcome = "W" | "D" | "L";

export type PlayedMatch = {
  fixtureId: number;
  teamId: number;
  competitionId: number;
  competitionName: string;
  round: string;
  date: string;
  opponent: string;
  opponentLogo: string;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
  outcome: Outcome;
  viaPenalties: boolean;
  points: number;
};

export type UpcomingMatch = {
  fixtureId: number;
  teamId: number;
  competitionId: number;
  competitionName: string;
  round: string;
  date: string;
  opponent: string;
  opponentLogo: string;
  home: boolean;
};

export type Award = {
  key: string;
  label: string;
  detail: string;
  points: number;
  /** Still contestable — the season is not over, so this can be taken away. */
  provisional: boolean;
};

/** A match in progress right now. Scores nothing until it finishes. */
export type LiveMatch = {
  fixtureId: number;
  teamId: number;
  competitionId: number;
  competitionName: string;
  opponent: string;
  opponentLogo: string;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
  /** e.g. "52'" */
  clock: string;
  /** e.g. "Second Half", "Halftime" */
  phase: string;
};

/** How a player has moved since the last time any match was played. */
export type Movement = {
  /** Positive means climbed. Null for a player with no earlier standing. */
  rankChange: number | null;
  pointsGained: number;
};

export type TeamScore = {
  teamId: number;
  /** matchPoints + bonusPoints. */
  points: number;
  matchPoints: number;
  bonusPoints: number;
  awards: Award[];
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  byCompetition: Record<string, number>;
  form: Outcome[];
};

export type LeaderboardRow = {
  rank: number;
  player: Player;
  score: TeamScore;
  movement: Movement | null;
};

export type DataSource = "live" | "override" | "placeholder";

/** One row of the real Serie A table, independent of who is playing the game. */
export type LeagueRow = {
  rank: number;
  teamId: number;
  name: string;
  logo: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** e.g. "Champions League", "Relegation" — ESPN's qualification band. */
  zone: string | null;
  zoneColor: string | null;
};

export type SummaryStanding = {
  rank: number;
  name: string;
  team: string;
  points: number;
  rankChange: number | null;
  pointsGained: number;
};

/** What changed since the last gameweek. */
export type WeeklySummary = {
  since: number | null;
  matchesPlayed: number;
  standings: SummaryStanding[];
  topEarner: SummaryStanding | null;
  biggestClimb: SummaryStanding | null;
  bestResult: {
    player: string;
    opponent: string;
    home: boolean;
    goalsFor: number;
    goalsAgainst: number;
    competition: string;
    points: number;
  } | null;
  /** Plain text, ready to paste into a group chat. */
  text: string;
};

/** One player's tally in a statistical category, among the game's clubs. */
export type PlayerStat = {
  athleteId: string;
  name: string;
  teamId: number;
  teamName: string;
  teamLogo: string;
  value: number;
};

export type PlayerBoard = {
  key: string;
  label: string;
  unit: string;
  rows: PlayerStat[];
};

/** Hand-written club background. Not available from any free API. */
export type ClubProfile = {
  teamId: number;
  name: string;
  founded: number;
  stadium: string;
  nickname: string;
  /** Goes stale on its own; overridable with the MANAGERS env var. */
  manager: string;
  history: string;
  honours: string[];
  legends: string[];
};

/** A single club's whole season, for the per-player detail view. */
export type ClubSeason = {
  team: Team;
  owner: { id: string; name: string } | null;
  score: TeamScore;
  played: PlayedMatch[];
  upcoming: UpcomingMatch[];
  leaguePosition: number | null;
  leagueRow: LeagueRow | null;
  profile: ClubProfile | null;
  /** This club's best performers this season, from the live stat leaders. */
  topPlayers: { label: string; unit: string; rows: PlayerStat[] }[];
};

export type HeadToHeadMeeting = {
  date: string;
  homeTeamId: number;
  homeName: string;
  homeScore: number;
  awayTeamId: number;
  awayName: string;
  awayScore: number;
};

/** Previous meetings between two clubs, as ESPN reports them. */
export type HeadToHead = {
  /** Already worded by the provider, e.g. "COMO leads series 2-1-2". */
  summary: string;
  meetings: HeadToHeadMeeting[];
};

/** The write-up above a head-to-head countdown. */
export type DerbyHype = {
  rivalry: string | null;
  rivalryNote: string | null;
  blurb: string;
  facts: { label: string; value: string }[];
};

/**
 * A fixture between two clubs that are both in the game. Each one gets its own
 * countdown at the top of the page.
 */
export type Derby = {
  hype: DerbyHype | null;
  fixtureId: number;
  date: string;
  competitionId: number;
  competitionName: string;
  homeTeamId: number;
  homeName: string;
  homeLogo: string;
  homeOwner: string | null;
  awayTeamId: number;
  awayName: string;
  awayLogo: string;
  awayOwner: string | null;
};

/** A goal, as reported on the match summary. */
export type MatchEvent = {
  kind: string;
  ownGoal: boolean;
  penalty: boolean;
  minute: string;
  scorer: string;
  assist: string | null;
  teamId: number;
};

/** A short write-up of one finished match, kept for the season. */
export type MatchReport = {
  fixtureId: number;
  teamId: number;
  teamName: string;
  teamLogo: string;
  date: string;
  competitionId: number;
  competitionName: string;
  headline: string;
  outcome: Outcome;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  body: string;
  scorers: {
    name: string;
    minute: string;
    assist: string | null;
    penalty: boolean;
    ownGoal: boolean;
  }[];
  /** False when goal detail was not available, so the report is scoreline only. */
  detailed: boolean;
};

/** Recent output, as distinct from the season-long leaders. */
export type FormPlayer = {
  name: string;
  goals: number;
  assists: number;
  /** goals * 2 + assists, purely to order the list. */
  points: number;
};

export type ClubNews = {
  teamId: number;
  teamName: string;
  teamLogo: string;
  manager: string | null;
  managerSource: "override" | "wikidata" | "profile" | "unavailable";
  managerCheckedAt: number;
  reports: MatchReport[];
  form: FormPlayer[];
  /** Matches whose detail has not been fetched yet; they fill in over time. */
  pending: number;
};

export type ChatMessage = {
  id: string;
  /** Display name at the time of posting, so a later rename cannot rewrite history. */
  name: string;
  teamId: number | null;
  teamLogo: string | null;
  /** Posted from a browser holding that player's cookie, rather than just claiming the name. */
  verified: boolean;
  text: string;
  at: number;
};

export type GameState = {
  me: Player | null;
  teams: Team[];
  leaderboard: LeaderboardRow[];
  /** The real Serie A table, separate from the player standings. */
  table: LeagueRow[];
  /** Matches involving a tracked club that are being played right now. */
  live: LiveMatch[];
  /** What has changed since the last gameweek. */
  summary: WeeklySummary;
  /** Upcoming fixtures where both clubs are in the game. */
  derbies: Derby[];
  recent: PlayedMatch[];
  upcoming: UpcomingMatch[];
  meta: {
    drawSeason: string;
    trackSeason: string;
    teamsSource: DataSource;
    resultsSource: DataSource;
    storage: "redis" | "memory";
    lastUpdated: number;
    competitions: {
      id: number;
      key: string;
      name: string;
      short: string;
      win: number;
      draw: number;
      accent: string;
    }[];
    bonuses: { goal: number; cleanSheet: number };
    awardCatalogue: {
      stat: { label: string; points: number }[];
      rounds: { label: string; points: number }[];
      finish: { label: string; points: number }[];
    };
    notices: string[];
  };
};
