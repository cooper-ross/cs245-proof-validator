# CS245 Proof Validator

<img width="1869" height="1336" alt="image" src="https://github.com/user-attachments/assets/1b6cf640-b5a1-4031-a0cd-dae655951522" />


A browser-based proof editor and validator for the propositional natural deduction system from the [CS245E](https://cs.uwaterloo.ca/~eblais/cs245e/f25/pl-formalproofs) lecture notes by Eric Blais at the University of Waterloo. Either paste in a proof, or enter it manually, and then click to validate it. The checker verifies the proof you give it syntactically, so if it passes your proof is correct! 

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

Variables are single letters (`p`, `q`, …). Parentheses are optional around binary connectives (e.g. both `p ∧ q` and `(p ∧ q)` work).

## Rules

Supported rules: `PR`, `AS`, `R`, `∧I` `∧E`, `∨I` `∨E`, `¬I` `¬E`, `→I` `→E`, `↔I` `↔E`, `⊥E`, `RAA`.

Citations go in the rule field after the rule name, e.g. `→E 1, 3` or `→I 3-5` (subproof ranges use a hyphen). Premises are inferred from `PR` lines, and the conclusion is taken from the last line.

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
