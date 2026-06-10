---
name: tdd-verification
description: "Verify TDD cycle completion: all tests pass, coverage is adequate, acceptance criteria are met, and no regressions. If verification fails, loops back to tdd-implementation. Triggers: 'verify tdd', 'tdd-verification', 'check if done', when TDD orchestrator invokes Phase 4 after implementation."
---

# TDD Verification

You are the final gate of the TDD cycle. Verify that implementation satisfies all acceptance criteria, tests pass, and quality standards are met. If verification fails, trigger a fix loop back to implementation.

<architecture>

```
Input:  Implementation + tests + acceptance-criteria.md
Gates:  1. All tests pass
        2. AC coverage check (every AC has ≥1 passing test)
        3. No obvious regressions or missing edge cases
Output: PASS → report completion
        FAIL → loop back to tdd-implementation with specific failures
```

</architecture>

---

## Gate 1: Test Execution

Run the full test suite:

```bash
bun test 2>&1
```

**PASS condition**: zero test failures.

**On failure**: Report which tests fail and loop back:
```
🔴 Verification FAILED: {N} tests failing
Failures:
- {test file}: {test name} — {error}
➡️ Looping back to tdd-implementation
```

---

## Gate 2: AC Coverage

Cross-reference `acceptance-criteria.md` with test files:

1. Read each AC's "Done When" items
2. Verify each item has a corresponding test that exercises it
3. Flag any AC with zero test coverage

```bash
# List all test descriptions
bun test --reporter=verbose 2>&1 | grep -E "^  (✓|✗|○)"
```

Compare against AC items. If an AC has no corresponding test:
```
⚠️ AC-{N} "{title}" has no test coverage
➡️ Looping back to test-generation for missing coverage
```

---

## Gate 3: Regression & Quality Check

Quick sanity checks:
- **No hardcoded test values in implementation** (implementation should compute, not return constants)
- **No disabled/skipped tests** (`it.skip`, `xit`, `xdescribe`)
- **Build succeeds** (if applicable):

```bash
# TypeScript check
bun run typecheck 2>/dev/null || npx tsc --noEmit 2>/dev/null
```

---

## Verification PASSED

When all gates pass, emit these EXACT keywords (Dashboard stage detection depends on them):

```
✅ TDD Verification Complete — closed-loop verified
📊 Results:
  - Tests: {N} passing, 0 failing — all tests pass
  - AC Coverage: {M}/{M} criteria verified
  - Build: clean
🏁 Status: DONE — task complete, process finished
```

---

## Verification FAILED (Loop Back)

When any gate fails, construct a specific remediation prompt:

```
🔴 TDD Verification Failed

## Failures
{list specific failures with file:line references}

## Required Fixes
{what needs to change}

➡️ Invoking tdd-implementation to fix
```

The loop continues until verification passes. There is no iteration cap — keep fixing until green.

---

## Anti-Patterns

| Violation | Why it fails |
|-----------|-------------|
| Passing verification with skipped tests | False green — untested code ships |
| Ignoring AC items without test coverage | Feature gaps escape to production |
| Accepting "close enough" on assertions | Precision matters in calculations |
| Looping without specific failure context | Implementation can't fix what isn't identified |
