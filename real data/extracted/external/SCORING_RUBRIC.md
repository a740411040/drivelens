# RCA External Assessment Rubric v1

This set is for assessing a person's RCA work, not for replaying the production
RCA service.  A submission is one `answer.json` per case.  Grade concepts,
causal direction, evidence references, and uncertainty; do not grade against
the wording of the private source comments.

## 100-point score

| Stage | Points | What must be demonstrated |
| --- | ---: | --- |
| Issue focus | 10 | Correct domain, phenomenon, target roles, and required capability. Must-have focus recall is 100%. |
| Data/evidence assessment | 15 | Relevant logical topics, missing/invalid data, source integrity, and explicit evidence boundary. |
| Time/entity alignment | 10 | Correct anchor, critical window, target alias/ID continuity, and handover sequence. |
| Measurements and physics | 15 | Correct fields, units, formula, threshold, direction, and measurement-vs-control separation. |
| Evaluator/mechanism | 10 | Appropriate mechanism/evaluator, status, evidence relation, and no generic evaluator substitution. |
| Causal graph/responsibility | 20 | Required causal edges, alternatives, counter-evidence, exclusions, and responsibility-domain boundary. |
| Terminal/uncertainty decision | 10 | Correct `epistemic_state`, publication terminal class, confidence, and honest stop behavior. |
| External report | 10 | Concise conclusion, evidence, boundary, next action, and no new facts or identities. |

## Exactness and tolerance

- Domain, terminal class, responsibility domain, target roles, and threshold
  verdicts use exact controlled values.
- Frame anchors are exact.  Time-only anchors allow the larger of one source
  sample period or 50 ms.  A video anchor allows plus or minus one frame.
- A reported window must contain every critical anchor and have IoU >= 0.70;
  unnecessary expansion is capped per case.
- Target identity and handover order must match the gold alias sequence.
- Numeric metrics use the per-metric absolute/relative tolerance configured by
  the assessor.  Discrete flags and counts are exact.
- Curves are evaluated by extrema, delta, delay, ordering, and event co-window,
  not by raw serialized curve hashes.
- Equivalent causal graphs may be accepted when the required edges are all
  present and forbidden edges are absent.

## Hard redlines

Any one of these is a case failure regardless of the numeric score:

1. Invented signal, value, target, window, or evidence reference.
2. Wrong target binding or causal direction.
3. Attribution on `insufficient_evidence`, `data_integrity_conflict`, or
   `symptom_refuted` without new admissible evidence.
4. Treating a historical reviewer comment as decoded evidence.
5. Exposing a person, URL, credential, host path, VIN, or source identifier.

## Private-gold boundary

The gold files are source-derived adjudication from the v19 corpus.  The source
dataset reported `independent_gold=not_reviewed` for these rows, so this bundle
does not claim independent human gold.  The private gold records accepted
concepts, causal edges, forbidden claims, and the evidence boundary.  An
independent reviewer should adjudicate before using the scores for promotion.
