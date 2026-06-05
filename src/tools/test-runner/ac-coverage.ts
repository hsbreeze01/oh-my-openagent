import { readFile, readdir, stat } from "node:fs/promises"
import { join, extname } from "node:path"
import type { AcCoverageItem } from "./types"

/**
 * Scan test files for AC ID annotations in docstrings/comments.
 *
 * Supported formats:
 *   Python:     """AC-001: description"""
 *   JS/TS:      /** AC-001: description *\/  or  // AC-001: description
 *   Go:         // AC-001: description
 */
export async function scanAcCoverage(
  testPath: string,
  acceptanceCriteria: string[],
): Promise<AcCoverageItem[]> {
  if (acceptanceCriteria.length === 0) {
    return []
  }

  const testFiles = await discoverTestFiles(testPath)
  const acMap = new Map<string, string[]>()

  // Initialize all ACs as uncovered
  for (const acId of acceptanceCriteria) {
    acMap.set(acId, [])
  }

  // Scan each test file for AC annotations
  for (const file of testFiles) {
    const content = await readFile(file, "utf-8")
    const foundAcs = extractAcIds(content, file)
    for (const acId of foundAcs) {
      if (acMap.has(acId)) {
        const tests = acMap.get(acId)!
        // Extract the test function/method name containing this AC
        const testName = extractTestName(content, acId, file)
        if (testName && !tests.includes(testName)) {
          tests.push(testName)
        }
      }
    }
  }

  return acceptanceCriteria.map((acId) => ({
    ac_id: acId,
    status: (acMap.get(acId)?.length ?? 0) > 0 ? "covered" as const : "uncovered" as const,
    tests: acMap.get(acId) ?? [],
  }))
}

async function discoverTestFiles(testPath: string): Promise<string[]> {
  const files: string[] = []
  try {
    const s = await stat(testPath)
    if (s.isFile()) {
      return [testPath]
    }
    if (s.isDirectory()) {
      await walkDir(testPath, files)
    }
  } catch {
    // Path doesn't exist, return empty
  }
  return files
}

async function walkDir(dir: string, files: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip node_modules, __pycache__, .git
      if (["node_modules", "__pycache__", ".git", "dist", ".venv"].includes(entry.name)) {
        continue
      }
      await walkDir(fullPath, files)
    } else if (entry.isFile() && isTestFile(entry.name)) {
      files.push(fullPath)
    }
  }
}

function isTestFile(name: string): boolean {
  const lower = name.toLowerCase()
  return (
    lower.includes("test") ||
    lower.includes("_test.go") ||
    lower.includes("spec.") ||
    lower.endsWith(".test.ts") ||
    lower.endsWith(".test.js")
  )
}

function extractAcIds(content: string, _file: string): string[] {
  const acIds: string[] = []
  // Match AC-NNN patterns (e.g., AC-001, AC-123)
  const pattern = /\b(AC-\d{3,})\b/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) {
    const acId = match[1]!
    if (!acIds.includes(acId)) {
      acIds.push(acId)
    }
  }
  return acIds
}

function extractTestName(content: string, acId: string, file: string): string | undefined {
  const ext = extname(file)
  const lines = content.split("\n")

  // Find the line containing the AC ID
  let acLineIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes(acId)) {
      acLineIndex = i
      break
    }
  }

  if (acLineIndex === -1) return undefined

  // Search backwards for the test function definition
  if (ext === ".py") {
    // Python: look for "def test_"
    for (let i = acLineIndex; i >= 0; i--) {
      const defMatch = lines[i]!.match(/def\s+(test_\w+)/)
      if (defMatch) return defMatch[1]
    }
  } else if (ext === ".go") {
    // Go: look for "func Test"
    for (let i = acLineIndex; i >= 0; i--) {
      const funcMatch = lines[i]!.match(/func\s+(Test\w*)/)
      if (funcMatch) return funcMatch[1]
    }
  } else {
    // JS/TS: look for "it(" or "test(" or "describe("
    for (let i = acLineIndex; i >= 0; i--) {
      const jsMatch = lines[i]!.match(/(?:it|test)\s*\(\s*['"`](.+?)['"`]/)
      if (jsMatch) return jsMatch[1]
    }
  }

  return undefined
}
