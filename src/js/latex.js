const OP_LATEX = {
  "∧": "\\land",
  "∨": "\\lor",
  "→": "\\rightarrow",
  "←": "\\leftarrow",
  "↔": "\\leftrightarrow",
};

const astToLatex = (ast) => {
  if (!ast) return "";
  switch (ast.type) {
    case "var":
      return ast.name;
    case "bot":
      return "\\bot";
    case "neg": {
      const sub = astToLatex(ast.sub);
      const wrap = ast.sub.type === "bin" ? `\\left(${sub}\\right)` : sub;
      return `\\lnot ${wrap}`;
    }
    case "bin": {
      const op = OP_LATEX[ast.op] || ast.op;
      const left = astToLatex(ast.left);
      const right = astToLatex(ast.right);
      const l = ast.left.type === "bin" ? `\\left(${left}\\right)` : left;
      const r = ast.right.type === "bin" ? `\\left(${right}\\right)` : right;
      return `${l} \\, ${op} \\, ${r}`;
    }
  }
  return "";
};

const formulaToLatex = (str) => {
  const s = (str || "").trim();
  if (!s) return "";
  const r = Formula.tryParse(s);
  if (r.error) return s.replace(/_/g, "\\_");
  return astToLatex(r.ast);
};

const ruleToLatex = (rule) => {
  const s = (rule || "").trim();
  if (!s) return "";
  return `\\text{${s}}`;
};

const computeBoxes = (rows) => {
  const stack = [];
  const boxes = [];
  for (let i = 0; i < rows.length; i++) {
    const d = rows[i].depth;
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (d < top.depth) {
        top.end = i - 1;
        boxes.push(stack.pop());
        continue;
      }
      if (d === top.depth && rows[i].startsBox) {
        top.end = i - 1;
        boxes.push(stack.pop());
        break;
      }
      break;
    }
    if (rows[i].startsBox) stack.push({ depth: d, start: i });
  }
  while (stack.length) {
    const top = stack.pop();
    top.end = rows.length - 1;
    boxes.push(top);
  }
  return boxes;
};

const proofToLatex = (rows) => {
  const lines = [
    "% needs \\usepackage{amsmath} in your preamble",
    "\\begin{align*}",
  ];
  rows.forEach((row, i) => {
    const num = i + 1;
    const pad = row.depth ? `\\quad `.repeat(row.depth) : "";
    const phi = formulaToLatex(row.formula) || "\\phantom{.}";
    const rule = row.startsBox ? "\\text{AS}" : ruleToLatex(row.rule);
    lines.push(`\\text{${num}.}\\ ${pad}${phi} && ${rule} \\\\`);
  });
  lines.push("\\end{align*}");
  return lines.join("\n");
};

const renderMath = (el, latex, displayMode) => {
  if (!latex) {
    el.textContent = "";
    return;
  }
  if (typeof katex === "undefined") {
    el.textContent = latex;
    return;
  }
  try {
    katex.render(latex, el, { throwOnError: false, displayMode: !!displayMode });
  } catch (e) {
    el.textContent = latex;
  }
};

const drawPreviewBrackets = (previewEl, indentPx) => {
  previewEl.querySelectorAll(".bracket").forEach((b) => b.remove());
  const prows = previewEl.querySelectorAll(".lp-row");
  if (!prows.length) return;

  const rowLeft = prows[0].offsetLeft;
  const gutter = prows[0].querySelector(".lp-gutter");
  const gutterW = gutter ? gutter.offsetWidth : 38;
  const baseLeft = rowLeft + gutterW;

  const rows = [];
  prows.forEach((p) => {
    rows.push({
      depth: +p.dataset.depth,
      startsBox: p.dataset.startsBox === "1",
    });
  });

  computeBoxes(rows).forEach((box) => {
    const startEl = prows[box.start];
    const endEl = prows[box.end];
    if (!startEl || !endEl) return;
    const top = startEl.offsetTop + 3;
    const bottom = endEl.offsetTop + endEl.offsetHeight - 3;
    const el = document.createElement("div");
    el.className = "bracket";
    el.style.left = `${baseLeft + (box.depth - 1) * indentPx}px`;
    el.style.top = `${top}px`;
    el.style.height = `${Math.max(0, bottom - top)}px`;
    previewEl.appendChild(el);
  });
};

const renderPreview = (previewEl, sourceEl, rows, indentPx) => {
  previewEl.innerHTML = "";
  rows.forEach((row, i) => {
    const line = document.createElement("div");
    line.className = "lp-row";
    line.dataset.depth = row.depth;
    line.dataset.startsBox = row.startsBox ? "1" : "0";

    const gutter = document.createElement("div");
    gutter.className = "lp-gutter";
    gutter.textContent = i + 1;
    line.appendChild(gutter);

    const spacer = document.createElement("div");
    spacer.className = "lp-spacer";
    spacer.style.width = `${row.depth * indentPx}px`;
    line.appendChild(spacer);

    const phi = document.createElement("div");
    phi.className = "lp-formula";
    renderMath(phi, formulaToLatex(row.formula), false);
    line.appendChild(phi);

    const rule = document.createElement("div");
    rule.className = "lp-rule" + (row.startsBox ? " as" : "");
    const ruleText = row.startsBox ? "AS" : row.rule;
    if (ruleText) renderMath(rule, ruleToLatex(ruleText), false);
    line.appendChild(rule);

    previewEl.appendChild(line);
  });

  if (sourceEl) sourceEl.textContent = proofToLatex(rows);

  requestAnimationFrame(() => drawPreviewBrackets(previewEl, indentPx));
};

window.Latex = {
  astToLatex,
  formulaToLatex,
  proofToLatex,
  renderPreview,
  drawPreviewBrackets,
};