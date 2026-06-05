import type { PluginInput } from "@opencode-ai/plugin"

import type { TestRunnerResult } from "../tools/test-runner/types"

/**
 * test-result-capture Hook
 *
 * Captures test_runner tool output, extracts structured failure information,
 * and appends TDD guidance to help the agent continue the fix loop.
 *
 * Signal detection:
 * - Test failure → guidance to run failure-analysis skill
 * - AC coverage gap → guidance to run test-generation skill
 * - Requirement signal → guidance to run requirement-diagnosis skill
 */
export function createTestResultCaptureHook(_ctx: PluginInput) {
  return {
    "tool.execute.after": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { title: string; output: string; metadata: unknown }
    ) => {
      if (input.tool.toLowerCase() !== "test_runner") return
      if (typeof output.output !== "string") return

      try {
        const result: TestRunnerResult = JSON.parse(output.output)
        const guidance = buildTestResultGuidance(result)
        if (guidance) {
          output.output += `\n\n---\n${guidance}`
        }
      } catch {
        // Not valid JSON, skip
      }
    },
  }
}

function buildTestResultGuidance(result: TestRunnerResult): string | null {
  const parts: string[] = []

  if (result.status === "fail" && result.failed > 0) {
    parts.push("## Test Failures Detected")
    parts.push(`**${result.failed}/${result.total}** tests failed.`)
    parts.push("")
    parts.push("### Failure Summary")
    for (const failure of result.failures.slice(0, 5)) {
      const acRef = failure.ac_id ? ` [${failure.ac_id}]` : ""
      const sourceRef = failure.related_source ? ` → ${failure.related_source}` : ""
      parts.push(`- **${failure.test_name}**${acRef}: ${failure.error_type}: ${failure.error_message}${sourceRef}`)
    }
    if (result.failures.length > 5) {
      parts.push(`- ... and ${result.failures.length - 5} more failures`)
    }
    parts.push("")
    parts.push("> **Next step**: Use the `failure-analysis` skill to identify root causes with evidence-based analysis.")
  }

  if (result.status === "error") {
    parts.push("## Test Execution Error")
    if (result.failures.length > 0) {
      const err = result.failures[0]!
      parts.push(`**${err.error_type}**: ${err.error_message}`)
    } else {
      parts.push("Test execution encountered an internal error.")
    }
    parts.push("")
    parts.push("> Check the test configuration and framework detection.")
  }

  if (result.ac_coverage) {
    const uncovered = result.ac_coverage.filter((ac: { status: string }) => ac.status === "uncovered")
    if (uncovered.length > 0) {
      parts.push("## AC Coverage Gaps")
      parts.push(`**${uncovered.length}** acceptance criteria have no covering tests:`)
      for (const ac of uncovered as Array<{ ac_id: string; status: string }>) {
        parts.push(`- **${ac.ac_id}**: no tests found`)
      }
      parts.push("")
      parts.push("> **Next step**: Use the `test-generation` skill to generate tests for uncovered acceptance criteria.")
    }

    const covered = result.ac_coverage.filter((ac: { status: string }) => ac.status === "covered")
    if (covered.length > 0 && uncovered.length === 0) {
      parts.push("## AC Coverage: All Covered")
      parts.push(`All **${covered.length}** acceptance criteria have covering tests.`)
    }
  }

  return parts.length > 0 ? parts.join("\n") : null
}
