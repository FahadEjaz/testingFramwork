// Finds the primaryFactory arrow-function body inside a specific resilientLocator(page, spec,
// 'elementKey', () => <expr>) call in a .spec.ts file, so a healing patch can replace <expr>
// with the new working locator's code without touching anything else in the file.
const ts = require('typescript');

function findResilientLocatorCallBody(sourceText, fileName, elementKey) {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let match = null;

  function visit(node) {
    if (
      !match &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'resilientLocator'
    ) {
      const [, , keyArg, factoryArg] = node.arguments;
      if (
        keyArg &&
        ts.isStringLiteral(keyArg) &&
        keyArg.text === elementKey &&
        factoryArg &&
        ts.isArrowFunction(factoryArg) &&
        !ts.isBlock(factoryArg.body)
      ) {
        match = { start: factoryArg.body.getStart(sourceFile), end: factoryArg.body.getEnd() };
        return;
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return match;
}

/** @returns {string|null} patched source, or null if no matching call site was found. */
function patchSpecLocator(sourceText, fileName, elementKey, newExprText) {
  const span = findResilientLocatorCallBody(sourceText, fileName, elementKey);
  if (!span) return null;
  return sourceText.slice(0, span.start) + newExprText + sourceText.slice(span.end);
}

module.exports = { patchSpecLocator };
