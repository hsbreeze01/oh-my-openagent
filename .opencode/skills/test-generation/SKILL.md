---
name: test-generation
description: "Generate test files from acceptance criteria. Reads acceptance-criteria.md and produces failing test suites that define the implementation contract. Tests are written BEFORE implementation (TDD red phase). Triggers: 'generate tests', 'write tests from AC', 'test-generation', when TDD orchestrator invokes Phase 2 after AC generation."
---

# Test Generation (TDD Red Phase)

You are writing test suites from acceptance criteria. Every test MUST fail initially — this is the red phase of TDD. Tests define the contract that implementation must satisfy.

<architecture>

```
Input:  acceptance-criteria.md
Output: test files in tests/ directory (*.test.ts or *.test.js)
Next:   tdd-implementation skill implements until tests pass
```

</architecture>

---

## Phase 1: Read Acceptance Criteria

```bash
cat acceptance-criteria.md
```

Parse each AC into testable units. One AC may produce multiple test cases (happy path + edge cases).

---

## Phase 2: Determine Test Framework

Check the project for existing test infrastructure:

```bash
# Check package.json for test runner
cat package.json 2>/dev/null | grep -E "(jest|vitest|bun|mocha)"

# Check for existing test config
ls vitest.config.* jest.config.* bun.test.* 2>/dev/null
```

- If `bun` project → use `bun:test` (`import { describe, it, expect } from "bun:test"`)
- If `vitest` configured → use vitest
- If nothing → default to `bun:test` for TypeScript, native `node:test` for plain JS

---

## Phase 3: Write Test Files

Structure tests by feature area:

```
tests/
├── basic-operations.test.ts    # AC-1..AC-N for basic math
├── scientific-functions.test.ts # AC for trig, log, etc.
├── history.test.ts              # AC for history feature
└── ...
```

### Test writing rules

1. **Each AC → at least one `describe` block**
2. **Each "Done When" item → one `it()` test**
3. **Each edge case → one `it()` test**
4. **Import the module under test** — use the path that implementation WILL create (e.g., `import { evaluate } from "../src/calculator"`)
5. **Tests must be runnable** — even if they fail with "module not found", the test syntax itself must be valid
6. **Use concrete expected values** from the AC (`expect(evaluate("2+3")).toBe(5)`)

### Example output

```typescript
import { describe, it, expect } from "bun:test";
import { evaluate } from "../src/calculator";

describe("AC-1: Basic Arithmetic", () => {
  it("adds two numbers", () => {
    expect(evaluate("2+3")).toBe(5);
  });

  it("handles operator precedence", () => {
    expect(evaluate("2+3*4")).toBe(14);
  });

  it("handles nested parentheses up to 10 levels", () => {
    const expr = "((((((((((1+1))))))))))";
    expect(evaluate(expr)).toBe(2);
  });
});
```

---

## Phase 4: Verify Tests Fail

Run the test suite to confirm RED state:

```bash
bun test 2>&1 | tail -20
```

Expected: all tests fail (module not found or assertion errors). If any test passes without implementation, it's not testing anything meaningful — rewrite it.

Report:
```
✅ Tests Written: {N} test files, {M} test cases
🔴 Red Phase: all tests failing (as expected)
➡️ Next: tdd-implementation
```

---

## Anti-Patterns

| Violation | Why it fails |
|-----------|-------------|
| Tests that pass without implementation | Test is not asserting behavior |
| Testing implementation details (private methods) | Brittle, breaks on refactor |
| One giant test file | Hard to isolate failures |
| Missing edge case tests | Bugs ship in boundaries |
| Mocking the thing under test | Tests prove nothing |
