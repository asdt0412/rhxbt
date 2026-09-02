import { isQuestion } from "./filter.js";
import type { Mention, ScoredMention } from "./types.js";

export function scoreMention(m: Mention): ScoredMention {
  const question = isQuestion(m.text);
  const score = Math.log10(m.authorFollowers + 1) * 2 + m.likes * 0.1 + (question ? 1 : 0);
  return { ...m, score, isQuestion: question };
}

export function rankMentions(mentions: Mention[]): ScoredMention[] {
  return mentions.map(scoreMention).sort((a, b) => b.score - a.score);
}
