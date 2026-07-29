// Scans TypeScript source for `page.getBy*(...)` / `page.locator(...)` / `this.page.getBy*(...)`
// calls and returns each one as a { name, strategy, ... } record. Used by generate-manifest.js
// to scaffold a starter locator manifest — see manifests/schema.json for the output shape.
const ts = require('typescript');

const LOCATOR_METHODS = new Set([
  'getByRole',
  'getByTestId',
  'getByText',
  'getByLabel',
  'getByPlaceholder',
  'locator',
]);

function isPageExpression(expr) {
  if (ts.isIdentifier(expr)) return expr.text === 'page';
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text === 'page';
  return false;
}

function stringLiteralValue(node) {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
    return node.text;
  }
  return undefined;
}

function findAccessibleName(optionsArg) {
  if (!optionsArg || !ts.isObjectLiteralExpression(optionsArg)) return undefined;
  for (const prop of optionsArg.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'name') {
      return stringLiteralValue(prop.initializer);
    }
  }
  return undefined;
}

function classifyCall(call) {
  if (!ts.isCallExpression(call)) return null;
  const callee = call.expression;
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const method = callee.name.text;
  if (!LOCATOR_METHODS.has(method)) return null;
  if (!isPageExpression(callee.expression)) return null;

  const args = call.arguments;
  switch (method) {
    case 'getByRole':
      return { strategy: 'role', role: stringLiteralValue(args[0]), name: findAccessibleName(args[1]) };
    case 'getByTestId':
      return { strategy: 'testId', value: stringLiteralValue(args[0]) };
    case 'getByText':
      return { strategy: 'text', value: stringLiteralValue(args[0]) };
    case 'getByLabel':
      return { strategy: 'label', value: stringLiteralValue(args[0]) };
    case 'getByPlaceholder':
      return { strategy: 'placeholder', value: stringLiteralValue(args[0]) };
    case 'locator':
      return { strategy: 'css', value: stringLiteralValue(args[0]) };
    default:
      return null;
  }
}

// `this.propName = page.getByRole(...)` or `const propName = page.getByRole(...)`
function elementNameFromAssignment(callNode) {
  const parent = callNode.parent;
  if (parent && ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    if (ts.isPropertyAccessExpression(parent.left)) return parent.left.name.text;
  }
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return undefined;
}

function slugFromLocator(locator, index) {
  const base = locator.name || locator.value || locator.role || `element${index}`;
  const camel = base
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
  return camel || `element${index}`;
}

/**
 * @param {string} sourceText
 * @param {string} fileName
 * @returns {Array<{name: string, inferred: boolean, strategy: string, role?: string, name?: string, value?: string}>}
 */
function extractLocators(sourceText, fileName) {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found = [];
  const usedNames = new Map();

  function visit(node) {
    const locator = classifyCall(node);
    if (locator && (locator.role || locator.value)) {
      const assignedName = elementNameFromAssignment(node);
      let elementName = assignedName || slugFromLocator(locator, found.length);
      if (usedNames.has(elementName)) {
        const count = usedNames.get(elementName) + 1;
        usedNames.set(elementName, count);
        elementName = `${elementName}${count}`;
      } else {
        usedNames.set(elementName, 1);
      }
      found.push({ elementName, inferred: !assignedName, ...locator });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

module.exports = { extractLocators };
