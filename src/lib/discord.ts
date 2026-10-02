/**
 * Discord invite, if one is configured.
 *
 * The server itself has to be created by a person — it needs a logged-in
 * account, and whoever makes it becomes the owner. All this does is carry the
 * invite link the owner pastes in.
 */

const INVITE_PATTERN = /^https:\/\/(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[A-Za-z0-9-]+$/;

export type DiscordConfig = {
  invite: string | null;
  label: string;
  /** Set but not a recognisable invite URL, so the owner can spot the typo. */
  malformed: boolean;
};

export function discordConfig(): DiscordConfig {
  const raw = process.env.DISCORD_INVITE?.trim();
  const label = process.env.DISCORD_LABEL?.trim() || "Join the Discord";

  if (!raw) return { invite: null, label, malformed: false };
  if (!INVITE_PATTERN.test(raw)) return { invite: null, label, malformed: true };
  return { invite: raw, label, malformed: false };
}
