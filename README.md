# CS245 Proof Validator

<img width="1869" height="1336" alt="image" src="https://github.com/user-attachments/assets/1b6cf640-b5a1-4031-a0cd-dae655951522" />

A browser-based proof editor and validator for the natural deduction systems from the [CS245E](https://cs.uwaterloo.ca/~eblais/cs245e/) lecture notes by Eric Blais at the University of Waterloo. Either paste in a proof, or enter it manually, and then click to validate it. The checker verifies the proof you give it syntactically, so if it passes your proof is correct!

Two proof systems are supported, switched with the toggle above the editor:

- **Propositional:** the system from [Formal Proofs](https://cs.uwaterloo.ca/~eblais/cs245e/f25/pl-formalproofs) (Lecture 5).
- **First-Order:** the extension from [Formal Proofs in First-Order Logic](https://cs.uwaterloo.ca/~eblais/cs245e/f25/fol-formalproofs) (Lecture 12), which adds predicates, quantifiers, and identity on top of all the propositional rules.

## Editor controls

| Action | How |
|--------|-----|
| New line | `Enter` |
| Begin subproof (assumption) | `Tab` on a line after the first |
| End subproof / dedent | `Shift+Tab` |
| Delete empty line | `Backspace` on an empty formula field |
| Move between lines | `↑` / `↓` in a formula field |

Each row has a formula field and a rule field. The first line’s rule is typically `PR` (premise). Starting a subproof sets the rule to `AS` automatically.

## Formulas

You can type ASCII shortcuts; they expand as you type:

| Input | Symbol |
|-------|--------|
| `->` `=>` `\to` `\rightarrow` | → |
| `<->` `\leftrightarrow` | ↔ |
| `&` `\land` | ∧ |
| `\|` `\lor` | ∨ |
| `~` `!` `\lnot` | ¬ |
| `\bot` | ⊥ |
| `\forall` | ∀ |
| `\exists` | ∃ |
| `\leq` `\geq` `\neq` | ≤ ≥ ≠ |
| `\phi` `\psi` `\chi` `\theta` | φ ψ χ θ |
| `\times` `·` (lone `*`) | × |

Propositional variables are lowercase (`p`, `q`, …). Parentheses are optional around binary connectives (e.g. both `p ∧ q` and `(p ∧ q)` work).

In first-order mode you can also write predicates (`P(x)`), functions (`f(a, g(b))`), infix relations (`a=b`, `x≤y`, `a≠b`), quantifiers (`∀x∀y(x=y)`, `∃x P(x)`), and subscripted names (`w₁` or `w_1`). A quantifier binds the smallest formula after it, so `∀x P(x) ∧ q` means `(∀x P(x)) ∧ q`.

Arithmetic-style terms work too: numerals are constants and `+` / `×` are infix function symbols, with `×` binding tighter than `+`. So proofs over Peano axioms like `∀x (x+0)=x` and `∀x∀y (x+S(y))=S(x+y)` check as expected. (Lone `*` becomes `×`, but `/*` is left alone so partial substitution still works.)

### Schemas, substitution, and macros

Greek letters (`φ`, `ψ`, `χ`, `θ`, … — including the fancy italic forms from the notes) are schema formulas, so schematic proofs paste and verify directly:

```
¬∀x φ ⊢ ∃x ¬φ
```

Substitution notation from the notes is supported:

| Notation | Meaning |
|----------|---------|
| `φ[x/t]` | replace every free `x` in `φ` with term `t` |
| `φ[t/*x]` | replace some instances of term `t` with `x` (used by `∃I`) |

Brackets attach tightly, so `¬φ[x/a]` is `¬(φ[x/a])`.

These course macros are kept as shorthands in the editor and LaTeX preview (toggle **Expand macros** in the preview header to see the definition). Verification always expands them, so `∀E` on `Least(a)` works:

| Macro | Expands to |
|-------|------------|
| `Least(w)` | `∀x (w ≤ x)` |
| `Greatest(w)` | `∀x (x ≤ w)` |
| `Prime(n)` / `prime(n)` | `n≠0 ∧ n≠1 ∧ ∀x∀y(x×y=n → (x=1 ∨ y=1))` |
| `Even(n)` | `∃k (n = 2×k)` |
| `Odd(n)` | `∃k (n = 2×k+1)` |

The bound variable in `Least`/`Greatest` is chosen fresh relative to the argument, so `Least(x)` becomes `∀y (x ≤ y)`.

## Rules

Supported rules: `PR`, `AS`, `R`, `∧I` `∧E`, `∨I` `∨E`, `¬I` `¬E`, `→I` `→E`, `↔I` `↔E`, `⊥E`, `RAA`.

First-order mode adds: `∀I` `∀E`, `∃I` `∃E`, `=I` `=E`. The side conditions from the notes are enforced — e.g. `∀I` and `∃E` require the generalized name / witness to be fresh (not in any premise or open assumption), and `∀E` rejects substitutions where a variable in the term would be captured by a quantifier.

Citations go in the rule field after the rule name, e.g. `→E 1, 3` or `→I 3-5` (subproof ranges use a hyphen). `∃E` cites the existential line and the subproof, e.g. `∃E 2, 3-5`. Premises are inferred from `PR` lines, and the conclusion is taken from the last line.

## Pasting proofs

You can paste a whole proof into the editor. Recognized formats right now are:

- `⎡` `⎢` `⎣` for subproof structure (including nested brackets)
- Numbered lines with leading spaces
- LaTeX `align*` blocks from this tool or similar (`\text{1.} ... && \text{PR}`)

If there's any demand, just open an issue and I'll add your format as well. (The more the merrier!) Or, if you'd like, you can just open a PR and I'll merge it.

Example (bracket style):

```
1. (p→q)        PR
2. (q→r)        PR
3. ⎡ p          AS
4. ⎢ q          →E 1, 3
5. ⎣ r          →E 2, 4
6. (p→r)        →I 3-5
```
