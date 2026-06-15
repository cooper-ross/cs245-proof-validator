const isNeg = (a) => a.type === "neg";
const isBot = (a) => a.type === "bot";
const isBin = (a, op) => a.type === "bin" && a.op === op;

const verify = (premiseStrs, conclusionStr, proofText, opts) => {
  opts = opts || {};

  const premises = [];
  for (let i = 0; i < (premiseStrs || []).length; i++) {
    const s = premiseStrs[i].trim();
    if (!s) continue;
    const r = Formula.tryParse(s);
    if (r.error) {
      return { valid: false, message: `Malformed premise "${s}": ${r.error}` };
    }
    premises.push(r.ast);
  }

  const concStr = (conclusionStr || "").trim();
  let conclusion = null;
  if (concStr) {
    const concR = Formula.tryParse(concStr);
    if (concR.error) {
      return { valid: false, message: `Malformed conclusion: ${concR.error}` };
    }
    conclusion = concR.ast;
  } else if (!opts.implicitConclusion) {
    return { valid: false, message: "No target conclusion was provided." };
  }

  const parsed = Proof.parseProofText(proofText);
  if (parsed.error) {
    return { valid: false, line: parsed.error.num, message: parsed.error.msg };
  }
  const lines = parsed.lines;
  if (lines.length === 0) {
    return { valid: false, message: "The proof has no lines." };
  }

  const scoped = Proof.buildScopes(lines);
  if (scoped.error) {
    return { valid: false, line: scoped.error.num, message: scoped.error.msg };
  }
  const { root, completed, lineScope } = scoped;

  const lineByNum = (m) => {
    if (m >= 1 && m <= lines.length && lines[m - 1].num === m) return lines[m - 1];
    return null;
  };

  const accessLine = (m, L) => {
    const t = lineByNum(m);
    if (!t) return { ok: false, msg: `cited line ${m} does not exist` };
    if (m >= L.num) {
      return { ok: false, msg: `cited line ${m} is not earlier than line ${L.num}` };
    }
    const chain = Proof.ancestorChain(lineScope[L.num]);
    if (chain.indexOf(lineScope[m]) === -1) {
      return {
        ok: false,
        msg: `line ${m} is not accessible from line ${L.num} (it lies inside a closed subproof and cannot be cited individually)`,
      };
    }
    return { ok: true, line: t };
  };

  const accessRange = (j, k, L) => {
    const cs = completed.find((c) => c.start === j && c.end === k);
    if (!cs) {
      return {
        ok: false,
        msg: `lines ${j}-${k} are not exactly one completed subproof (its first line must be ${j} and its last line ${k})`,
      };
    }
    if (k >= L.num) {
      return { ok: false, msg: `subproof ${j}-${k} is not earlier than line ${L.num}` };
    }
    const chain = Proof.ancestorChain(lineScope[L.num]);
    if (chain.indexOf(cs.parentScope) === -1) {
      return {
        ok: false,
        msg: `subproof ${j}-${k} is not accessible as a whole from line ${L.num}`,
      };
    }
    return {
      ok: true,
      assumption: lines[j - 1].formula,
      conclusion: lines[k - 1].formula,
    };
  };

  const refShape = (refs, spec, ruleName) => {
    if (refs.length !== spec.length) {
      return `${ruleName} expects ${spec.length} reference(s) but got ${refs.length}`;
    }
    for (let i = 0; i < spec.length; i++) {
      if (refs[i].kind !== spec[i]) {
        const want = spec[i] === "line" ? "a line number" : "a subproof range j-k";
        return `${ruleName} reference #${i + 1} should be ${want}`;
      }
    }
    return null;
  };

  const fail = (L, msg) => ({ valid: false, line: L.num, message: msg });

  for (const L of lines) {
    const cur = L.formula;
    const refs = L.refs;
    const rule = L.rule;

    switch (rule) {
      case "PR": {
        const e = refShape(refs, [], "PR");
        if (e) return fail(L, e);
        if (!opts.implicitPremises && !premises.some((p) => Formula.equal(p, cur))) {
          return fail(L, "PR line is not one of the premises Γ (exact syntactic match required).");
        }
        break;
      }

      case "AS": {
        const e = refShape(refs, [], "AS");
        if (e) return fail(L, e);
        break;
      }

      case "R": {
        const e = refShape(refs, ["line"], "R");
        if (e) return fail(L, e);
        const a = accessLine(refs[0].n, L);
        if (!a.ok) return fail(L, a.msg);
        if (!Formula.equal(cur, a.line.formula)) {
          return fail(L, `R requires the formula to be syntactically identical to line ${refs[0].n}.`);
        }
        break;
      }

      case "∧I": {
        const e = refShape(refs, ["line", "line"], "∧I");
        if (e) return fail(L, e);
        const a = accessLine(refs[0].n, L);
        if (!a.ok) return fail(L, a.msg);
        const b = accessLine(refs[1].n, L);
        if (!b.ok) return fail(L, b.msg);
        if (!isBin(cur, "∧")) return fail(L, "∧I must conclude a conjunction (φ ∧ ψ).");
        if (!Formula.equal(cur.left, a.line.formula)) {
          return fail(L, `∧I: left conjunct must equal line ${refs[0].n}.`);
        }
        if (!Formula.equal(cur.right, b.line.formula)) {
          return fail(L, `∧I: right conjunct must equal line ${refs[1].n}.`);
        }
        break;
      }

      case "∧E": {
        const e = refShape(refs, ["line"], "∧E");
        if (e) return fail(L, e);
        const a = accessLine(refs[0].n, L);
        if (!a.ok) return fail(L, a.msg);
        if (!isBin(a.line.formula, "∧")) {
          return fail(L, `∧E: line ${refs[0].n} must be a conjunction (φ ∧ ψ).`);
        }
        if (!Formula.equal(cur, a.line.formula.left) && !Formula.equal(cur, a.line.formula.right)) {
          return fail(L, `∧E: the formula must be exactly the left or right conjunct of line ${refs[0].n}.`);
        }
        break;
      }

      case "∨I": {
        const e = refShape(refs, ["line"], "∨I");
        if (e) return fail(L, e);
        const a = accessLine(refs[0].n, L);
        if (!a.ok) return fail(L, a.msg);
        if (!isBin(cur, "∨")) return fail(L, "∨I must conclude a disjunction (φ ∨ ψ).");
        if (!Formula.equal(cur.left, a.line.formula) && !Formula.equal(cur.right, a.line.formula)) {
          return fail(L, `∨I: line ${refs[0].n} must appear as the left or right disjunct.`);
        }
        break;
      }

      case "∨E": {
        const e = refShape(refs, ["line", "range", "range"], "∨E");
        if (e) return fail(L, e);
        const di = accessLine(refs[0].n, L);
        if (!di.ok) return fail(L, di.msg);
        if (!isBin(di.line.formula, "∨")) {
          return fail(L, `∨E: line ${refs[0].n} must be a disjunction (φ ∨ ψ).`);
        }
        const sp1 = accessRange(refs[1].start, refs[1].end, L);
        if (!sp1.ok) return fail(L, sp1.msg);
        const sp2 = accessRange(refs[2].start, refs[2].end, L);
        if (!sp2.ok) return fail(L, sp2.msg);
        const phi = di.line.formula.left;
        const psi = di.line.formula.right;
        if (!Formula.equal(sp1.assumption, phi)) {
          return fail(L, "∨E: the first subproof's assumption must equal the left disjunct.");
        }
        if (!Formula.equal(sp2.assumption, psi)) {
          return fail(L, "∨E: the second subproof's assumption must equal the right disjunct.");
        }
        if (!Formula.equal(sp1.conclusion, cur)) {
          return fail(L, "∨E: the first subproof's conclusion must equal this line.");
        }
        if (!Formula.equal(sp2.conclusion, cur)) {
          return fail(L, "∨E: the second subproof's conclusion must equal this line.");
        }
        break;
      }

      case "⊥E": {
        const e = refShape(refs, ["line"], "⊥E");
        if (e) return fail(L, e);
        const a = accessLine(refs[0].n, L);
        if (!a.ok) return fail(L, a.msg);
        if (!isBot(a.line.formula)) return fail(L, `⊥E: line ${refs[0].n} must be ⊥.`);
        break;
      }

      case "¬E": {
        const e = refShape(refs, ["line", "line"], "¬E");
        if (e) return fail(L, e);
        const a = accessLine(refs[0].n, L);
        if (!a.ok) return fail(L, a.msg);
        const b = accessLine(refs[1].n, L);
        if (!b.ok) return fail(L, b.msg);
        if (!isBot(cur)) return fail(L, "¬E must conclude ⊥.");
        if (!isNeg(b.line.formula)) {
          return fail(L, `¬E: line ${refs[1].n} must be the negation ¬φ (with line ${refs[0].n} being φ) (switch the order lol).`);
        }
        if (!Formula.equal(b.line.formula.sub, a.line.formula)) {
          return fail(L, `¬E: line ${refs[1].n} must be exactly ¬(line ${refs[0].n}).`);
        }
        break;
      }

      case "¬I": {
        const e = refShape(refs, ["range"], "¬I");
        if (e) return fail(L, e);
        const sp = accessRange(refs[0].start, refs[0].end, L);
        if (!sp.ok) return fail(L, sp.msg);
        if (!isBot(sp.conclusion)) return fail(L, "¬I: the subproof must conclude ⊥.");
        if (!isNeg(cur)) return fail(L, "¬I must conclude a negation ¬φ.");
        if (!Formula.equal(cur.sub, sp.assumption)) {
          return fail(L, "¬I: the negated formula must equal the subproof's assumption.");
        }
        break;
      }

      case "RAA": {
        const e = refShape(refs, ["range"], "RAA");
        if (e) return fail(L, e);
        const sp = accessRange(refs[0].start, refs[0].end, L);
        if (!sp.ok) return fail(L, sp.msg);
        if (!isNeg(sp.assumption)) {
          return fail(L, "RAA: the subproof's assumption must be a negation ¬φ.");
        }
        if (!isBot(sp.conclusion)) return fail(L, "RAA: the subproof must conclude ⊥.");
        if (!Formula.equal(cur, sp.assumption.sub)) {
          return fail(L, "RAA: this line must equal φ, where the assumption was ¬φ.");
        }
        break;
      }

      case "→E": {
        const e = refShape(refs, ["line", "line"], "→E");
        if (e) return fail(L, e);
        const a = accessLine(refs[0].n, L);
        if (!a.ok) return fail(L, a.msg);
        const b = accessLine(refs[1].n, L);
        if (!b.ok) return fail(L, b.msg);
        if (!isBin(a.line.formula, "→")) {
          return fail(L, `→E: line ${refs[0].n} must be a conditional (φ → ψ).`);
        }
        if (!Formula.equal(b.line.formula, a.line.formula.left)) {
          return fail(L, `→E: line ${refs[1].n} must equal the antecedent of line ${refs[0].n}.`);
        }
        if (!Formula.equal(cur, a.line.formula.right)) {
          return fail(L, `→E: this line must equal the consequent of line ${refs[0].n}.`);
        }
        break;
      }

      case "→I": {
        const e = refShape(refs, ["range"], "→I");
        if (e) return fail(L, e);
        const sp = accessRange(refs[0].start, refs[0].end, L);
        if (!sp.ok) return fail(L, sp.msg);
        if (!isBin(cur, "→")) return fail(L, "→I must conclude a conditional (φ → ψ).");
        if (!Formula.equal(cur.left, sp.assumption)) {
          return fail(L, "→I: the antecedent must equal the subproof's assumption.");
        }
        if (!Formula.equal(cur.right, sp.conclusion)) {
          return fail(L, "→I: the consequent must equal the subproof's conclusion.");
        }
        break;
      }

      case "↔I": {
        const e = refShape(refs, ["line", "line"], "↔I");
        if (e) return fail(L, e);
        const a = accessLine(refs[0].n, L);
        if (!a.ok) return fail(L, a.msg);
        const b = accessLine(refs[1].n, L);
        if (!b.ok) return fail(L, b.msg);
        if (!isBin(a.line.formula, "→")) {
          return fail(L, `↔I: line ${refs[0].n} must be a conditional (φ → ψ).`);
        }
        if (!isBin(b.line.formula, "→")) {
          return fail(L, `↔I: line ${refs[1].n} must be a conditional (ψ → φ).`);
        }
        if (
          !Formula.equal(a.line.formula.left, b.line.formula.right) ||
          !Formula.equal(a.line.formula.right, b.line.formula.left)
        ) {
          return fail(L, "↔I: the two conditionals must be converses of each other.");
        }
        if (!isBin(cur, "↔")) return fail(L, "↔I must conclude a biconditional (φ ↔ ψ).");
        if (!Formula.equal(cur.left, a.line.formula.left) || !Formula.equal(cur.right, a.line.formula.right)) {
          return fail(
            L,
            `↔I: the biconditional must match the order of the cited conditionals (left = antecedent of line ${refs[0].n}, right = its consequent).`
          );
        }
        break;
      }

      case "↔E": {
        const e = refShape(refs, ["line"], "↔E");
        if (e) return fail(L, e);
        const a = accessLine(refs[0].n, L);
        if (!a.ok) return fail(L, a.msg);
        if (!isBin(a.line.formula, "↔")) {
          return fail(L, `↔E: line ${refs[0].n} must be a biconditional (φ ↔ ψ).`);
        }
        if (!isBin(cur, "→")) return fail(L, "↔E must conclude a conditional.");
        const bi = a.line.formula;
        const forward = Formula.equal(cur.left, bi.left) && Formula.equal(cur.right, bi.right);
        const reverse = Formula.equal(cur.left, bi.right) && Formula.equal(cur.right, bi.left);
        if (!forward && !reverse) {
          return fail(L, `↔E: the conditional must be (φ → ψ) or (ψ → φ) from line ${refs[0].n}.`);
        }
        break;
      }

      default:
        return fail(L, `Unknown rule "${rule}".`);
    }
  }

  const last = lines[lines.length - 1];
  if (lineScope[last.num] !== root) {
    return fail(
      last,
      "The final line is inside a subproof; the conclusion must be derived in the main (outermost) scope with all assumptions discharged."
    );
  }
  if (conclusion && !Formula.equal(last.formula, conclusion)) {
    return fail(
      last,
      `The final line is not the target conclusion. Expected ${Formula.toStr(conclusion)} but found ${Formula.toStr(last.formula)}.`
    );
  }

  const phi = conclusion || last.formula;
  const gamma = [];
  const seen = {};
  for (const L of lines) {
    if (L.rule !== "PR") continue;
    const s = Formula.toStr(L.formula);
    if (!seen[s]) {
      seen[s] = true;
      gamma.push(s);
    }
  }
  const gammaStr = gamma.length ? `{ ${gamma.join(", ")} }` : "∅";

  return { valid: true, message: `${gammaStr} ⊢ ${Formula.toStr(phi)}` };
};

window.Validator = { verify };