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

/**
 * A fixture between two clubs that are both in the game. The countdown at the
 * top of the page points at the next one.
 */
export type Derby = {
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
