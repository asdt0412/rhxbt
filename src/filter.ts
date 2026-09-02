import { config } from "./config.js";
import { ON_TOPIC_TICKERS, ON_TOPIC_WORDS, QUESTION_HINTS } from "./constants.js";
import type { Mention } from "./types.js";

const WORD_RE = /[a-z0-9$]+/g;

export function isQuestion(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes("?")) return true;
  return QUESTION_HINTS.some((w) => new RegExp(`(?:^|[^a-z])${w}(?:[^a-z]|$)`, "i").test(lower));
}

export function isOnTopic(text: string): boolean {
  const lower = text.toLowerCase();
  const tokens = new Set(lower.match(WORD_RE) ?? []);
  for (const t of ON_TOPIC_TICKERS) {
    if (tokens.has(t) || tokens.has(`$${t}`)) return true;
  }
  for (const w of ON_TOPIC_WORDS) {
    if (tokens.has(w)) return true;
  }
  return false;
}

/**
 * Pure code. Cost = 0. Runs BEFORE any LLM or X write.
 * Keep only if ALL conditions hold.
 */
export function keepMention(m: Mention, ownId: string): boolean {
  if (!m.tweetId || !m.authorId) return false;
  if (m.authorId === ownId) return false;
  if (m.authorFollowers < config.minFollowers) return false;
  if (m.threadDepth > 3) return false;
  if (!isQuestion(m.text)) return false;
  if (!isOnTopic(m.text)) return false;
  return true;
}

export function filterMentions(mentions: Mention[], ownId: string): Mention[] {
  return mentions.filter((m) => keepMention(m, ownId));
}
