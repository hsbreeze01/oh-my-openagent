---
name: prd-to-acceptance
description: "Parse a PRD into structured acceptance criteria (AC). Produces a numbered AC list with testable assertions, edge cases, and done-definition for each feature. Triggers: 'generate AC', 'acceptance criteria', 'prd-to-acceptance', when a PRD is submitted to the TDD pipeline, or when the TDD orchestrator invokes Phase 1."
---

# PRD to Acceptance Criteria

You are converting a Product Requirements Document (PRD) into a structured, testable acceptance criteria list. Each criterion must be unambiguous enough that a test can be written directly from it.

<architecture>

```
Input:  Raw PRD (markdown)
Output: acceptance-criteria.md in project root
Next:   test-generation skill consumes the AC file
```

</architecture>

---

## Phase 1: Parse PRD Structure

Read the PRD and identify:
1. **Core features** — each distinct capability
2. **Non-functional requirements** — performance, compatibility, accessibility
3. **Technical constraints** — framework, dependencies, architecture decisions
4. **Explicit acceptance criteria** — if PRD already lists them, preserve and refine

---

## Phase 2: Generate Acceptance Criteria

For each feature, produce criteria in this format:

```markdown
## AC-{N}: {Feature Name}

### Given / When / Then
- **Given** {precondition}
- **When** {action}
- **Then** {expected outcome}

### Edge Cases
- {edge case 1}
- {edge case 2}

### Done When
- [ ] {testable assertion}
- [ ] {testable assertion}
```

### Rules
- Each AC must be **independently testable** — no criterion should depend on another passing first
- Use concrete values where possible (`sin(90°) = 1`, not "trigonometric functions work")
- Include boundary conditions (empty input, max values, overflow)
- Non-functional requirements become their own ACs (e.g., "response time < 50ms for expressions up to 100 characters")

---

## Phase 3: Write Output

Write the complete AC list to `acceptance-criteria.md` in the project working directory:

```bash
# Write to project root
cat > acceptance-criteria.md << 'EOF'
# Acceptance Criteria
... generated content ...
EOF
```

After writing, report:
```
✅ AC Generated: {N} acceptance criteria from {M} features
📄 File: acceptance-criteria.md
➡️ Next: test-generation
```

---

## Anti-Patterns

| Violation | Why it fails |
|-----------|-------------|
| Vague criteria ("app works correctly") | Cannot write a deterministic test |
| Criteria that test implementation details | Brittle tests that break on refactor |
| Missing edge cases | Bugs ship in boundary conditions |
| Skipping non-functional requirements | Performance/accessibility regressions |
