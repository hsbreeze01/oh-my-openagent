import { resolve } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { tool, type PluginInput, type ToolDefinition } from "@opencode-ai/plugin"
import { detectFramework, getFrameworkConfig } from "./framework-detector"
import { scanAcCoverage } from "./ac-coverage"
import type { TestRunnerResult } from "./types"

const execFileAsync = promisify(execFile)

const TEST_RUNNER_DESCRIPTION = `Run tests and return structured results with AC (acceptance criteria) coverage verification.

Supports auto-detection of test frameworks: pytest, jest, vitest, go test.
Returns structured pass/fail data with error details, stack traces, and optional AC coverage mapping.

Usage:
  test-runner({ test_path: "tests/" })  — run all tests
  test-runner({ test_path: "tests/auth", test_name: "login" })  — run matching tests
  test-runner({ test_path: "tests/", verify_coverage: true, acceptance_criteria: ["AC-001", "AC-002"] })  — run + verify AC coverage

Output includes:
  - status: pass/fail/error
  - total/passed/failed counts
  - failures[] with error_type, error_message, stack_trace, related_source, ac_id
  - ac_coverage[] (when verify_coverage=true) showing which ACs have tests`

const TEST_TIMEOUT_MS = 120_000 // 2 minutes

export function createTestRunnerTool(ctx: PluginInput): ToolDefinition {
  return tool({
    description: TEST_RUNNER_DESCRIPTION,
    args: {
      test_path: tool.schema.string().describe("Test file path or directory to run"),
      test_name: tool.schema.string().optional().describe("Specific test name or pattern to run (supports glob patterns)"),
      framework: tool.schema
        .enum(["auto", "pytest", "jest", "vitest", "go_test"])
        .optional()
        .describe("Test framework. 'auto' detects from project config."),
      working_dir: tool.schema.string().optional().describe("Working directory for test execution"),
      verify_coverage: tool.schema
        .boolean()
        .optional()
        .describe("Whether to verify AC (acceptance criteria) coverage by scanning test docstrings"),
      acceptance_criteria: tool.schema
        .array(tool.schema.string())
        .optional()
        .describe("AC ID list for coverage verification (e.g. ['AC-001', 'AC-002'])"),
    },
    async execute(args, context): Promise<string> {
      const startTime = Date.now()
      const effectiveFramework = args.framework || "auto"
      const effectiveVerifyCoverage = args.verify_coverage ?? false

      try {
        // Resolve working directory
        const runtimeCtx = context as Record<string, unknown>
        const workingDir =
          args.working_dir ??
          (typeof runtimeCtx.directory === "string" ? runtimeCtx.directory : ctx.directory)

        // Detect or use specified framework
        const framework = effectiveFramework === "auto" ? detectFramework(workingDir) : effectiveFramework

        if (framework === "unknown") {
          const result: TestRunnerResult = {
            status: "error",
            total: 0,
            passed: 0,
            failed: 0,
            duration_ms: Date.now() - startTime,
            failures: [],
            framework_detected: "unknown",
          }
          return JSON.stringify(result, null, 2)
        }

        const config = getFrameworkConfig(framework)
        const { cmd, args: cmdArgs } = config.buildCommand(
          { test_path: args.test_path, test_name: args.test_name, framework: effectiveFramework, verify_coverage: effectiveVerifyCoverage, acceptance_criteria: args.acceptance_criteria },
          workingDir,
        )

        // Execute tests
        let stdout: string
        let stderr: string
        let exitCode: number
        try {
          const result = await execFileAsync(cmd, cmdArgs, {
            cwd: workingDir,
            timeout: TEST_TIMEOUT_MS,
            maxBuffer: 10 * 1024 * 1024, // 10MB
            env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
          })
          stdout = result.stdout
          stderr = result.stderr
          exitCode = 0
        } catch (err: unknown) {
          const execErr = err as { stdout?: string; stderr?: string; code?: number; killed?: boolean }
          if (execErr.killed) {
            const result: TestRunnerResult = {
              status: "error",
              total: 0,
              passed: 0,
              failed: 0,
              duration_ms: Date.now() - startTime,
              failures: [{
                test_name: "timeout",
                file: "",
                line: 0,
                error_type: "TimeoutError",
                error_message: `Test execution timed out after ${TEST_TIMEOUT_MS / 1000}s`,
                stack_trace: "",
              }],
              framework_detected: framework,
            }
            return JSON.stringify(result, null, 2)
          }
          stdout = execErr.stdout ?? ""
          stderr = execErr.stderr ?? ""
          exitCode = execErr.code ?? 1
        }

        // Parse output
        const parsed = config.parseOutput(stdout, stderr, exitCode)

        // Build result
        const testRunnerResult: TestRunnerResult = {
          ...parsed,
          duration_ms: Date.now() - startTime,
        }

        // AC coverage verification
        if (effectiveVerifyCoverage && args.acceptance_criteria && args.acceptance_criteria.length > 0) {
          const testPath = resolve(workingDir, args.test_path)
          testRunnerResult.ac_coverage = await scanAcCoverage(testPath, args.acceptance_criteria)
        }

        return JSON.stringify(testRunnerResult, null, 2)
      } catch (err: unknown) {
        const errorResult: TestRunnerResult = {
          status: "error",
          total: 0,
          passed: 0,
          failed: 0,
          duration_ms: Date.now() - startTime,
          failures: [{
            test_name: "internal_error",
            file: "",
            line: 0,
            error_type: err instanceof Error ? err.constructor.name : "Error",
            error_message: err instanceof Error ? err.message : String(err),
            stack_trace: err instanceof Error ? err.stack ?? "" : "",
          }],
          framework_detected: "unknown",
        }
        return JSON.stringify(errorResult, null, 2)
      }
    },
  })
}
