# RCA Assessment Instructions

You receive ten de-identified, real-case-derived fixtures. For each case, submit
one JSON file following `answer.schema.json`.

Your task is to establish the problem focus, assess data integrity, align the
event and entities, calculate relevant measurements, evaluate causal
hypotheses, choose the correct uncertainty/terminal state, and write a concise
external report. It is acceptable and sometimes required to stop without an
attribution when evidence is missing, conflicted, or refutes the reported
symptom.

Rules:

1. Use only evidence present in the fixture.
2. Never invent a signal, number, target, frame, path, or evidence reference.
3. Do not infer a person or team. Report a technical responsibility domain only.
4. Keep target aliases stable across measurements, windows, and hypotheses.
5. State missing evidence and a concrete next action.

The participant manifest contains no gold labels. The answer key and source
lineage are held separately by the assessor.

Every fixture is backed by decoded case metadata. `factual_check_observations`
are de-identified derived observations, not causal conclusions; reconcile them
with the issue focus, counter-evidence, alignment quality, and missing raw data.
Raw MCAP and attachment bodies are intentionally not distributed.
