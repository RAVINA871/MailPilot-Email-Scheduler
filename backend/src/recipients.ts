const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
export interface ParseResult { valid: string[]; invalid: { row: number; value: string; reason: string }[] }
export function parseRecipients(text: string): ParseResult {
  const seen = new Set<string>(); const valid: string[] = []; const invalid: ParseResult["invalid"] = [];
  text.replace(/^\uFEFF/, "").split(/\r?\n/).forEach((line, i) => {
    for (const raw of line.split(/[,;\t]/)) {
      const v = raw.trim().replace(/^["']|["']$/g, "");
      if (!v || (i === 0 && /^e-?mails?$/i.test(v))) continue;
      if (!EMAIL.test(v)) { invalid.push({ row: i + 1, value: v.slice(0, 100), reason: "Malformed email address" }); continue; }
      const k = v.toLowerCase();
      if (seen.has(k)) { invalid.push({ row: i + 1, value: v, reason: "Duplicate" }); continue; }
      seen.add(k); valid.push(k);
    }
  });
  return { valid, invalid };
}
