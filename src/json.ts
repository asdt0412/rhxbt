export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence?.[1]?.trim() ?? trimmed;
  const start = raw.search(/[{[]/);
  if (start < 0) throw new Error("no json object in model output");
  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error("unbalanced json in model output");
  return JSON.parse(raw.slice(start, end + 1));
}

export function asPostResult(value: unknown): { post: string } | { post: null } {
  if (!value || typeof value !== "object") return { post: null };
  const post = (value as { post?: unknown }).post;
  if (typeof post === "string" && post.trim()) return { post: post.trim().slice(0, 280) };
  return { post: null };
}

export function asReplyResult(value: unknown): { reply: string } | { reply: null } {
  if (!value || typeof value !== "object") return { reply: null };
  const reply = (value as { reply?: unknown }).reply;
  if (typeof reply === "string" && reply.trim()) return { reply: reply.trim().slice(0, 280) };
  return { reply: null };
}
