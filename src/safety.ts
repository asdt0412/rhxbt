const BANNED = [
  /100x/,
  /to the moon/,
  /🚀/,
  /\bact as\b/,
  /\bignore (?:your|all) rules\b/,
  /\bfinancial advice\b/,
];

const ADVICE = /\b(?:buy|sell|shill)\b/;

export function isSafeOutput(text: string): boolean {
  const t = text.toLowerCase();
  if (BANNED.some((re) => re.test(t))) return false;
  if (ADVICE.test(t)) return false;
  return t.length > 0 && t.length <= 280;
}
