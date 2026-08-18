const SUB_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

const GREEK_NORMALIZE = {
  "𝜑": "φ", "𝜙": "φ", "ϕ": "φ", "ϕ": "φ",
  "𝜓": "ψ", "𝜓": "ψ",
  "𝜒": "χ", "𝜃": "θ", "ϑ": "θ",
  "𝛼": "α", "𝛽": "β", "𝛾": "γ", "𝛿": "δ",
  "𝜀": "ε", "𝜖": "ε", "𝜁": "ζ", "𝜂": "η",
  "𝜄": "ι", "𝜅": "κ", "𝜆": "λ", "𝜇": "μ",
  "𝜈": "ν", "𝜉": "ξ", "𝜋": "π", "𝜌": "ρ",
  "𝜎": "σ", "𝜏": "τ", "𝜐": "υ", "𝜔": "ω",
};

const SCHEMA_RE = /^[α-ωΑ-Ωφϕϑ]/u;

const normalizeOps = (s) => {
  let out = "";
  for (const ch of s) out += GREEK_NORMALIZE[ch] || ch;
  return out
    .replace(/<->/g, "↔")
    .replace(/<=>/g, "↔")
    .replace(/!=/g, "≠")
    .replace(/<=/g, "≤")
    .replace(/>=/g, "≥")
    // Lecture notation φ[x:=t] is the same substitution as the notes' φ[x/t].
    .replace(/:=/g, "/")
    .replace(/->/g, "→")
    .replace(/=>/g, "→")
    .replace(/≈/g, "=")
    .replace(/·/g, "×")
    // Keep "/*" intact for partial substitution φ[t/*x]; lone * is ×.
    .replace(/\*/g, (ch, offset, str) => (offset > 0 && str[offset - 1] === "/" ? "*" : "×"))
    .replace(/_\|_/g, "⊥")
    .replace(/⋁/g, "∨")
    .replace(/⋀/g, "∧")
    .replace(/&/g, "∧")
    .replace(/\^/g, "∧")
    .replace(/\|/g, "∨")
    .replace(/~/g, "¬")
    .replace(/!/g, "¬");
};

const SYMBOLS = "¬∧∨→↔⊥()∀∃,=≤<≥>≠+×[]/*";

// Binary function symbols written infix inside terms: x+0, x×y.
const TERM_INFIX = ["+", "×"];

// Identifiers: a capitalized word (Least, P) or a lowercase run (x, p, ab),
// optionally subscripted. The case split lets ∀xP(x) tokenize as ∀, x, P, (x).
const IDENT_RE = /^(?:[A-Z][A-Za-z0-9]*|[a-z][a-z0-9]*)(?:_\d+|[₀-₉]+)?/;

// w₂, w_2, and w2 all normalize to the same internal name "w_2".
const canonName = (raw) => {
  const flat = raw.replace(/[₀-₉]/g, (ch) => String(SUB_DIGITS.indexOf(ch)));
  const m = /^([A-Za-z]+?)_?(\d+)$/.exec(flat);
  return m ? `${m[1]}_${m[2]}` : flat;
};

const prettyName = (name) =>
  name.replace(/_(\d+)$/, (m, d) =>
    d.split("").map((c) => SUB_DIGITS[+c]).join("")
  );

const tokenize = (s) => {
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
    } else if (SYMBOLS.indexOf(c) !== -1) {
      toks.push({ t: c });
      i++;
    } else if (SCHEMA_RE.test(c)) {
      toks.push({ t: "schema", name: c });
      i++;
    } else {
      let m = IDENT_RE.exec(s.slice(i));
      if (m) {
        toks.push({ t: "name", name: canonName(m[0]) });
        i += m[0].length;
      } else if ((m = /^\d+/.exec(s.slice(i)))) {
        toks.push({ t: "name", name: m[0] });
        i += m[0].length;
      } else {
        throw { msg: `Unexpected character "${c}"` };
      }
    }
  }
  return toks;
};

const REL_OPS = ["=", "≤", "<", "≥", ">", "≠"];

const FRESH_CANDIDATES = [
  "x", "y", "z", "u", "v", "w",
  "x_1", "y_1", "z_1", "u_1", "v_1", "w_1",
  "x_2", "y_2", "z_2",
];

const tvar = (name) => ({ type: "tvar", name });
const rel = (op, left, right) => ({ type: "rel", op, left, right });
const bin = (op, left, right) => ({ type: "bin", op, left, right });
const forall = (v, sub) => ({ type: "forall", v, sub });
const exists = (v, sub) => ({ type: "exists", v, sub });
const neg = (sub) => ({ type: "neg", sub });
const func = (name, args) => ({ type: "func", name, args });

const termNames = (t) => {
  const out = new Set();
  const go = (u) => {
    if (u.type === "tvar") out.add(u.name);
    else u.args.forEach(go);
  };
  go(t);
  return out;
};

const freshVar = (avoid) => {
  for (const n of FRESH_CANDIDATES) {
    if (!avoid.has(n)) return n;
  }
  let i = 3;
  while (avoid.has(`x_${i}`)) i++;
  return `x_${i}`;
};

// Course macros. Kept as AST nodes so the LaTeX preview can show either the
// shorthand or the expanded definition; verification always expands them.
const MACRO_NAMES = new Set(["least", "greatest", "prime", "even", "odd"]);

const expandMacro = (name, args) => {
  const key = name.toLowerCase();
  if (key === "least" && args.length === 1) {
    const t = args[0];
    const v = freshVar(termNames(t));
    return forall(v, rel("≤", t, tvar(v)));
  }
  if (key === "greatest" && args.length === 1) {
    const t = args[0];
    const v = freshVar(termNames(t));
    return forall(v, rel("≤", tvar(v), t));
  }
  if (key === "prime" && args.length === 1) {
    const t = args[0];
    const avoid = termNames(t);
    // Prime(t) := ((t > 1) ∧ ∀y∀z((y×z = t) → (y=1 ∨ z=1)))
    // (the definition from lecture). The bound variables stay y and z unless
    // the argument contains them, in which case they are renamed fresh.
    const prefer = (name, taken) => (taken.has(name) ? freshVar(taken) : name);
    const y = prefer("y", avoid);
    const z = prefer("z", new Set([...avoid, y]));
    const gt1 = rel(">", t, tvar("1"));
    const prod = rel("=", func("×", [tvar(y), tvar(z)]), t);
    const factors = bin("∨", rel("=", tvar(y), tvar("1")), rel("=", tvar(z), tvar("1")));
    return bin("∧", gt1, forall(y, forall(z, bin("→", prod, factors))));
  }
  if (key === "even" && args.length === 1) {
    const t = args[0];
    const k = freshVar(termNames(t));
    return exists(k, rel("=", t, func("×", [tvar("2"), tvar(k)])));
  }
  if (key === "odd" && args.length === 1) {
    const t = args[0];
    const k = freshVar(termNames(t));
    return exists(k, rel("=", t, func("+", [func("×", [tvar("2"), tvar(k)]), tvar("1")])));
  }
  return null;
};

const expandAst = (node) => {
  if (!node) return node;
  switch (node.type) {
    case "macro": {
      const body = expandMacro(node.name, node.args);
      return body ? expandAst(body) : node;
    }
    case "neg":
      return { type: "neg", sub: expandAst(node.sub) };
    case "bin":
      return {
        type: "bin",
        op: node.op,
        left: expandAst(node.left),
        right: expandAst(node.right),
      };
    case "forall":
    case "exists":
      return { type: node.type, v: node.v, sub: expandAst(node.sub) };
    case "subst":
      return {
        type: "subst",
        formula: expandAst(node.formula),
        partial: node.partial,
        from: node.from,
        to: node.to,
      };
    default:
      return node;
  }
};

const parse = (input) => {
  const toks = tokenize(normalizeOps(input));
  let pos = 0;
  const peek = () => toks[pos];

  const parseTermFactor = () => {
    const tk = peek();
    if (tk && tk.t === "(") {
      pos++;
      const t = parseTermExpr();
      if (!peek() || peek().t !== ")") throw { msg: 'Expected ")" in term' };
      pos++;
      return t;
    }
    if (!tk || tk.t !== "name") {
      throw { msg: `Expected a term but found ${tk ? `"${tk.name || tk.t}"` : "the end of the formula"}` };
    }
    pos++;
    if (peek() && peek().t === "(") {
      pos++;
      const args = [parseTermExpr()];
      while (peek() && peek().t === ",") {
        pos++;
        args.push(parseTermExpr());
      }
      if (!peek() || peek().t !== ")") throw { msg: 'Expected ")" after arguments' };
      pos++;
      return { type: "func", name: tk.name, args };
    }
    return { type: "tvar", name: tk.name };
  };

  const parseTermMul = () => {
    let left = parseTermFactor();
    while (peek() && peek().t === "×") {
      pos++;
      left = { type: "func", name: "×", args: [left, parseTermFactor()] };
    }
    return left;
  };

  const parseTermExpr = () => {
    let left = parseTermMul();
    while (peek() && peek().t === "+") {
      pos++;
      left = { type: "func", name: "+", args: [left, parseTermMul()] };
    }
    return left;
  };

  const finishRel = (left) => {
    const op = peek().t;
    pos++;
    const right = parseTermExpr();
    if (op === "≠") {
      return { type: "neg", sub: { type: "rel", op: "=", left, right } };
    }
    return { type: "rel", op, left, right };
  };

  // Postfix [x/t] (full, also written [x:=t]) or [t/*x] (partial) substitutions.
  const applySubsts = (base) => {
    while (peek() && peek().t === "[") {
      pos++;
      const left = parseTermExpr();
      if (!peek() || peek().t !== "/") throw { msg: 'Expected "/" or ":=" in substitution' };
      pos++;
      if (peek() && peek().t === "*") {
        pos++;
        const v = peek();
        if (!v || v.t !== "name") throw { msg: 'Expected a variable after "/*"' };
        pos++;
        if (!peek() || peek().t !== "]") throw { msg: 'Expected "]" after substitution' };
        pos++;
        base = {
          type: "subst",
          formula: base,
          partial: true,
          from: left,
          to: { type: "tvar", name: v.name },
        };
      } else {
        if (left.type !== "tvar") {
          throw { msg: "Full substitution [v/t] needs a variable on the left of /" };
        }
        const right = parseTermExpr();
        if (!peek() || peek().t !== "]") throw { msg: 'Expected "]" after substitution' };
        pos++;
        base = {
          type: "subst",
          formula: base,
          partial: false,
          from: left,
          to: right,
        };
      }
    }
    return base;
  };

  const atom = () => {
    const tk = peek();
    if (tk && tk.t === "schema") {
      pos++;
      return applySubsts({ type: "schema", name: tk.name });
    }

    const t = parseTermExpr();
    if (peek() && REL_OPS.indexOf(peek().t) !== -1) {
      return applySubsts(finishRel(t));
    }
    if (t.type === "func") {
      if (TERM_INFIX.indexOf(t.name) !== -1) {
        throw { msg: "Expected a relation (=, ≤, ...) after this arithmetic term" };
      }
      const macro = expandMacro(t.name, t.args);
      if (macro) {
        return applySubsts({ type: "macro", name: t.name, args: t.args });
      }
      return applySubsts({ type: "pred", name: t.name, args: t.args });
    }
    return applySubsts({ type: "var", name: t.name });
  };

  const primary = () => {
    const tk = peek();
    if (!tk) throw { msg: "Unexpected end of formula" };
    if (tk.t === "⊥") {
      pos++;
      return applySubsts({ type: "bot" });
    }
    if (tk.t === "(") {
      const save = pos;
      try {
        const t = parseTermExpr();
        if (peek() && REL_OPS.indexOf(peek().t) !== -1) {
          return applySubsts(finishRel(t));
        }
      } catch (e) {}
      pos = save;
      pos++;
      const inner = parseTop();
      if (!peek() || peek().t !== ")") throw { msg: 'Expected ")"' };
      pos++;
      return applySubsts(inner);
    }
    if (tk.t === "name" || tk.t === "schema") return atom();
    throw { msg: `Unexpected token "${tk.name || tk.t}"` };
  };

  const unary = () => {
    const tk = peek();
    if (tk && tk.t === "¬") {
      pos++;
      return applySubsts({ type: "neg", sub: unary() });
    }
    if (tk && (tk.t === "∀" || tk.t === "∃")) {
      pos++;
      const v = peek();
      if (!v || v.t !== "name") throw { msg: `Expected a variable after ${tk.t}` };
      pos++;
      return applySubsts({
        type: tk.t === "∀" ? "forall" : "exists",
        v: v.name,
        sub: unary(),
      });
    }
    return primary();
  };

  const infix = (parseOperand, ops, rightAssoc) => {
    let left = parseOperand();
    while (peek() && ops.indexOf(peek().t) !== -1) {
      const op = peek().t;
      pos++;
      const right = rightAssoc ? infix(parseOperand, ops, true) : parseOperand();
      left = { type: "bin", op, left, right };
      if (rightAssoc) break;
    }
    return left;
  };

  const parseAnd = () => infix(unary, ["∧"], false);
  const parseOr = () => infix(parseAnd, ["∨"], false);
  const parseImpl = () => infix(parseOr, ["→"], true);
  const parseTop = () => infix(parseImpl, ["↔"], true);

  if (toks.length === 0) throw { msg: "Empty formula" };
  const ast = parseTop();
  if (pos !== toks.length) throw { msg: "Unexpected extra input" };
  return ast;
};

const tryParse = (input) => {
  try {
    return { ast: parse(input) };
  } catch (e) {
    return { error: e.msg || String(e) };
  }
};

const termEqual = (a, b) => {
  if (a.type !== b.type) return false;
  if (a.type === "tvar") return a.name === b.name;
  return (
    a.name === b.name &&
    a.args.length === b.args.length &&
    a.args.every((t, i) => termEqual(t, b.args[i]))
  );
};

const equal = (a, b) => {
  a = expandAst(a);
  b = expandAst(b);
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "var":
      return a.name === b.name;
    case "bot":
      return true;
    case "neg":
      return equal(a.sub, b.sub);
    case "bin":
      return a.op === b.op && equal(a.left, b.left) && equal(a.right, b.right);
    case "pred":
      return (
        a.name === b.name &&
        a.args.length === b.args.length &&
        a.args.every((t, i) => termEqual(t, b.args[i]))
      );
    case "rel":
      return a.op === b.op && termEqual(a.left, b.left) && termEqual(a.right, b.right);
    case "forall":
    case "exists":
      return a.v === b.v && equal(a.sub, b.sub);
    case "schema":
      return a.name === b.name;
    case "subst":
      return (
        a.partial === b.partial &&
        equal(a.formula, b.formula) &&
        termEqual(a.from, b.from) &&
        termEqual(a.to, b.to)
      );
  }
  return false;
};

const termToStr = (t) => {
  if (t.type === "tvar") return prettyName(t.name);
  if (TERM_INFIX.indexOf(t.name) !== -1 && t.args.length === 2) {
    return `(${termToStr(t.args[0])}${t.name}${termToStr(t.args[1])})`;
  }
  return `${prettyName(t.name)}(${t.args.map(termToStr).join(", ")})`;
};

const toStr = (a) => {
  switch (a.type) {
    case "var":
      return prettyName(a.name);
    case "bot":
      return "⊥";
    case "neg":
      return `¬${toStr(a.sub)}`;
    case "bin":
      return `(${toStr(a.left)} ${a.op} ${toStr(a.right)})`;
    case "pred":
      return `${prettyName(a.name)}(${a.args.map(termToStr).join(", ")})`;
    case "rel":
      return `(${termToStr(a.left)} ${a.op} ${termToStr(a.right)})`;
    case "forall":
      return `∀${prettyName(a.v)} ${toStr(a.sub)}`;
    case "exists":
      return `∃${prettyName(a.v)} ${toStr(a.sub)}`;
    case "schema":
      return a.name;
    case "macro":
      return `${prettyName(a.name)}(${a.args.map(termToStr).join(", ")})`;
    case "subst": {
      const body = toStr(a.formula);
      if (a.partial) return `${body}[${termToStr(a.from)}/*${termToStr(a.to)}]`;
      return `${body}[${termToStr(a.from)}/${termToStr(a.to)}]`;
    }
  }
  return "?";
};

const freeNames = (node) => {
  node = expandAst(node);
  const out = new Set();
  const termWalk = (t, bound) => {
    if (t.type === "tvar") {
      if (!bound.has(t.name)) out.add(t.name);
      return;
    }
    for (const a of t.args) termWalk(a, bound);
  };
  const walk = (n, bound) => {
    switch (n.type) {
      case "var":
        if (!bound.has(n.name)) out.add(n.name);
        break;
      case "bot":
      case "schema":
        break;
      case "neg":
        walk(n.sub, bound);
        break;
      case "bin":
        walk(n.left, bound);
        walk(n.right, bound);
        break;
      case "pred":
        for (const a of n.args) termWalk(a, bound);
        break;
      case "rel":
        termWalk(n.left, bound);
        termWalk(n.right, bound);
        break;
      case "forall":
      case "exists": {
        const b2 = new Set(bound);
        b2.add(n.v);
        walk(n.sub, b2);
        break;
      }
      case "subst": {
        if (!n.partial && n.from.type === "tvar") {
          const bodyNames = freeNames(n.formula);
          for (const name of bodyNames) {
            if (name !== n.from.name && !bound.has(name)) out.add(name);
          }
          termWalk(n.to, bound);
        } else {
          walk(n.formula, bound);
          termWalk(n.from, bound);
          termWalk(n.to, bound);
        }
        break;
      }
    }
  };
  walk(node, new Set());
  return out;
};

// Does `instance` equal `pattern` with every free occurrence of variable x
// replaced by one term? Returns { ok, term }. For schema formulas, an explicit
// substitution node pattern[x/t] counts as replacing x with t.
const matchSubst = (pattern, instance, x) => {
  pattern = expandAst(pattern);
  instance = expandAst(instance);
  let found = null;
  const occBounds = [];

  const termWalk = (p, q, bound) => {
    if (p.type === "tvar" && p.name === x && !bound.has(x)) {
      if (found && !termEqual(found, q)) return false;
      found = q;
      occBounds.push(bound);
      return true;
    }
    if (p.type !== q.type) return false;
    if (p.type === "tvar") return p.name === q.name;
    return (
      p.name === q.name &&
      p.args.length === q.args.length &&
      p.args.every((a, i) => termWalk(a, q.args[i], bound))
    );
  };

  const walk = (p, q, bound) => {
    // Schema φ matched against φ[x/t] (full subst of the quantified variable).
    if (
      p.type === "schema" &&
      q.type === "subst" &&
      !q.partial &&
      q.from.type === "tvar" &&
      q.from.name === x &&
      !bound.has(x) &&
      equal(p, q.formula)
    ) {
      if (found && !termEqual(found, q.to)) return false;
      found = q.to;
      occBounds.push(bound);
      return true;
    }

    // (¬φ) vs ¬(φ[x/t]) / (¬φ)[x/t] — unwrap matching negations first.
    if (p.type === "neg" && q.type === "neg") return walk(p.sub, q.sub, bound);

    // Negated schema: ¬φ vs (¬φ)[x/t] written as a subst on the outside.
    if (
      p.type === "neg" &&
      q.type === "subst" &&
      !q.partial &&
      q.from.type === "tvar" &&
      q.from.name === x &&
      !bound.has(x) &&
      equal(p, q.formula)
    ) {
      if (found && !termEqual(found, q.to)) return false;
      found = q.to;
      occBounds.push(bound);
      return true;
    }

    // Subst vs subst: same structure, recurse into bodies / terms.
    if (p.type === "subst" && q.type === "subst") {
      if (p.partial !== q.partial) return false;
      if (!walk(p.formula, q.formula, bound)) return false;
      if (!termWalk(p.from, q.from, bound)) return false;
      return termWalk(p.to, q.to, bound);
    }

    if (p.type !== q.type) return false;
    switch (p.type) {
      case "var":
        return p.name === q.name;
      case "bot":
        return true;
      case "schema":
        return p.name === q.name;
      case "neg":
        return walk(p.sub, q.sub, bound);
      case "bin":
        return p.op === q.op && walk(p.left, q.left, bound) && walk(p.right, q.right, bound);
      case "pred":
        return (
          p.name === q.name &&
          p.args.length === q.args.length &&
          p.args.every((a, i) => termWalk(a, q.args[i], bound))
        );
      case "rel":
        return p.op === q.op && termWalk(p.left, q.left, bound) && termWalk(p.right, q.right, bound);
      case "forall":
      case "exists": {
        if (p.v !== q.v) return false;
        const b2 = new Set(bound);
        b2.add(p.v);
        return walk(p.sub, q.sub, b2);
      }
      case "subst":
        return false;
    }
    return false;
  };

  if (!walk(pattern, instance, new Set())) return { ok: false };
  if (found) {
    const names = termNames(found);
    for (const b of occBounds) {
      for (const n of names) {
        if (b.has(n)) return { ok: false, captured: n };
      }
    }
  }
  return { ok: true, term: found };
};

const eqReplaceCheck = (from, to, s, t) => {
  from = expandAst(from);
  to = expandAst(to);
  const sNames = termNames(s);
  const tNames = termNames(t);

  const termOk = (a, b, bound) => {
    if (termEqual(a, s) && termEqual(b, t)) {
      for (const n of sNames) if (bound.has(n)) return false;
      for (const n of tNames) if (bound.has(n)) return false;
      return true;
    }
    if (a.type !== b.type) return false;
    if (a.type === "tvar") return a.name === b.name;
    return (
      a.name === b.name &&
      a.args.length === b.args.length &&
      a.args.every((x, i) => termOk(x, b.args[i], bound))
    );
  };

  const walk = (p, q, bound) => {
    if (p.type !== q.type) return false;
    switch (p.type) {
      case "var":
        return p.name === q.name;
      case "bot":
        return true;
      case "schema":
        return p.name === q.name;
      case "neg":
        return walk(p.sub, q.sub, bound);
      case "bin":
        return p.op === q.op && walk(p.left, q.left, bound) && walk(p.right, q.right, bound);
      case "pred":
        return (
          p.name === q.name &&
          p.args.length === q.args.length &&
          p.args.every((a, i) => termOk(a, q.args[i], bound))
        );
      case "rel":
        return p.op === q.op && termOk(p.left, q.left, bound) && termOk(p.right, q.right, bound);
      case "forall":
      case "exists": {
        if (p.v !== q.v) return false;
        const b2 = new Set(bound);
        b2.add(p.v);
        return walk(p.sub, q.sub, b2);
      }
      case "subst":
        return (
          p.partial === q.partial &&
          walk(p.formula, q.formula, bound) &&
          termOk(p.from, q.from, bound) &&
          termOk(p.to, q.to, bound)
        );
    }
    return false;
  };

  return walk(from, to, new Set());
};

window.Formula = {
  parse,
  tryParse,
  equal,
  toStr,
  termToStr,
  prettyName,
  normalizeOps,
  termEqual,
  freeNames,
  matchSubst,
  eqReplaceCheck,
  expandMacro,
  expandAst,
  MACRO_NAMES,
};
