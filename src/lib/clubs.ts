import type { ClubProfile } from "./types";

/**
 * Editorial club profiles.
 *
 * None of this comes from the API — ESPN serves results and tables, not club
 * histories, honours or managers — so it is written by hand and keyed on ESPN
 * team ids.
 *
 * `manager` is the one field here that goes out of date: coaches get sacked
 * mid-season and nothing will correct this automatically. Override without
 * editing code by setting MANAGERS="110:Name,114:Other Name" in the
 * environment. Everything else is settled history and only needs touching when
 * a club actually wins something.
 */

const PROFILES: Record<number, ClubProfile> = {
  110: {
    teamId: 110,
    name: "Internazionale",
    founded: 1908,
    stadium: "San Siro",
    nickname: "I Nerazzurri",
    manager: "Cristian Chivu",
    history:
      "Born in 1908 out of a split at AC Milan, by a faction that wanted to field foreign players — hence Internazionale. That openness is still the identity. The peak came in 2010 under José Mourinho, when Inter won the treble, still the only Italian side ever to do it. The 2023/24 title brought a second star to the shirt for a twentieth Scudetto.",
    honours: [
      "21 Serie A titles, most recently 2025/26",
      "3 European Cups / Champions Leagues (1964, 1965, 2010)",
      "Coppa Italia winners in 2025/26",
      "Treble winners in 2010, the only Italian club to manage it",
    ],
    legends: ["Giuseppe Meazza", "Giacinto Facchetti", "Javier Zanetti", "Ronaldo"],
  },
  114: {
    teamId: 114,
    name: "Napoli",
    founded: 1926,
    stadium: "Stadio Diego Armando Maradona",
    nickname: "Gli Azzurri",
    manager: "Antonio Conte",
    history:
      "For most of its life Napoli was a club of enormous passion and few trophies. Then Diego Maradona arrived in 1984 and dragged a southern side to two titles in the teeth of the industrial north. After his departure came bankruptcy and a restart in the third tier in 2004. The 2022/23 Scudetto ended a 33-year wait; another followed in 2024/25.",
    honours: [
      "4 Serie A titles (1987, 1990, 2023, 2025)",
      "UEFA Cup winners in 1989",
      "6 Coppa Italia",
      "Rebuilt from the third tier after bankruptcy in 2004",
    ],
    legends: ["Diego Maradona", "Marek Hamšík", "Edinson Cavani", "Careca"],
  },
  104: {
    teamId: 104,
    name: "AS Roma",
    founded: 1927,
    stadium: "Stadio Olimpico",
    nickname: "I Giallorossi",
    manager: "Gian Piero Gasperini",
    history:
      "Formed by merging three Roman clubs in 1927 to give the capital a side capable of challenging the north. Titles have been rare and treasured — three in a century — but the connection between club and city is close to total. Francesco Totti spent his entire 25-year career here and never seriously considered leaving. In 2022 José Mourinho delivered the inaugural Conference League, Roma's first European trophy.",
    honours: [
      "3 Serie A titles (1942, 1983, 2001)",
      "UEFA Conference League winners in 2022",
      "9 Coppa Italia",
      "Inter-Cities Fairs Cup winners in 1961",
    ],
    legends: ["Francesco Totti", "Daniele De Rossi", "Paulo Roberto Falcão", "Gabriel Batistuta"],
  },
  2572: {
    teamId: 2572,
    name: "Como",
    founded: 1907,
    stadium: "Stadio Giuseppe Sinigaglia",
    nickname: "I Lariani",
    manager: "Cesc Fàbregas",
    history:
      "The newest story in this group and the strangest. Como were bankrupt and in the fourth tier in 2017. The Hartono brothers, among the wealthiest owners in football, bought the club and rebuilt it, with Cesc Fàbregas moving from midfielder to part-owner to head coach. Promotion to Serie A came in 2024, and by 2025/26 a club with no top-flight pedigree was finishing in the European places on the shore of Lake Como.",
    honours: [
      "No major honours — the appeal is the climb, not the cabinet",
      "Promoted to Serie A in 2024 after a rebuild from the fourth tier",
      "Highest league finish in the club's modern history in 2025/26",
    ],
    legends: ["Gianfranco Zigoni", "Stefano Borgonovo", "Cesc Fàbregas"],
  },
  103: {
    teamId: 103,
    name: "AC Milan",
    founded: 1899,
    stadium: "San Siro",
    nickname: "I Rossoneri",
    manager: "Massimiliano Allegri",
    history:
      "Founded by Englishmen in 1899, which is why it is Milan and not Milano. The Sacchi and Capello sides of the late eighties and nineties are among the finest club teams ever assembled — Gullit, Van Basten and Rijkaard in front of a back four organised by Baresi and Maldini. Seven European Cups is a total only Real Madrid has beaten.",
    honours: [
      "19 Serie A titles, most recently 2021/22",
      "7 European Cups / Champions Leagues",
      "5 Coppa Italia",
      "Unbeaten across the 1991/92 league season",
    ],
    legends: ["Paolo Maldini", "Franco Baresi", "Marco van Basten", "Kaká"],
  },
  111: {
    teamId: 111,
    name: "Juventus",
    founded: 1897,
    stadium: "Allianz Stadium",
    nickname: "La Vecchia Signora",
    manager: "Igor Tudor",
    history:
      "The most successful club in Italy and the most divisive. Run by the Agnelli family alongside Fiat for generations, Juventus turned consistency into a habit — including nine consecutive titles from 2012. The 2006 Calciopoli scandal brought relegation to Serie B and the loss of two titles; the club came straight back up and resumed winning. Two European Cups sit alongside a famous number of losing finals.",
    honours: [
      "36 league titles claimed by the club; 34 recognised by the federation after 2006",
      "2 European Cups (1985, 1996)",
      "15 Coppa Italia, a record",
      "Nine consecutive Serie A titles, 2012–2020",
    ],
    legends: ["Alessandro Del Piero", "Gianluigi Buffon", "Michel Platini", "Pavel Nedvěd"],
  },
  105: {
    teamId: 105,
    name: "Atalanta",
    founded: 1907,
    stadium: "Gewiss Stadium",
    nickname: "La Dea",
    manager: "Ivan Jurić",
    history:
      "A provincial club from Bergamo that spent a century as nobody's idea of a threat, and then became one of the most admired sides in Europe. Gian Piero Gasperini arrived in 2016 and installed relentless man-to-man pressing and a youth pipeline that sells at a profit every summer without the team getting worse. In 2024 Atalanta beat an unbeaten Bayer Leverkusen 3-0 to win the Europa League — the club's first European trophy.",
    honours: [
      "UEFA Europa League winners in 2024",
      "Coppa Italia winners in 1963",
      "Regular Champions League participants since 2019",
      "Reached the Champions League quarter-finals in 2020",
    ],
    legends: ["Gian Piero Gasperini", "Papu Gómez", "Josip Iličić", "Duván Zapata"],
  },
};

/** MANAGERS="110:Name,114:Name" replaces the hand-written ones above. */
function managerOverrides(): Map<number, string> {
  const raw = process.env.MANAGERS;
  const out = new Map<number, string>();
  if (!raw) return out;
  for (const part of raw.split(",")) {
    const [id, ...name] = part.split(":");
    const teamId = Number.parseInt(id.trim(), 10);
    const manager = name.join(":").trim();
    if (Number.isFinite(teamId) && manager) out.set(teamId, manager);
  }
  return out;
}

export function clubProfile(teamId: number): ClubProfile | null {
  const profile = PROFILES[teamId];
  if (!profile) return null;
  const override = managerOverrides().get(teamId);
  return override ? { ...profile, manager: override } : profile;
}
