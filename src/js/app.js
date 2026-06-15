const $ = (id) => document.getElementById(id);
const editorEl = $("editor");
const resultEl = $("result");
const latexPreviewEl = $("latex-preview");
const latexSourceEl = $("latex-source");

const INDENT = 13; // px per nesting level (spacer width + bracket offset)

const REPLACERS = [
  ["\\lnot", "¬"],
  ["\\neg", "¬"],
  ["\\land", "∧"],
  ["\\wedge", "∧"],
  ["\\lor", "∨"],
  ["\\vee", "∨"],
  ["\\leftrightarrow", "↔"],
  ["\\iff", "↔"],
  ["\\rightarrow", "→"],
  ["\\implies", "→"],
  ["\\to", "→"],
  ["\\bot", "⊥"],
  ["\\top", "⊥"],
  ["<->", "↔"],
  ["<=>", "↔"],
  ["->", "→"],
  ["=>", "→"],
  ["&", "∧"],
  ["|", "∨"],
  ["^", "∧"],
  ["~", "¬"],
  ["!", "¬"],
];

const liveTransform = (value, caret) => {
  let out = "";
  let newCaret = caret;
  let i = 0;
  while (i < value.length) {
    let hit = null;
    for (const pair of REPLACERS) {
      if (value.startsWith(pair[0], i)) {
        hit = pair;
        break;
      }
    }
    if (hit) {
      out += hit[1];
      if (i < caret) newCaret += hit[1].length - hit[0].length;
      i += hit[0].length;
    } else {
      out += value[i++];
    }
  }
  return { value: out, caret: Math.max(0, newCaret) };
};

const emptyRow = () => ({ formula: "", rule: "", depth: 0, startsBox: false });

let rows = [emptyRow()];
let pendingFocus = null;

const normalizeDepths = () => {
  for (let i = 0; i < rows.length; i++) {
    // Line 1 may open a subproof (e.g. pasted proofs starting with ⎡ … AS).
    const cap = i === 0 ? rows[i].depth : rows[i - 1].depth + 1;
    if (rows[i].depth > cap) rows[i].depth = cap;
    if (rows[i].depth < 0) rows[i].depth = 0;
    if (rows[i].depth === 0) rows[i].startsBox = false;
  }
};

const newLineAfter = (i) => {
  const depth = rows[i].depth;
  rows.splice(i + 1, 0, {
    formula: "",
    rule: "",
    depth: depth,
    startsBox: false,
  });
  normalizeDepths();
  pendingFocus = { index: i + 1, field: "formula", caret: 0 };
};

const indentRow = (i) => {
  if (i === 0) return;
  const cap = rows[i - 1].depth + 1;
  rows[i].depth = Math.min(rows[i].depth + 1, cap);
  rows[i].startsBox = true;
  rows[i].rule = "AS";
  normalizeDepths();
  pendingFocus = { index: i, field: "formula", caret: rows[i].formula.length };
};

const dedentRow = (i) => {
  if (rows[i].depth > 0) rows[i].depth -= 1;
  rows[i].startsBox = false;
  if (rows[i].rule === "AS") rows[i].rule = "";
  normalizeDepths();
  pendingFocus = { index: i, field: "formula", caret: rows[i].formula.length };
};

const deleteRow = (i) => {
  if (rows.length === 1) return;
  rows.splice(i, 1);
  normalizeDepths();
  const prev = Math.max(0, i - 1);
  pendingFocus = {
    index: prev,
    field: "formula",
    caret: rows[prev].formula.length,
  };
};

const moveFocus = (i, field, caret) => {
  pendingFocus = { index: i, field, caret };
};

const updateLatexPreview = () => {
  if (!latexPreviewEl || !Latex) return;
  Latex.renderPreview(latexPreviewEl, latexSourceEl, rows, INDENT);
};

const computeEditorBoxes = () => {
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

const drawBrackets = () => {
  Array.prototype.slice
    .call(editorEl.querySelectorAll(".bracket"))
    .forEach((b) => b.remove());

  const prows = editorEl.querySelectorAll(".prow");
  if (!prows.length) return;
  const rowLeft = prows[0].offsetLeft;
  const gutter = prows[0].querySelector(".gutter");
  const gutterW = gutter ? gutter.offsetWidth : 38;
  const baseLeft = rowLeft + gutterW;

  computeEditorBoxes().forEach((box) => {
    const startEl = prows[box.start];
    const endEl = prows[box.end];
    if (!startEl || !endEl) return;
    const top = startEl.offsetTop + 3;
    const bottom = endEl.offsetTop + endEl.offsetHeight - 3;
    const el = document.createElement("div");
    el.className = "bracket";
    el.style.left = `${baseLeft + (box.depth - 1) * INDENT}px`;
    el.style.top = `${top}px`;
    el.style.height = `${Math.max(0, bottom - top)}px`;
    editorEl.appendChild(el);
  });
};

const restoreFocus = () => {
  if (!pendingFocus) return;
  const { index, field, caret } = pendingFocus;
  pendingFocus = null;
  const prow = editorEl.querySelectorAll(".prow")[index];
  if (!prow) return;
  const el = prow.querySelector("." + field);
  if (!el || el.readOnly) {
    const alt = prow.querySelector(".formula");
    if (alt) alt.focus();
    return;
  }
  el.focus();
  const c = Math.min(caret == null ? el.value.length : caret, el.value.length);
  try {
    el.setSelectionRange(c, c);
  } catch (e) {}
};

const wireFormula = (input, i) => {
  input.addEventListener("input", () => {
    const r = liveTransform(input.value, input.selectionStart || 0);
    if (r.value !== input.value) {
      input.value = r.value;
      try {
        input.setSelectionRange(r.caret, r.caret);
      } catch (e) {}
    }
    rows[i].formula = input.value;
    clearErrors();
    updateLatexPreview();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      newLineAfter(i);
      render();
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      indentRow(i);
      render();
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      dedentRow(i);
      render();
    } else if (
      e.key === "Backspace" &&
      input.value === "" &&
      (input.selectionStart || 0) === 0
    ) {
      e.preventDefault();
      deleteRow(i);
      render();
    } else if (e.key === "ArrowUp" && i > 0) {
      e.preventDefault();
      moveFocus(i - 1, "formula", rows[i - 1].formula.length);
      restoreFocus();
    } else if (e.key === "ArrowDown" && i < rows.length - 1) {
      e.preventDefault();
      moveFocus(i + 1, "formula", rows[i + 1].formula.length);
      restoreFocus();
    }
  });
};

const wireRule = (input, i) => {
  input.addEventListener("input", () => {
    const r = liveTransform(input.value, input.selectionStart || 0);
    if (r.value !== input.value) {
      input.value = r.value;
      try {
        input.setSelectionRange(r.caret, r.caret);
      } catch (e) {}
    }
    rows[i].rule = input.value;
    clearErrors();
    updateLatexPreview();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      newLineAfter(i);
      render();
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      indentRow(i);
      render();
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      dedentRow(i);
      render();
    }
  });
};

const render = () => {
  editorEl.innerHTML = "";
  rows.forEach((row, i) => {
    const prow = document.createElement("div");
    prow.className = "prow";
    prow.dataset.i = i;

    const gutter = document.createElement("div");
    gutter.className = "gutter";
    gutter.textContent = i + 1;
    prow.appendChild(gutter);

    const spacer = document.createElement("div");
    spacer.className = "spacer";
    spacer.style.width = `${row.depth * INDENT}px`;
    prow.appendChild(spacer);

    const f = document.createElement("input");
    f.className = "formula";
    f.type = "text";
    f.spellcheck = false;
    f.value = row.formula;
    f.placeholder = "formula";
    wireFormula(f, i);
    prow.appendChild(f);

    const r = document.createElement("input");
    r.className = "rule";
    r.type = "text";
    r.spellcheck = false;
    if (row.startsBox) {
      r.value = "AS";
      r.readOnly = true;
      r.classList.add("as");
      r.title = "Assumption (opens this subproof)";
    } else {
      r.value = row.rule;
      r.placeholder = i === 0 ? "PR" : "rule";
    }
    wireRule(r, i);
    prow.appendChild(r);

    editorEl.appendChild(prow);
  });
  drawBrackets();
  restoreFocus();
  updateLatexPreview();
};

const rowsToText = () =>
  rows
    .map((row, i) => {
      const indent = "  ".repeat(row.depth);
      const rule = row.startsBox ? "AS" : row.rule || "";
      return `${indent}${i + 1}. ${row.formula || ""}    ${rule}`;
    })
    .join("\n");

const clearErrors = () => {
  Array.prototype.forEach.call(editorEl.querySelectorAll(".prow"), (c) =>
    c.classList.remove("errline")
  );
};

const highlightError = (line) => {
  if (!line) return;
  const prow = editorEl.querySelectorAll(".prow")[line - 1];
  if (prow) {
    prow.classList.add("errline");
    const f = prow.querySelector(".formula");
    if (f) f.focus();
  }
};

const showResult = (res) => {
  clearErrors();
  if (res.valid) {
    resultEl.className = "result ok";
    resultEl.textContent = "Valid: " + res.message;
  } else {
    resultEl.className = "result bad";
    const where = res.line != null ? `Invalid at line ${res.line}: ` : "Invalid: ";
    resultEl.textContent = where + res.message;
    highlightError(res.line);
  }
};

const handlePaste = (e) => {
  const text = e.clipboardData && e.clipboardData.getData("text/plain");
  if (!text || !Paste || !Paste.looksLikeProof(text)) return;

  const active = document.activeElement;
  const prow = active && active.closest ? active.closest(".prow") : null;
  const rowIndex = prow ? +prow.dataset.i : -1;

  if (!/\n/.test(text.trim()) && rowIndex >= 0 && Paste.applySingleLine(text, rows[rowIndex])) {
    e.preventDefault();
    normalizeDepths();
    pendingFocus = {
      index: rowIndex,
      field: "formula",
      caret: rows[rowIndex].formula.length,
    };
    clearErrors();
    render();
    return;
  }

  const result = Paste.parseToRows(text);
  if (!result || result.error || !result.rows) return;

  e.preventDefault();
  rows = result.rows.length ? result.rows : [emptyRow()];
  normalizeDepths();
  pendingFocus = { index: 0, field: "formula", caret: 0 };
  clearErrors();
  render();
};

$("check").addEventListener("click", () => {
  const res = Validator.verify([], "", rowsToText(), {
    implicitPremises: true,
    implicitConclusion: true,
  });
  showResult(res);
});

const copyLatexBtn = $("copy-latex");
copyLatexBtn.addEventListener("click", async () => {
  const text = latexSourceEl.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyLatexBtn.textContent = "Copied!";
    copyLatexBtn.classList.add("copied");
    setTimeout(() => {
      copyLatexBtn.textContent = "Copy LaTeX source";
      copyLatexBtn.classList.remove("copied");
    }, 1500);
  } catch (e) {
    copyLatexBtn.textContent = "Copy failed";
    setTimeout(() => {
      copyLatexBtn.textContent = "Copy LaTeX source";
    }, 1500);
  }
});

editorEl.addEventListener("paste", handlePaste);

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    drawBrackets();
    if (Latex) Latex.drawPreviewBrackets(latexPreviewEl, INDENT);
  }, 80);
});

render();