# Domain Docs

## Before exploring

Read `GLOSSARY.md` at the repository root and the ADRs in `docs/adr/`
relevant to the area being explored.

If these files are absent, proceed silently. The domain-modeling skill
creates them when terms or decisions are resolved.

## Layout

This is a single-context repository:
- `GLOSSARY.md`: shared domain vocabulary.
- `docs/adr/`: architectural decisions.

## Vocabulary

Use glossary terms in issue titles, proposals, hypotheses, and tests.
Respect each term's listed synonyms to avoid.

If a needed concept is missing, reconsider whether it belongs to the
domain; note genuine gaps for domain-modeling.

## ADR conflicts

Explicitly identify proposals that contradict an existing ADR, citing
the ADR and explaining why the decision merits reconsideration.
