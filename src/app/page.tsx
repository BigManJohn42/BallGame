import Game from "./components/Game";
import { getGameState } from "@/lib/game";
import { currentPlayer } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function Home() {
  const me = await currentPlayer();
  const state = await getGameState(me);
  return <Game initial={state} />;
}
