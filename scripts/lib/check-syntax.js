// Syntax-only validation for an edited .spec.ts source string, used before writing an in-app
// script edit to disk (Phase: test script editing). `ts.transpileModule` is single-file and
// reports syntactic diagnostics only (no semantic/type checking against the rest of the
// project, which would need a full Program + node_modules) — exactly the "is this even
// parseable TypeScript" bar an edit needs to clear, not a full typecheck.
const ts = require('typescript');

function checkSyntax(source) {
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    reportDiagnostics: true,
    fileName: 'edited.spec.ts',
  });

  return (result.diagnostics ?? []).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    if (diagnostic.file && diagnostic.start !== undefined) {
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      return `Line ${line + 1}, Col ${character + 1}: ${message}`;
    }
    return message;
  });
}

module.exports = { checkSyntax };
