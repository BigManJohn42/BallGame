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
};

export type DataSource = "live" | "override" | "placeholder";

export type GameState = {
  me: Player | null;
  teams: Team[];
  leaderboard: LeaderboardRow[];
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
