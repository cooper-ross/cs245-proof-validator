const RULE_RE = new RegExp(
  "\\s+(PR|AS|RAA|R|∧I|∧E|∨I|∨E|⊥E|¬E|¬I|→E|→I|↔I|↔E)(\\s+[\\d,\\s\\-–]+)?\\s*$"
);

const parseRefs = (refsStr) => {
  if (!refsStr) return [];
  const refs = [];
  const parts = refsStr
    .replace(/–/g, "-")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    let m;
    if ((m = /^(\d+)\s*-\s*(\d+)$/.exec(p))) {
      refs.push({ kind: "range", start: +m[1], end: +m[2] });
    } else if ((m = /^(\d+)$/.exec(p))) {
      refs.push({ kind: "line", n: +m[1] });
    } else {
      return { error: `Invalid reference "${p}"` };
    }
  }
  return refs;
};

const parseProofText = (text) => {
  const lines = [];
  const rawLines = text.split(/\r?\n/);

  for (const raw of rawLines) {
    if (/^\s*$/.test(raw)) continue;
    if (/^\s*(\/\/|#)/.test(raw)) continue;

    const lead = /^[ \t]*/.exec(raw)[0];
    const indent = lead.replace(/\t/g, "    ").length;
    const norm = Formula.normalizeOps(raw.slice(lead.length));

    const lm = /^(\d+)\.\s*(.*)$/.exec(norm);
    if (!lm) {
      return {
        error: { msg: `Expected "<number>. <formula> <RULE>", got: ${raw.trim()}` },
      };
    }
    const num = parseInt(lm[1], 10);
    const body = lm[2];

    const rm = RULE_RE.exec(body);
    if (!rm) {
      return {
        error: {
          num,
          msg: "Couldn't find a rule at the end of the line.",
        },
      };
    }
    const rule = rm[1];
    const refs = parseRefs((rm[2] || "").trim());
    if (refs && refs.error) return { error: { num, msg: refs.error } };

    const formulaStr = body.slice(0, rm.index).trim();
    if (!formulaStr) return { error: { num, msg: "Line has no formula." } };

    const parsed = Formula.tryParse(formulaStr);
    if (parsed.error) {
      return {
        error: { num, msg: `Malformed formula (${formulaStr}): ${parsed.error}` },
      };
    }

    lines.push({
      num,
      indent,
      formulaStr,
      formula: parsed.ast,
      rule,
      refs,
      index: lines.length,
    });
  }
  return { lines };
};

const buildScopes = (lines) => {
  if (lines.length === 0) return { error: { msg: "The proof is empty." } };

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].num !== i + 1) {
      return {
        error: {
          num: lines[i].num,
          msg: `Line numbers must be consecutive from 1. Expected ${i + 1} but found "${lines[i].num}".`,
        },
      };
    }
  }

  const rootIndent = Math.min.apply(null, lines.map((l) => l.indent));
  const root = { id: 0, indent: rootIndent, parent: null, isRoot: true, startNum: null };
  const stack = [root];
  const completed = [];
  const lineScope = {};
  let nextId = 1;

  const close = (endNum) => {
    const s = stack.pop();
    s.endNum = endNum;
    completed.push({
      start: s.startNum,
      end: endNum,
      scope: s,
      parentScope: stack[stack.length - 1],
    });
  };

  for (const L of lines) {
    const w = L.indent;

    while (stack.length > 1) {
      const top = stack[stack.length - 1];
      if (w < top.indent) {
        close(L.num - 1);
        continue;
      }
      if (w === top.indent && L.rule === "AS") {
        close(L.num - 1);
        break;
      }
      break;
    }

    const parent = stack[stack.length - 1];

    if (L.rule === "AS") {
      const s = { id: nextId++, indent: w, parent, isRoot: false, startNum: L.num };
      stack.push(s);
      lineScope[L.num] = s;
    } else if (w > parent.indent) {
      return {
        error: {
          num: L.num,
          msg: "This line is indented past its scope but isn't an assumption (AS).",
        },
      };
    } else if (w < parent.indent) {
      return { error: { num: L.num, msg: "Inconsistent indentation." } };
    } else {
      lineScope[L.num] = parent;
    }
  }

  return { root, completed, lineScope };
};

const ancestorChain = (scope) => {
  const chain = [];
  for (let s = scope; s; s = s.parent) chain.push(s);
  return chain;
};

window.Proof = { parseProofText, buildScopes, ancestorChain };