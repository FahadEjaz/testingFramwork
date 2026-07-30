// File-backed store for test-case metadata (Phase 4 — see PLAN.md).
// A "test case" here is a pointer at an already-committed .spec.ts; authoring the spec itself
// is Phase 6's job (recording session). This store only owns the id/name/spec-path record.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

export interface TestCase {
  id: string;
  name: string;
  specPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestsStore {
  list(): TestCase[];
  get(id: string): TestCase | undefined;
  findBySpecPath(specPath: string): TestCase | undefined;
  create(input: { name: string; specPath: string }): TestCase;
  rename(id: string, name: string): TestCase | undefined;
  remove(id: string): boolean;
}

function createTestsStore(dataDir: string): TestsStore {
  const filePath = path.join(dataDir, 'tests.json');

  function readAll(): TestCase[] {
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  function writeAll(tests: TestCase[]) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(tests, null, 2)}\n`);
  }

  function list(): TestCase[] {
    return readAll();
  }

  function get(id: string): TestCase | undefined {
    return readAll().find((t) => t.id === id);
  }

  function findBySpecPath(specPath: string): TestCase | undefined {
    return readAll().find((t) => t.specPath === specPath);
  }

  function create({ name, specPath }: { name: string; specPath: string }): TestCase {
    const tests = readAll();
    const now = new Date().toISOString();
    const test: TestCase = { id: crypto.randomUUID(), name, specPath, createdAt: now, updatedAt: now };
    tests.push(test);
    writeAll(tests);
    return test;
  }

  function rename(id: string, name: string): TestCase | undefined {
    const tests = readAll();
    const test = tests.find((t) => t.id === id);
    if (!test) return undefined;
    test.name = name;
    test.updatedAt = new Date().toISOString();
    writeAll(tests);
    return test;
  }

  function remove(id: string): boolean {
    const tests = readAll();
    const next = tests.filter((t) => t.id !== id);
    if (next.length === tests.length) return false;
    writeAll(next);
    return true;
  }

  return { list, get, findBySpecPath, create, rename, remove };
}

module.exports = { createTestsStore };
