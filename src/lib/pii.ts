export interface PiiMatch {
  id: string;
  type: string;
  value: string;
  masked: string;
  page: number;
  /** Index in full document text (for ordering) */
  index: number;
}

export interface RedactionResult {
  text: string;
  redactions: { type: string; count: number }[];
  matches: PiiMatch[];
}

export const PII_PATTERNS = [
  { name: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  {
    name: "phone",
    regex: /(?:\+\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3}[-.\s]?\d{3}[-.\s]?\d{3,4}\b/g,
  },
  { name: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: "iban", regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b/gi },
  { name: "credit_card", regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g },
] as const;

export const PII_TYPE_LABELS: Record<string, string> = {
  email: "Email address",
  phone: "Phone number",
  ssn: "Social security number",
  iban: "IBAN",
  credit_card: "Credit card number",
};

let matchCounter = 0;

export function createPiiMatchId(): string {
  return `pii_${++matchCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

export function maskPiiValue(value: string, type: string): string {
  if (type === "email") {
    const [user, domain] = value.split("@");
    if (!domain) return "***";
    const shown = user.length <= 2 ? "*" : user[0] + "***";
    return `${shown}@${domain}`;
  }
  if (type === "credit_card") {
    const digits = value.replace(/\D/g, "");
    return `**** **** **** ${digits.slice(-4)}`;
  }
  if (value.length <= 4) return "****";
  return value.slice(0, 2) + "***" + value.slice(-2);
}

export function findPiiMatches(text: string, page = 0): PiiMatch[] {
  const matches: PiiMatch[] = [];
  const seen = new Set<string>();

  for (const pattern of PII_PATTERNS) {
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const value = m[0];
      const key = `${page}:${pattern.name}:${value}:${m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({
        id: createPiiMatchId(),
        type: pattern.name,
        value,
        masked: maskPiiValue(value, pattern.name),
        page,
        index: m.index,
      });
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

export function detectAndRedactPii(text: string, selectedValues?: Set<string>): RedactionResult {
  const allMatches = findPiiMatches(text);
  const toRedact =
    selectedValues === undefined
      ? allMatches
      : allMatches.filter((m) => selectedValues.has(m.value));

  let result = text;
  const counts = new Map<string, number>();

  // Replace longest values first to avoid partial overlaps
  const sorted = [...toRedact].sort((a, b) => b.value.length - a.value.length);
  for (const match of sorted) {
    const placeholder = `[REDACTED_${match.type.toUpperCase()}]`;
    if (result.includes(match.value)) {
      result = result.split(match.value).join(placeholder);
      counts.set(match.type, (counts.get(match.type) ?? 0) + 1);
    }
  }

  const redactions = [...counts.entries()].map(([type, count]) => ({ type, count }));

  return { text: result, redactions, matches: allMatches };
}

export function redactTextWithMatches(text: string, matches: PiiMatch[]): string {
  const values = new Set(matches.map((m) => m.value));
  return detectAndRedactPii(text, values).text;
}
