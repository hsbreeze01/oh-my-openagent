---
name: tdd-implementation
description: "Implement code to make failing tests pass (TDD green phase). Reads test files, implements the minimum code to satisfy each test, runs tests iteratively until all green. Triggers: 'implement to pass tests', 'tdd-implementation', 'green phase', when TDD orchestrator invokes Phase 3 after test generation."
---

# TDD Implementation (Green Phase)

You are implementing the minimum code to make all failing tests pass. Do NOT over-engineer. Write the simplest implementation that satisfies the test assertions. Refactoring comes after green.

<architecture>

```
Input:  Failing test files in tests/
Output: Implementation files in src/ (or project-appropriate location)
Loop:   Implement → Run tests → Fix failures → Repeat until all green
Next:   tdd-verification skill validates the full cycle
```

</architecture>

---

## Phase 1: Understand the Contract

Read all test files to understand what's expected:

```bash
find tests/ -name "*.test.*" -exec cat {} \;
```

Extract:
- Module paths being imported (these are the files you must create)
- Function signatures being called
- Expected return values and types

---

## Phase 2: Implement Incrementally

### Strategy: one test file at a time

1. Pick the test file with the most fundamental tests (usually basic operations)
2. Create the imported module with the required exports
3. Implement until that file's tests pass
4. Move to the next test file

### Implementation rules

- **Minimum viable code** — pass the test, nothing more
- **No premature abstraction** — if 3 tests need the same thing, a simple function is fine; don't build a framework
- **Match the import paths** — tests dictate where files live
- **Type safety** — if TypeScript, ensure types are correct (no `any` escape hatches)

---

## Phase 3: Iterative Test Loop

After each implementation chunk, run tests:

```bash
bun test
```

### On failure

Read the failure output carefully:
- **Module not found** → create the missing file/export
- **Assertion error** → fix the logic
- **Type error** → fix the type signature

Fix one failure at a time. Do not attempt to fix all failures simultaneously.

### Convergence check

```bash
# Track progress
TOTAL=$(bun test 2>&1 | grep -oP '\d+ pass' | grep -oP '\d+')
FAILED=$(bun test 2>&1 | grep -oP '\d+ fail' | grep -oP '\d+')
echo "Progress: $TOTAL pass, $FAILED fail"
```

---

## Phase 4: All Green

When `bun test` reports all tests passing:

```
✅ Implementation Complete: {N} tests passing
🟢 Green Phase: all tests green
📁 Files created: {list of src/ files}
➡️ Next: tdd-verification
```

---

## Anti-Patterns

| Violation | Why it fails |
|-----------|-------------|
| Implementing features not covered by tests | Untested code is unverified code |
| Over-engineering before green | Wastes time; refactor AFTER green |
| Using `eval()` or unsafe shortcuts | Security and correctness issues |
| Ignoring type errors | Type errors are test failures |
| Modifying test files to make them pass | Tests are the contract, not the implementation |
