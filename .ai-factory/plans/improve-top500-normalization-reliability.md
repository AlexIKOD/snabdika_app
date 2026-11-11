# Исторический план — заменён агентным процессом

> Этот план описывает удалённый программный нормализатор и не должен исполняться. См. `NORMALIZATION_AGENT_RUNBOOK.md` и `.agents/skills/product-naming-ru/SKILL.md`.

# Implementation Plan: Restore Top-500 normalization reliability and agent discipline

Branch: none (the workspace is not a Git repository)
Created: 2026-09-24

## Original Request
выясни причину ошибок и нодочетов при нормализации,Ю улучши поведение агента и так далее, выясни всчем произошел сбой.

## Settings
- Testing: yes
- Logging: verbose
- Docs: yes

## Root Cause Summary

The failure was not caused by one bad regular expression. It was a control-flow and release-integrity failure:

1. The audited release `database/moysklad_top/top500_normalized.*` was produced by `prototype/normalize_all_top500.py`, while `prototype/moysklad_top_pipeline.py` imports a different engine, `prototype/normalize_smart.py`. Hand-curated batches and `prototype/normalize_engine.py` form additional divergent implementations. Correct results from earlier batches were therefore overwritten by a separate monolith.
2. The monolith classifies by the first broad substring match anywhere in the input. It does not reliably identify the head product noun or exclude prepositional/context groups. This directly explains `круглый -> Круг отрезной`, `для ГКЛ -> Лист гипсокартонный`, `для баллонов -> Баллон газовый`, and similar cross-domain substitutions.
3. Classification, attribute extraction, enrichment, rendering, deduplication, and publication are mixed in one `if/elif` chain. Hard-coded defaults add unverified dimensions, materials, standards, series, and product variants in violation of Zero-Decoration.
4. Destructive text operations (`strip_subject`, the four-token stem deduplicator, and conflicting SDS replacements) remove valid facts, leave dangling prepositions, join tokens, and miss distant or short-token duplicates.
5. The declared quality contract is not executable. `audit_top500_qa.py` checks mainly typography and does not fail the process; `audit_strict_qa.py` covers a small list of old examples and uses a 45% loss threshold although the rules require 60%. The current defective parquet therefore reports zero strict errors.
6. Files are written before validation and are not promoted atomically. A locked Excel file creates a second `_final.xlsx`, so Parquet, JSON, XLSX, and Markdown may represent different runs.
7. Files named `test_*.py` only print examples. The verified command returned `no tests ran`, so there was no regression barrier despite the prior plan declaring the work complete.

## Requirements Reconciliation

Authority: the independent Ox Alpha audit is the defect oracle; `product-naming-ru-SKILL.md`, `.agents/skills/product-naming-ru/SKILL.md`, and `.ai-factory/rules/product_naming_rules.md` define normative behavior; the raw inventory is the fact source; exact SKU/manufacturer evidence may add facts only when stored as provenance. Existing plans and generated reports are status descriptions, not behavioral authority.

| Decision / supported combination | Source path and section | Verification evidence |
|----------------------------------|-------------------------|-----------------------|
| A term in a prepositional or dependent group must not override the leading product subject (`Клей для ... ГКЛ`, `Горелка для ... баллонов`, `Нож ... с лезвием`). | `product-naming-ru-SKILL.md` — Grammar Isolation; Ox Alpha audit | Parameterized cases assert the expected domain/type and forbidden prefixes. |
| Morphological variants such as `круглый` must not satisfy a product rule for `круг отрезной`; type rules require explicit whole-token or phrase evidence. | `.ai-factory/rules/product_naming_rules.md` — word boundaries; `prototype/normalize_all_top500.py:409` | Negative-candidate tests for cables and tubs plus positive tests for actual cutting discs. |
| Raw-only mode may reorder and canonicalize confirmed facts but may not add absent material, dimensions, model, series, voltage, standard, or product variant. | `product-naming-ru-SKILL.md` — Zero-Decoration; Ox Alpha audit | A normalized-token provenance diff produces zero unproven additions. |
| Evidence-enriched mode may add a fact only after an exact SKU/article match, with source URL, extracted value, and rule/run version persisted. | `product-naming-ru-SKILL.md` — anti-hallucination; audit criticism of fake `web_sources` | Tests cover exact evidence, absent evidence, ambiguous evidence, and stale/mismatched evidence. |
| Missing information sets `needs_review=true`; it never permits semantic corruption or bypasses a critical gate. | `product-naming-ru-SKILL.md` — `needs_review`; current 314/500 review rows | Gate tests prove a corrupt `needs_review` row still fails while a conservative incomplete row passes with a reason. |
| Duplicate source names are allowed, but every source identity is preserved and equivalent inputs are deterministic. Rank gaps, duplicate release identities, schema drift, or batch overlap are fatal. | Real `top_selling_inventory.parquet`; Ox Alpha note about duplicated raw rows | End-to-end test validates 500 rows, identity uniqueness, deterministic duplicate outputs, and manifest hashes. |
| Publication requires zero critical/error findings and identical run metadata across Parquet, JSON, XLSX, and comparison Markdown. | `.ai-factory/rules/product_naming_rules.md` — blocking Quality Gate | A staged release is promoted only after tests, semantic audit, and round-trip consistency checks pass. |
| The existing `.ai-factory/PLAN.md` claim of completed refactoring and zero-error QA conflicts with the current artifact and test evidence; it must not be used as proof of completion. | `.ai-factory/PLAN.md`; current audit and `pytest` runs | Documentation status is regenerated from actual gate outputs and cannot mark success on a failed run. |

## Target Design

Use one importable normalization package with an explicit pipeline:

`parse source facts -> detect head subject -> classify with positive/negative evidence -> extract attributes -> optionally enrich from exact evidence -> render names -> validate conservation/provenance -> stage -> publish`

The canonical result keeps the existing consumer fields and adds traceability fields such as engine/rules version, matched rule IDs, source-fact evidence, enrichment evidence, QA status, and run ID. `working_name` and `print_name` are rendered from the same structured facts; they are not independently rewritten strings.

## Commit Plan

- **Commit 1** (after tasks 1-2): `test(normalization): codify audit contract and regression corpus`
- **Commit 2** (after tasks 3-5): `refactor(normalization): introduce canonical evidence-preserving engine`
- **Commit 3** (after tasks 6-7): `feat(qa): block invalid normalization releases`
- **Commit 4** (after tasks 8-9): `fix(catalog): migrate consumers and publish verified top500 artifacts`

Note: the workspace currently has no Git metadata; use these checkpoints after the repository is initialized or when changes are transferred into the owning repository.

## Tasks

### Phase 1: Make the contract executable

- [x] **Task 1: Define the canonical result/evidence contract and align agent instructions.**
  - Update `product-naming-ru-SKILL.md`, `.agents/skills/product-naming-ru/SKILL.md`, and `.ai-factory/rules/product_naming_rules.md` so the agent must: determine the head subject before category matching; ignore prepositional/dependent groups for subject selection; use whole-token/phrase rules; distinguish raw-only from evidence-enriched mode; attach provenance to every added fact; set `needs_review` for uncertainty; run `stage -> gate -> publish`; and never describe a run as successful before promotion.
  - Create a canonical schema/model in `prototype/normalization/models.py` for source facts, classification evidence, extracted attributes, enrichment evidence, normalized output, review reasons, QA findings, and run metadata. Preserve current output columns for downstream compatibility and add versioned traceability columns without silently changing their meaning.
  - Make one skill copy canonical and add a drift check for the second copy so future edits cannot diverge unnoticed.
  - Requirement anchors: Zero-Decoration, Grammar Isolation, `needs_review`, and the independent audit.
  - **Logging:** DEBUG for rule/evidence resolution, INFO for schema/rules versions selected, WARN for missing or ambiguous evidence, ERROR for contract violations; redact credentials and keep verbosity controlled by `LOG_LEVEL`.

- [x] **Task 2: Turn the Ox Alpha audit into a failing regression corpus before changing behavior.** (depends on Task 1)
  - Create `prototype/tests/fixtures/ox_alpha_regressions.json` from the supplied audit and representative rows in `TOP500_NORMALIZED_COMPARISON.md`. Each record must contain `raw_name`, expected domain/type or allowed type set, required preserved tokens, forbidden prefixes/tokens, allowed enrichment mode, and expected review behavior.
  - Create real pytest modules under `prototype/tests/`: `test_ox_alpha_regressions.py`, `test_subject_classification.py`, `test_information_preservation.py`, `test_syntax_qa.py`, and `test_deduplication.py`.
  - Include positive and negative pairs for discs vs `круглый`, sheet GKL vs glue/tape/screws for GKL, cable vs electrical accessories, cylinder vs burner, direct vs Nonius suspension, knife vs blade, PN/PS/PP/PPN profiles, perforated tape, hot-rolled angle, toilet corrugation, repere beacon, and every syntax/deduplication issue listed in the audit.
  - First record the current expected failures; do not weaken assertions or bless current output.
  - **Logging:** pytest failure messages must show raw input, matched rule, normalized output, lost facts, unproven facts, and the violated audit case ID; INFO logs summarize cases by defect family, DEBUG logs show token/evidence normalization.

### Phase 2: Replace substring reconstruction with one evidence-preserving engine

- [x] **Task 3: Introduce a single canonical engine and isolate the transformation stages.** (depends on Tasks 1-2)
  - Create `prototype/normalization/engine.py`, `preprocess.py`, `facts.py`, `classifier.py`, `render.py`, and `rules.py`. Keep preprocessing non-destructive: normalize Unicode confusables, dimensions, decimal separators, and unit spacing while retaining an offset/fact map back to the source.
  - Replace the monolithic first-match chain with scored declarative rules containing positive subject evidence, negative context evidence, allowed domains, and stable rule IDs. Resolve ambiguity conservatively to the source head noun or `needs_review`, never to a guessed cross-domain type.
  - Separate rule matching from rendering so classification cannot inject default attributes.
  - Add deterministic cache keys using all source identity/fact inputs rather than only `raw_name`.
  - **Logging:** DEBUG logs candidate rules, scores, exclusions, selected rule ID, and cache decisions; INFO logs per-run engine/rules versions and classification totals; WARN logs ambiguous/no-match rows; ERROR logs impossible state or schema violations.

- [x] **Task 4: Implement head-subject and context-aware classification for the audited domains.** (depends on Task 3)
  - Detect the leading noun phrase/head product and label parenthetical, prepositional (`для`, `по`, `с`, `к`, `под`) and attribute contexts before type matching.
  - Add explicit rules and exclusions for the audited cases: cable form `круглый`; actual cutting discs; Perlfix/glue for GKL/PGP/GVL; plugs, lamps, sockets, and blocks as electrical accessories; gas burner vs cylinder; perforated tape; aluminium sheet; hot-rolled angle; toilet corrugation; repere beacon; upper/lower Nonius suspension; direct suspension; standing/directing/ceiling profiles; knife vs blades.
  - Validate profile language against dimensions only as a consistency check; never let dimensions silently override an explicit `стоечный`/`направляющий` source term.
  - Unknown or conflicting cases retain confirmed source facts and become `needs_review`; they do not fall through to a generic unrelated type.
  - **Logging:** DEBUG logs head-subject spans and ignored context spans; INFO logs per-domain counts; WARN logs contradictions and ambiguous subtype/dimension combinations; ERROR logs cross-domain invariant violations.

- [x] **Task 5: Render only proven facts and replace destructive stripping/deduplication.** (depends on Tasks 3-4)
  - Implement structured extractors for dimensions, units, quantities, brands, series, models, standards, materials, thread types, negations, and packaging. Preserve every normalized numeric/technical fact from the source unless a documented canonical equivalence exists.
  - Remove hard-coded fallbacks such as `PX`, `Rautitan`, `подключичная`, `армированная 110мм`, `16А 250В`, A500C/GOST, default dimensions/weights/colors/materials, and default product forms when they are absent from source/evidence.
  - Replace `strip_subject()` and stem-window deletion with phrase-aware rendering from structured fields. Deduplicate repeated phrases/brands/series globally without deleting necessary governing words or short/digit-bearing identifiers (`ПП`, `ППН`, `FFP2`, `A500С`, `StP`).
  - Add final syntax normalization for empty parentheses, dangling prepositions, `к до`, isolated punctuation, `SDS-plus` spacing, parenthesis-number spacing, extra hyphens, and mixed-script brand confusables.
  - **Logging:** DEBUG logs extracted facts and render decisions, including each removed duplicate with a rule ID; WARN logs preserved but suspicious/conflicting source text; ERROR logs fact loss or any rendered token lacking provenance.

### Phase 3: Build a blocking semantic gate and safe release pipeline

- [x] **Task 6: Implement a shared semantic/conservation QA module and strict CLI.** (depends on Tasks 4-5)
  - Create `prototype/normalization/qa.py` and make `prototype/audit_strict_qa.py` a thin CLI accepting an artifact path and returning exit code 1 for any critical/error finding.
  - Validate both names and structured fields: schema/completeness; head type/domain compatibility; zero unproven facts; preservation of numbers, units, models, series, brands, standards, thread types, colors, materials, and negations; contradictory attributes; empty parentheses; dangling prepositions; glued tokens; mixed-script confusables; distant/short-token duplication; generic types; and source identity integrity.
  - Enforce the declared 60% loss heuristic only as a secondary warning/error signal; semantic fact conservation is authoritative. `needs_review` cannot suppress critical findings.
  - Replace or retire duplicated checks in `audit_top500_qa.py`, `test_qa_audit.py`, `test_batch_1_qa.py`, and `verify_top.py` so all entry points call the same validator and propagate its exit status.
  - **Logging:** emit machine-readable finding codes and JSON/console summaries; DEBUG includes normalized fact diffs, INFO includes severity totals, WARN reports review-baseline drift, ERROR lists critical rows and prevents promotion.

- [x] **Task 7: Make batch merge and publication deterministic, versioned, and atomic.** (depends on Tasks 3 and 6)
  - Refactor `prototype/normalize_all_top500.py`, `prototype/moysklad_top_pipeline.py`, `prototype/merge_progress.py`, and export helpers to write a versioned staging directory first.
  - Generate a manifest containing source hash, engine/rules/schema versions, run ID, row/rank range, counts, identity keys, artifact hashes, review counts, and gate results. Fail on batch overlaps/gaps, duplicate release identities, missing ranks, schema mismatch, source drift, or non-deterministic duplicate results.
  - Run pytest regression tests, the full semantic gate, and Parquet/JSON/XLSX round-trip checks before atomically promoting all canonical outputs. If Excel is locked or any format differs, keep the previous release untouched; do not create an ambiguous canonical `_final` alternative.
  - Generate `TOP500_NORMALIZED_COMPARISON.md` only from the promoted manifest/artifact, and describe only the engine/rules actually used.
  - **Logging:** INFO logs run IDs, hashes, stage/promote boundaries and artifact paths; DEBUG logs batch identity validation and round-trip comparisons; WARN logs non-blocking review drift; ERROR logs gate/promotion failures with rollback state.

### Phase 4: Remove engine drift, prove the fix, and publish the corrected dataset

- [x] **Task 8: Migrate every normalization consumer to the canonical engine and quarantine legacy implementations.** (depends on Tasks 3-7)
  - Make `prototype/normalize_all_top500.py`, `prototype/moysklad_top_pipeline.py`, and `prototype/import_unified_catalog.py` import the same engine/rules/QA package. Convert legacy functions into explicit compatibility adapters or remove them after call-site verification.
  - Reconcile manual `normalize_batch_1.py` / `normalize_batch_2.py` data with the regression fixture; do not treat hard-coded rows or `web_sources` labels as evidence. Stop legacy or abandoned modules from writing canonical files.
  - Add a test that enumerates canonical output writers and fails if more than one un-gated writer exists.
  - **Logging:** INFO logs adapter use and deprecation status; WARN logs legacy entry-point invocation; ERROR logs any attempt by a noncanonical engine to publish a release; DEBUG logs consumer-to-engine version mapping.

- [x] **Task 9: Re-run the real Top-500 through the gated path and update project documentation from verified state.** (depends on Tasks 2-8)
  - Execute the canonical engine against `database/moysklad_top/top_selling_inventory.parquet`, require exactly 500 source identities, zero critical/error findings, and deterministic results for duplicated raw names.
  - Publish synchronized `top500_normalized.parquet`, `.json`, `.xlsx`, the comparison Markdown, and the manifest only after all gates pass. Preserve the failed/current artifact as a versioned diagnostic input rather than silently overwriting it during development.
  - Run `python -m pytest -q prototype/tests` and `python prototype/audit_strict_qa.py database/moysklad_top/top500_normalized.parquet`; verify the current Ox Alpha corpus has zero regressions and the validator itself rejects seeded bad outputs.
  - Route the documentation checkpoint through `$aif-docs`: correct the stale completion claims in `PLAN.md` / `.ai-factory/PLAN.md`, document the single supported pipeline, evidence modes, review semantics, gate commands, release manifest, and rollback/recovery procedure.
  - **Logging:** INFO records the final run ID, source/output hashes, test counts, gate counts, review baseline, and promoted paths; DEBUG stores per-rule statistics outside user-facing names; WARN records unresolved conservative reviews; ERROR blocks publication on any mismatch.

## Acceptance Gates

- `python -m pytest -q prototype/tests` collects real tests and passes; the suite includes validator mutation tests proving seeded bad outputs fail.
- `python prototype/audit_strict_qa.py database/moysklad_top/top500_normalized.parquet` exits 0 only with zero critical/error findings.
- Every Ox Alpha audit case has a stable regression ID and passes both classification and fact-provenance assertions.
- The final release has exactly 500 source identities, no rank gaps, no invalid duplicates, one schema/engine/rules version, and matching hashes/run ID across all formats.
- No normalized technical fact is absent from the raw source unless exact stored SKU/manufacturer evidence supports it; absent or ambiguous evidence results in conservative output plus `needs_review=true`.
- No legacy engine or standalone batch script can overwrite canonical artifacts without the shared gate and atomic promotion path.
- Project documentation no longer claims completion from a print-only script or a surface-only QA pass.
