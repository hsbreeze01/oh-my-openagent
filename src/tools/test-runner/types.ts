// --- Output types ---
export type TestFailure = {
  test_name: string
  file: string
  line: number
  error_type: string // AssertionError | TypeError | ImportError | ...
  error_message: string
  stack_trace: string
  related_source?: string // inferred from stack trace
  ac_id?: string // linked acceptance criteria ID
}

export type AcCoverageItem = {
  ac_id: string
  status: "covered" | "uncovered"
  tests: string[] // test names covering this AC
}

export type TestRunnerResult = {
  status: "pass" | "fail" | "error"
  total: number
  passed: number
  failed: number
  duration_ms: number
  failures: TestFailure[]
  framework_detected: string
  ac_coverage?: AcCoverageItem[]
}

// --- Framework detection types ---
export type DetectedFramework = "pytest" | "jest" | "vitest" | "go_test" | "unknown"

export type TestRunnerArgs = {
  test_path: string
  test_name?: string
  framework?: string
  working_dir?: string
  verify_coverage?: boolean
  acceptance_criteria?: string[]
}

export type FrameworkConfig = {
  name: DetectedFramework
  detectFiles: string[]
  buildCommand: (args: TestRunnerArgs, workingDir: string) => { cmd: string; args: string[] }
  parseOutput: (stdout: string, stderr: string, exitCode: number) => Omit<TestRunnerResult, "ac_coverage">
}
