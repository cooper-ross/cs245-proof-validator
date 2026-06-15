const normalizeOps = (s) => s
  .replace(/<->/g, "↔")
  .replace(/<=>/g, "↔")
  .replace(/->/g, "→")
  .replace(/=>/g, "→")
  .replace(/_\|_/g, "⊥")
  .replace(/⋁/g, "∨")
  .replace(/⋀/g, "∧")
  .replace(/&/g, "∧")
  .replace(/\^/g, "∧")
  .replace(/\|/g, "∨")
  .replace(/~/g, "¬")
  .replace(/!/g, "¬");

const tokenize = (s) => {
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
    } else if ("¬∧∨→↔⊥()".indexOf(c) !== -1) {
      toks.push({ t: c });
      i++;
    } else {
      const m = /^[A-Za-z](?:_\d+|\d+)?/.exec(s.slice(i));
      if (!m) throw { msg: `Unexpected character "${c}"` };
      const parts = /^([A-Za-z])_?(\d+)?$/.exec(m[0]);
      const name = parts[1] + (parts[2] ? `_${parts[2]}` : "");
      toks.push({ t: "var", name });
      i += m[0].length;
    }
  }
  return toks;
};

const parse = (input) => {
  const toks = tokenize(normalizeOps(input));
  let pos = 0;
  const peek = () => toks[pos];

  const primary = () => {
    const tk = peek();
    if (!tk) throw { msg: "Unexpected end of formula" };
    if (tk.t === "⊥") {
      pos++;
      return { type: "bot" };
    }
    if (tk.t === "var") {
      pos++;
      return { type: "var", name: tk.name };
    }
    if (tk.t === "(") {
      pos++;
      const inner = parseTop();
      if (!peek() || peek().t !== ")") throw { msg: 'Expected ")"' };
      pos++;
      return inner;
    }
    throw { msg: `Unexpected token "${tk.name || tk.t}"` };
  };

  const unary = () => {
    if (peek() && peek().t === "¬") {
      pos++;
      return { type: "neg", sub: unary() };
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

const equal = (a, b) => {
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
  }
  return false;
};

const toStr = (a) => {
  switch (a.type) {
    case "var":
      return a.name;
    case "bot":
      return "⊥";
    case "neg":
      return `¬${toStr(a.sub)}`;
    case "bin":
      return `(${toStr(a.left)} ${a.op} ${toStr(a.right)})`;
  }
  return "?";
};

window.Formula = { parse, tryParse, equal, toStr, normalizeOps };