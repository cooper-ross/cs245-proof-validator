const BRACKET_CHARS = /[⎡⎢⎣]/g;
const BRACKET_PREFIX_RE = /^(?:[⎡⎢⎣]\s*)+/;

const LATEX_OPS = [
  ["\\leftrightarrow", "↔"],
  ["\\iff", "↔"],
  ["\\rightarrow", "→"],
  ["\\implies", "→"],
  ["\\to", "→"],
  ["\\land", "∧"],
  ["\\wedge", "∧"],
  ["\\lor", "∨"],
  ["\\vee", "∨"],
  ["\\lnot", "¬"],
  ["\\neg", "¬"],
  ["\\bot", "⊥"],
];

const pasteEmptyRow = () => ({ formula: "", rule: "", depth: 0, startsBox: false });

const formatRule = (rule, refs) => {
  if (!refs || !refs.length) return rule;
  const parts = refs.map((r) =>
    r.kind === "range" ? `${r.start}-${r.end}` : String(r.n)
  );
  return `${rule} ${parts.join(", ")}`;
};

const scopeDepth = (scope) => {
  let d = 0;
  for (let s = scope; s && !s.isRoot; s = s.parent) d++;
  return d;
};

const linesToRows = (lines) => {
  if (!lines.length) return [pasteEmptyRow()];
  const scoped = Proof.buildScopes(lines);
  if (scoped.error) return { error: scoped.error.msg };
  const { lineScope } = scoped;
  return lines.map((l) => {
    const isAs = l.rule === "AS";
    return {
      formula: l.formulaStr,
      rule: isAs ? "" : formatRule(l.rule, l.refs),
      depth: scopeDepth(lineScope[l.num]),
      startsBox: isAs,
    };
  });
};

const latexToFormula = (s) => {
  let t = (s || "").trim();
  if (!t) return "";
  t = t.replace(/\\text\{([^}]*)\}/g, "$1");
  t = t.replace(/\\left\s*\(/g, "(").replace(/\\right\s*\)/g, ")");
  t = t.replace(/\\(?:,|;|!|:)\s*/g, " ");
  t = t.replace(/\\(?:quad|qquad)\b\s*/g, " ");
  t = t.replace(/\\phantom\{[^}]*\}/g, "");
  t = t.replace(/\\\s+/g, " ");
  for (const [from, to] of LATEX_OPS) t = t.split(from).join(to);
  t = t.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, "$1");
  t = t.replace(/\\[a-zA-Z]+\s*/g, "");
  t = t.replace(/\\/g, "");
  t = t.replace(/[{}]/g, "");
  t = t.replace(/\s+/g, " ").trim();
  return Formula.normalizeOps(t);
};

const latexToRule = (s) => {
  let t = (s || "").trim();
  if (!t) return "";
  t = t.replace(/\\text\{([^}]*)\}/g, "$1");
  t = t.replace(/\\[a-zA-Z]+\s*/g, "");
  return Formula.normalizeOps(t).trim();
};

const parseLatexProof = (text) => {
  let body = text.replace(/^%.*$/gm, "");
  const env = /\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/.exec(body);
  if (env) body = env[1];
  else if (!/\\text\{\s*\d+\.\s*\}/.test(body)) return null;

  const chunks = body
    .split(/\\\\/)
    .map((l) => l.trim())
    .filter((l) => l && !/^%/.test(l));

  if (!chunks.length) return null;

  const proofLines = [];
  for (const chunk of chunks) {
    const parts = chunk.split(/&&/);
    const left = (parts[0] || "").trim();
    const right = (parts[1] || "").trim();

    const numM = /\\text\{\s*(\d+)\.\s*\}/.exec(left);
    const num = numM ? +numM[1] : proofLines.length + 1;

    let afterNum = left;
    if (numM) afterNum = left.slice(numM.index + numM[0].length).trim();

    const quads = (afterNum.match(/\\quad\b/g) || []).length;
    afterNum = afterNum.replace(/(\\quad\s*)+/g, "").replace(/^\\\s+/, "").trim();

    const formula = latexToFormula(afterNum);
    const rule = latexToRule(right);
    const indent = "  ".repeat(quads);
    proofLines.push(`${indent}${num}. ${formula}    ${rule}`);
  }

  const parsed = Proof.parseProofText(proofLines.join("\n"));
  if (parsed.error) return null;
  const rows = linesToRows(parsed.lines);
  if (rows.error) return null;
  return { rows };
};

const stripBracketPrefix = (body) => {
  const m = BRACKET_PREFIX_RE.exec(body);
  if (!m) return { depth: 0, body };
  const depth = (m[0].match(BRACKET_CHARS) || []).length;
  return { depth, body: body.slice(m[0].length) };
};

const leadingIndent = (raw) =>
  /^[ \t]*/.exec(raw)[0].replace(/\t/g, "  ").length;

const preprocessInlineIndent = (text) => {
  const parsed = [];
  let minGap = Infinity;

  for (const raw of text.split(/\r?\n/)) {
    if (!/\S/.test(raw)) continue;
    const m = /^([ \t]*)(\d+)\.([ \t]*)(\S.*)$/.exec(raw);
    if (!m) return text;
    const gap = m[3].replace(/\t/g, "  ").length;
    minGap = Math.min(minGap, gap);
    parsed.push({ lead: m[1], num: m[2], gap, body: m[4] });
  }

  if (parsed.length < 2 || minGap === Infinity) return text;

  const gaps = new Set(parsed.map((l) => l.gap));
  if (gaps.size <= 1) return text;

  const step =
    [...gaps]
      .map((g) => g - minGap)
      .filter((d) => d > 0)
      .sort((a, b) => a - b)[0] || 2;

  return parsed
    .map((l) => {
      const depth = Math.round((l.gap - minGap) / step);
      const lead = l.lead.replace(/\t/g, "  ") + "  ".repeat(depth);
      return `${lead}${l.num}. ${l.body}`;
    })
    .join("\n");
};

const preprocessFitchBrackets = (text) => {
  let rootPrefix = Infinity;
  const nonempty = text.split(/\r?\n/).filter((l) => /\S/.test(l));
  for (const raw of nonempty) {
    rootPrefix = Math.min(rootPrefix, leadingIndent(raw));
  }
  if (rootPrefix === Infinity) rootPrefix = 0;

  const out = [];

  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*$/.test(raw)) continue;

    const baseIndent = leadingIndent(raw);
    let rest = raw.slice(/^[ \t]*/.exec(raw)[0].length);

    const lm = /^(\d+)\.\s*(.*)$/.exec(rest);
    if (!lm) {
      out.push(raw);
      continue;
    }

    const num = lm[1];
    const { depth, body } = stripBracketPrefix(lm[2]);
    const lineIndent =
      depth > 0 ? rootPrefix + depth * 2 : baseIndent;
    out.push(`${" ".repeat(lineIndent)}${num}. ${body}`);
  }

  return out.join("\n");
};

const parsePlainProof = (text) => {
  let prepped = text;
  if (/[⎡⎢⎣]/.test(text)) prepped = preprocessFitchBrackets(text);
  else prepped = preprocessInlineIndent(text);
  const parsed = Proof.parseProofText(prepped);
  if (parsed.error) return { error: parsed.error.msg };
  const rows = linesToRows(parsed.lines);
  if (rows.error) return { error: rows.error };
  return { rows };
};

const looksLikeProof = (text) => {
  if (!text || !/\S/.test(text)) return false;
  const t = text.trim();

  if (/\\begin\{align\*?\}/.test(t)) return true;
  if (/\\text\{\s*\d+\.\s*\}/.test(t)) return true;
  if (/[⎡⎢⎣]/.test(t)) return true;

  const lines = t.split(/\r?\n/).filter((l) => /\S/.test(l));
  if (!lines.length) return false;

  const numbered = lines.filter((l) => /^\s*\d+\.\s+\S/.test(l));
  if (numbered.length >= 2) return true;
  if (numbered.length === 1 && lines.length === 1) return true;

  return false;
};

const normalizePasteText = (text) =>
  (text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\n+$/, "");

const parseToRows = (text) => {
  const normalized = normalizePasteText(text);
  if (!normalized || !/\S/.test(normalized)) return { error: "Nothing to paste." };

  const latex = parseLatexProof(normalized);
  if (latex && !latex.error) return latex;

  const plain = parsePlainProof(normalized);
  if (plain.rows) return plain;

  return { error: plain.error || "Could not parse pasted proof." };
};

const applySingleLine = (text, row) => {
  const one = text.trim();
  if (!one || /\n/.test(one)) return false;

  let line = one.replace(BRACKET_PREFIX_RE, "");

  const parsed = Proof.parseProofText(line + "\n");
  if (parsed.error || !parsed.lines.length) return false;

  const L = parsed.lines[0];
  const isAs = L.rule === "AS";
  row.formula = L.formulaStr;
  row.rule = isAs ? "" : formatRule(L.rule, L.refs);
  row.startsBox = isAs;
  if (isAs) row.depth = Math.max(row.depth, 1);
  return true;
};

window.Paste = {
  looksLikeProof,
  parseToRows,
  applySingleLine,
};