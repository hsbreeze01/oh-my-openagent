import { existsSync } from "node:fs"
import { join } from "node:path"
import type { DetectedFramework, FrameworkConfig, TestRunnerArgs } from "./types"

/**
 * Detect test framework from project root files.
 * Priority: pytest > vitest > jest > go_test
 */
export function detectFramework(projectRoot: string): DetectedFramework {
  // pytest: pyproject.toml or setup.cfg with pytest config
  if (existsSync(join(projectRoot, "pyproject.toml")) || existsSync(join(projectRoot, "setup.cfg"))) {
    return "pytest"
  }
  // vitest: vitest.config.* or vitest in package.json
  if (
    existsSync(join(projectRoot, "vitest.config.ts")) ||
    existsSync(join(projectRoot, "vitest.config.js")) ||
    existsSync(join(projectRoot, "vitest.config.mjs"))
  ) {
    return "vitest"
  }
  // jest: jest.config.* or jest in package.json
  if (
    existsSync(join(projectRoot, "jest.config.ts")) ||
    existsSync(join(projectRoot, "jest.config.js")) ||
    existsSync(join(projectRoot, "jest.config.mjs"))
  ) {
    return "jest"
  }
  // go test: go.mod
  if (existsSync(join(projectRoot, "go.mod"))) {
    return "go_test"
  }
  return "unknown"
}

// --- Framework command builders and output parsers ---

export function getFrameworkConfig(framework: DetectedFramework): FrameworkConfig {
  switch (framework) {
    case "pytest":
      return pytestConfig
    case "vitest":
      return vitestConfig
    case "jest":
      return jestConfig
    case "go_test":
      return goTestConfig
    default:
      throw new Error(`Unknown framework: ${framework}`)
  }
}

const pytestConfig: FrameworkConfig = {
  name: "pytest",
  detectFiles: ["pyproject.toml", "setup.cfg", "pytest.ini"],
  buildCommand(args: TestRunnerArgs, _workingDir: string) {
    const cmdParts = ["python", "-m", "pytest", args.test_path, "--tb=long", "-v"]
    if (args.test_name) {
      cmdParts.push("-k", args.test_name)
    }
    return { cmd: cmdParts[0], args: cmdParts.slice(1) }
  },
  parseOutput(stdout: string, _stderr: string, exitCode: number) {
    const failures = parsePytestFailures(stdout)
    const totalMatch = stdout.match(/(\d+) passed/)
    const failedMatch = stdout.match(/(\d+) failed/)
    const total = (totalMatch ? parseInt(totalMatch[1]!) : 0) + (failedMatch ? parseInt(failedMatch[1]!) : 0)
    const passed = totalMatch ? parseInt(totalMatch[1]!) : 0
    const failed = failedMatch ? parseInt(failedMatch[1]!) : 0

    return {
      status: exitCode === 0 ? "pass" as const : failed > 0 ? "fail" as const : "error" as const,
      total,
      passed,
      failed,
      duration_ms: 0, // pytest doesn't report total ms in a standard way
      failures,
      framework_detected: "pytest",
    }
  },
}

const vitestConfig: FrameworkConfig = {
  name: "vitest",
  detectFiles: ["vitest.config.ts", "vitest.config.js", "vitest.config.mjs"],
  buildCommand(args: TestRunnerArgs, _workingDir: string) {
    const cmdParts = ["npx", "vitest", "run", args.test_path, "--reporter=verbose"]
    if (args.test_name) {
      cmdParts.push("-t", args.test_name)
    }
    return { cmd: cmdParts[0], args: cmdParts.slice(1) }
  },
  parseOutput(stdout: string, _stderr: string, exitCode: number) {
    const failures = parseVitestFailures(stdout)
    const totalMatch = stdout.match(/Tests\s+(\d+) passed/)
    const failedMatch = stdout.match(/(\d+) failed/)
    const total = (totalMatch ? parseInt(totalMatch[1]!) : 0) + (failedMatch ? parseInt(failedMatch[1]!) : 0)
    const passed = totalMatch ? parseInt(totalMatch[1]!) : 0
    const failed = failedMatch ? parseInt(failedMatch[1]!) : 0
    const durationMatch = stdout.match(/Duration\s+([\d.]+)(ms|s)/)

    return {
      status: exitCode === 0 ? "pass" as const : failed > 0 ? "fail" as const : "error" as const,
      total,
      passed,
      failed,
      duration_ms: durationMatch
        ? durationMatch[2] === "s"
          ? parseFloat(durationMatch[1]!) * 1000
          : parseFloat(durationMatch[1]!)
        : 0,
      failures,
      framework_detected: "vitest",
    }
  },
}

const jestConfig: FrameworkConfig = {
  name: "jest",
  detectFiles: ["jest.config.ts", "jest.config.js", "jest.config.mjs"],
  buildCommand(args: TestRunnerArgs, _workingDir: string) {
    const cmdParts = ["npx", "jest", args.test_path, "--verbose", "--no-coverage"]
    if (args.test_name) {
      cmdParts.push("-t", args.test_name)
    }
    return { cmd: cmdParts[0], args: cmdParts.slice(1) }
  },
  parseOutput(stdout: string, _stderr: string, exitCode: number) {
    const failures = parseJestFailures(stdout)
    const totalMatch = stdout.match(/Tests:\s+(\d+) passed/)
    const failedMatch = stdout.match(/(\d+) failed/)
    const total = (totalMatch ? parseInt(totalMatch[1]!) : 0) + (failedMatch ? parseInt(failedMatch[1]!) : 0)
    const passed = totalMatch ? parseInt(totalMatch[1]!) : 0
    const failed = failedMatch ? parseInt(failedMatch[1]!) : 0
    const durationMatch = stdout.match(/Time:\s+([\d.]+)\s*s/)

    return {
      status: exitCode === 0 ? "pass" as const : failed > 0 ? "fail" as const : "error" as const,
      total,
      passed,
      failed,
      duration_ms: durationMatch ? parseFloat(durationMatch[1]!) * 1000 : 0,
      failures,
      framework_detected: "jest",
    }
  },
}

const goTestConfig: FrameworkConfig = {
  name: "go_test",
  detectFiles: ["go.mod"],
  buildCommand(args: TestRunnerArgs, _workingDir: string) {
    const cmdParts = ["go", "test", "-v", args.test_path]
    if (args.test_name) {
      cmdParts.push("-run", args.test_name)
    }
    return { cmd: cmdParts[0], args: cmdParts.slice(1) }
  },
  parseOutput(stdout: string, _stderr: string, exitCode: number) {
    const failures = parseGoTestFailures(stdout)
    const passCount = (stdout.match(/^--- PASS/gm) || []).length
    const failCount = (stdout.match(/^--- FAIL/gm) || []).length

    return {
      status: exitCode === 0 ? "pass" as const : failCount > 0 ? "fail" as const : "error" as const,
      total: passCount + failCount,
      passed: passCount,
      failed: failCount,
      duration_ms: 0,
      failures,
      framework_detected: "go_test",
    }
  },
}

// --- Output parsers ---

function parsePytestFailures(stdout: string): Array<{
    test_name: string
    file: string
    line: number
    error_type: string
    error_message: string
    stack_trace: string
    related_source?: string
  }> {
  const failures: Array<{
    test_name: string
    file: string
    line: number
    error_type: string
    error_message: string
    stack_trace: string
    related_source?: string
  }> = []

  // Match pytest failure blocks: "FAILED file::test_name - error_message"
  const failedPattern = /FAILED\s+(\S+)::(\S+)\s*-\s*(.+)/g
  let match: RegExpExecArray | null
  while ((match = failedPattern.exec(stdout)) !== null) {
    const file = match[1]!
    const testName = match[2]!
    const errorMsg = match[3]!.trim()
    const errorType = errorMsg.split(":")[0]?.trim() ?? "AssertionError"

    failures.push({
      test_name: testName,
      file,
      line: 0,
      error_type: errorType,
      error_message: errorMsg,
      stack_trace: extractPytestTraceback(stdout, testName),
      related_source: extractSourceFromTraceback(extractPytestTraceback(stdout, testName)),
    })
  }

  return failures
}

function parseVitestFailures(stdout: string) {
  const failures: Array<{
    test_name: string
    file: string
    line: number
    error_type: string
    error_message: string
    stack_trace: string
    related_source?: string
  }> = []

  // Vitest: "FAIL  test/file.ts > test_name"
  // Error block follows with "AssertionError: ..."
  const failPattern = /FAIL\s+(\S+)\s*>\s*(.+)/g
  let match: RegExpExecArray | null
  while ((match = failPattern.exec(stdout)) !== null) {
    const file = match[1]!
    const testName = match[2]!.trim()
    failures.push({
      test_name: testName,
      file,
      line: 0,
      error_type: "AssertionError",
      error_message: `Test failed: ${testName}`,
      stack_trace: "",
      related_source: file,
    })
  }

  return failures
}

function parseJestFailures(stdout: string) {
  const failures: Array<{
    test_name: string
    file: string
    line: number
    error_type: string
    error_message: string
    stack_trace: string
    related_source?: string
  }> = []

  // Jest: "FAIL  test/file.ts"
  // "  ● Test Name › test case"
  const failPattern = /FAIL\s+(\S+)/g
  let match: RegExpExecArray | null
  const failedFiles: string[] = []
  while ((match = failPattern.exec(stdout)) !== null) {
    failedFiles.push(match[1]!)
  }

  // Extract test names from FAIL sections
  const testFailPattern = /●\s+(.+?)(?:\n|\r\n)\s+(?:Expected|Received|Error)/g
  while ((match = testFailPattern.exec(stdout)) !== null) {
    const testName = match[1]!.trim()
    const file = failedFiles[0] ?? "unknown"
    failures.push({
      test_name: testName,
      file,
      line: 0,
      error_type: "AssertionError",
      error_message: match[0]!.trim(),
      stack_trace: "",
      related_source: file,
    })
  }

  return failures
}

function parseGoTestFailures(stdout: string) {
  const failures: Array<{
    test_name: string
    file: string
    line: number
    error_type: string
    error_message: string
    stack_trace: string
    related_source?: string
  }> = []

  // Go test: "--- FAIL: TestName (0.00s)"
  const failPattern = /--- FAIL:\s+(\S+)/g
  let match: RegExpExecArray | null
  while ((match = failPattern.exec(stdout)) !== null) {
    const testName = match[1]!
    failures.push({
      test_name: testName,
      file: "",
      line: 0,
      error_type: "TestFailed",
      error_message: `Test failed: ${testName}`,
      stack_trace: "",
    })
  }

  return failures
}

function extractPytestTraceback(stdout: string, testName: string): string {
  // Find the traceback block for a specific test
  const pattern = new RegExp(`FAILED.*${escapeRegex(testName)}.*\\n[\\s\\S]*?(?=FAILED|===)`, "g")
  const match = pattern.exec(stdout)
  return match ? match[0].trim() : ""
}

function extractSourceFromTraceback(traceback: string): string | undefined {
  // Extract file:line from traceback
  const filePattern = /File "([^"]+)", line (\d+)/
  const match = filePattern.exec(traceback)
  if (match) {
    return `${match[1]}:${match[2]}`
  }
  return undefined
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
