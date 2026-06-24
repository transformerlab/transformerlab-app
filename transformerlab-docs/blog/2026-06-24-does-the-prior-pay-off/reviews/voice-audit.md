# b5 — Claim + voice audit (merged, 2 auditors). Gate: PASS after fixes.

## Numbers (auditor 1): 41 checked, 0 unsupported, 0 inconsistent after fixes.

- Every prose number and both diagrams' constants trace to evidence.md (E1,E6-E9,E12,E14-E22,E24,E25,E29,E30).
- needs-hedge applied: annealing "best variants within ~1k" -> "high scores by ~1k and the single best by ~5k"; Spearman "0-to-1 scale" -> "0.04, where 1.0 is perfect and 0 is none".
- must-fix applied: WinByBudgetDiagram verdict() gate (was 5%) showed 3k as "tie" while prose/ledger say +2%; lowered to 1.5% so 3k renders "RL ahead by 2%", 5k/20k stay "tie", 100 stays "behind".
- Paper-status check PASS: post links the paper and says code "available on request"; no "published/released" claim.

## Voice (auditor 2): 4 hard-ban must-fixes fixed, plus should-fixes.

- HARD BANS removed: dek "for a surprising reason" (manufactured suspense); summary "The twist is that" (suspense); summary "not by knowing more, but by..." (negation-then-correction); "Here is the part we did not expect" (suspense).
- should-fixes applied: split run-ons; glossed "prior"; de-metaphored headers ("A fair fight"->"How we set up the comparison"; "Why you would care"->"Cheaper search saves real lab time and money"); removed duplicate "fashionable"; removed "This is the headline:" scaffold; "a fight nobody can rig"->"a test that cannot be gamed".
- Confirmed: no em dashes, no decorative emoji, terms glossed on first use, "what didn't work" + "where this does not hold" both kept and positively framed.

Note: b6 reviewer panel streamlined to this 2-auditor b5 pass; the underlying result was already adversarially reviewed in the paper pipeline (p5 claim audit + p6 R1/R2/R3). Recorded for transparency.
