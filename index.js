(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(factory);
  } else if (typeof exports === 'object') {
    exports = factory();
  } else {
    root.moduleResolver = factory();
  }
})(this, function () {
  'use strict';

  function transformModulesRequireJSBabel(args) {
    var types = args.types;
    var template = args.template;

    // Detects if an expression calls define or require function.
    // Returns information about an AMD module false, { deps } or [{ deps }, ...].
    function detectDefineOrRequireCall(expr) {
      var callee, args, arg, argLen, argIndex, func, obj, deps;

      if (!expr.isCallExpression()) return false;

      args = expr.get('arguments');
      argLen = args.length;
      if (argLen === 0) return false;

      callee = expr.get('callee');
      // namespace.define(...)
      if (callee.isMemberExpression()) {
        obj = callee.get('object');
        if (!obj.isIdentifier()) return false;
        func = callee.get('property');
      } else {
        func = callee;
      }
      if (!func.isIdentifier()) return false;

      // define('name', [deps], factory)
      if (func.node.name === 'define') {
        argIndex = 0;
        arg = args[argIndex];
        if (arg.isStringLiteral()) {
          if (argLen <= ++argIndex) return false;
          arg = args[argIndex];
        }
        if (arg.isArrayExpression()) {
          deps = arg;
          if (argLen <= ++argIndex) return false;
          arg = args[argIndex];
        }
        return (arg.isFunctionExpression() || arg.isObjectExpression()) &&
          deps && { deps: deps };
      }

      // require([deps], success, error)
      if (func.node.name === 'require') {
        deps = args[0];
        return deps.isArrayExpression() && argLen >= 2 &&
          args[1].isFunctionExpression() && { deps: deps };
      }
    }

    // Detects if a program contains statements calling define or require function.
    // Returns information about AMD modules false, { deps } or [{ deps }, ...].
    function detectDefineOrRequire(stat) {
      var expr;

      if (!stat.isExpressionStatement()) return false;
      expr = stat.get('expression');

      // multiple define/require statements in one file
      if (expr.isSequenceExpression()) {
        return expr
          .get('expressions')
          .map(detectDefineOrRequireCall)
          .reduce(function(all, one) {
            return one ? all.concat(one) : all;
          }, []);
      }

      return detectDefineOrRequireCall(stat.get('expression'));
    }

    // Detects if a program contains statements calling define or require function.
    // Returns information about the AMD modules [{ deps }, ...] or [].
    function detectDefinesOrRequires(program) {
      var body = program.get('body');
      return body
        .map(detectDefineOrRequire)
        .reduce(function(all, one) {
          return one ? all.concat(one) : all;
        }, []);
    }

    // Updates dependency paths to be prefixed by `es6!` or otherwise updated.
    function updateAmdDeps(amd, meta) {
      var parentName = meta.file.opts.sourceFileName;
      var options = meta.opts;
      var resolvePath = options.resolvePath;
      var moduleRefs = amd.deps.get('elements');
      var i, len, moduleRef, moduleName, newModuleName;

      for (i = 0, len = moduleRefs.length; i < len; ++i) {
        moduleRef = moduleRefs[i];
        if (moduleRef.isStringLiteral()) {
          moduleName = moduleRef.node.value;
          newModuleName = resolvePath(moduleName, parentName, options);
          if (newModuleName && newModuleName !== moduleName) {
            moduleRef.replaceWith(types.stringLiteral(newModuleName));
          }
        }
      }
    }

    var buildAmdModuleWithImports = template('\n' +
'define(IMPORT_PATHS, function(IMPORT_VARS) {\n' +
'  "use strict";\n' +
'  NAMED_IMPORTS;\n' +
'  BODY;\n' +
'});\n');
    var buildAmdModuleWithoutImports = template('\n' +
'define(function() {\n' +
'  "use strict";\n' +
'  BODY;\n' +
'});\n');
    var buildObjectCopyLoop = template('\n' +
'for (var _key in SOURCE) {\n' +
'  TARGET[_key] = SOURCE[_key];\n' +
'}\n');

    // Transforms the module format from ESM to AMD.
    function transformEsmToAmd(program, meta) {
      var body = program.get('body');
      var bodyLen = body.length;

      var importPaths = [];
      var importVars = [];
      var namedImports = [];

      var exportsVar = program.scope.generateUidIdentifier('exports');
      var hasExport = false;
      var needReturnExport = false;
      var isOnlyDefaultExport = true;

      var i, statement, exportStat, specifiers, declaration, funcNode, classNode,
          className, importVar, importNode, asName, exportValue, exportSource,
          needExportExpression, varNode, forIn, returnStatement;

      for (i = 0; i < bodyLen; ++i) {
        statement = body[i];

        // import
        if (statement.isImportDeclaration()) {
          // save import path
          exportSource = statement.node.source;
          importPaths.push(exportSource);

          importNode = statement.node;
          // import "some"
          if (isAnonymousImport(importNode)) {
            // importVars.length should be equal importPaths.length
            importVar = statement.scope.generateUidIdentifier(exportSource.value);
            importVars.push(importVar);
          }
          // import some from "some"
          // import * as some from "some"
          else if (isImportDefault(importNode) || isImportAllAs(importNode)) {
            asName = importNode.specifiers[0].local;
            importVars.push(asName);
          }
          // import {x, y, z} from "xyz"
          else {
            // convert "/path/to/a" to _pathToA
            asName = statement.scope.generateUidIdentifier(exportSource.value);
            importVars.push(asName);

            importNode.specifiers.forEach(function (args) {
              var imported = args.imported;
              var local = args.local;
              namedImports.push(
                types.variableDeclaration('var', [
                  types.variableDeclarator(
                    types.identifier(local.name),
                    types.memberExpression(
                      types.identifier(asName.name),
                      types.identifier(imported.name))
                  )
                ])
              );
            });
          }

          statement.remove();
        }

        // export default
        if (statement.isExportDefaultDeclaration()) {
          // need return at end file
          hasExport = true;
          needReturnExport = true;

          // expression after keyword default
          declaration = statement.get('declaration');
          exportValue = declaration.node;
          needExportExpression = true;

          if (declaration.isFunctionDeclaration()) {
            funcNode = exportValue;
            exportValue = types.toExpression(funcNode);
          }
          if (declaration.isClassDeclaration()) {
            classNode = exportValue;

            if (classNode.id) {
              statement.replaceWith(classNode);

              className = types.identifier(classNode.id.name);
              if (i + 1 === bodyLen && isOnlyDefaultExport) {
                exportStat = types.returnStatement(types.identifier(className));
                needReturnExport = false;
              } else {
                exportStat = exportStatement(exportsVar, 'default', className);
              }

              program.pushContainer('body', [exportStat]);
              needExportExpression = false;
            } else {
              exportValue = types.toExpression(classNode);
            }
          }

          if (needExportExpression) {
            if (i + 1 === bodyLen && isOnlyDefaultExport) {
              exportStat = types.returnStatement(exportValue);
              needReturnExport = false;
            } else {
              exportStat = exportStatement(exportsVar, 'default', exportValue);
            }

            statement.replaceWith(exportStat);
          }
        }

        // export {x as y}
        // export var a = 1;
        // export function test() {};
        // export class Test {};
        if (statement.isExportNamedDeclaration()) {
          hasExport = true;
          needReturnExport = true;

          specifiers = statement.node.specifiers;
          declaration = statement.get('declaration');

          // export var a = 1;
          if (!specifiers.length) {
            isOnlyDefaultExport = false;

            // replace "export <expression>"
            // to "<expression>"
            statement.replaceWith(declaration);

            // export var a = 1;
            if (declaration.isVariableDeclaration()) {
              varNode = declaration.node;
              asName = varNode.declarations[0].id.name;

              exportStat = exportStatement(exportsVar, asName, types.identifier(asName));
              program.pushContainer('body', [exportStat]);
            }

            // export function x() {}
            if (declaration.isFunctionDeclaration()) {
              funcNode = declaration.node;
              asName = funcNode.id.name;

              exportStat = exportStatement(exportsVar, asName, types.identifier(asName));
              program.pushContainer('body', [exportStat]);
            }

            // export class Test {}
            if (declaration.isClassDeclaration()) {
              classNode = declaration.node;
              asName = classNode.id.name;

              exportStat = exportStatement(exportsVar, asName, types.identifier(asName));
              program.pushContainer('body', [exportStat]);
            }
          } else { // export {x as y}
            specifiers.forEach(function (specifier) {
              asName = specifier.exported.name;
              if (asName !== 'default') {
                isOnlyDefaultExport = false;
              }

              exportStat = exportStatement(exportsVar, asName, specifier.local);
              program.pushContainer('body', [exportStat]);
            });

            // export { ... } from "module"
            exportSource = statement.node.source;
            if (exportSource) {
              // save import path
              importPaths.push(exportSource);
              // importVars.length should be equal importPaths.length
              importVar = statement.scope.generateUidIdentifier(exportSource.value);
              importVars.push(importVar);

              specifiers.forEach(function (args) {
                var exported = args.exported;
                var local = args.local;
                namedImports.push(
                  types.variableDeclaration('var', [
                    types.variableDeclarator(
                      types.identifier(local.name),
                      types.memberExpression(
                        types.identifier(importVar.name),
                        types.identifier(exported.name))
                    )
                  ])
                );
              });

              forIn = buildObjectCopyLoop({
                SOURCE: importVar,
                TARGET: exportsVar
              });
              statement.replaceWith(forIn);
            } else {
              statement.remove();
            }
          }
        }

        // export * from "module"
        if (statement.isExportAllDeclaration()) {
          isOnlyDefaultExport = false;
          hasExport = true;
          needReturnExport = true;

          // save import path
          exportSource = statement.node.source;
          importPaths.push(exportSource);
          // importVars.length should be equal importPaths.length
          importVar = statement.scope.generateUidIdentifier(exportSource.value);
          importVars.push(importVar);

          forIn = buildObjectCopyLoop({
            SOURCE: importVar,
            TARGET: exportsVar
          });
          statement.replaceWith(forIn);
        }
      }

      // adding define wrapper
      if (hasExport && needReturnExport) {
        // var _exports = {};
        program.unshiftContainer('body', [
          types.variableDeclaration('var', [
            types.variableDeclarator(exportsVar, types.objectExpression([]))
          ])
        ]);

        // return <expression>;
        if (isOnlyDefaultExport) {
          // return _exports.default;
          returnStatement = types.returnStatement(
            types.memberExpression(exportsVar, types.identifier('default'))
          );
        }
        else {
          // return _exports;
          returnStatement = types.returnStatement(exportsVar);
        }

        program.pushContainer('body', [returnStatement]);
      }

      buildAmdModule(program, meta, importPaths, importVars, namedImports);
    }

    // Wraps a program body of statements into an AMD module.
    function buildAmdModule(program, meta, importPaths, importVars, namedImports) {
      program.node.body = [importPaths.length ?
        buildAmdModuleWithImports({
          IMPORT_PATHS: prepareImportPaths(meta, importPaths),
          IMPORT_VARS: importVars,
          BODY: program.node.body,
          NAMED_IMPORTS: namedImports
        }) :
        buildAmdModuleWithoutImports({
          BODY: program.node.body
        })];
    }

    // Update dependency paths to be prefixed by `es6!` or otherwise updated.
    function prepareImportPaths(meta, importPaths) {
      var options = meta.opts;
      var resolvePath = options.resolvePath;
      var parentName = meta.file.opts.sourceFileName;
      var i, len, importPath, moduleName, newModuleName;

      for (i = 0, len = importPaths.length; i < len; ++i) {
        importPath = importPaths[i];
        if (importPath.type === 'StringLiteral') {
          moduleName = importPath.value;
          newModuleName = resolvePath(moduleName, parentName, options);
          if (newModuleName) {
            importPath.value = newModuleName;
          }
        }
      }

      return types.arrayExpression(importPaths);
    }

    // Checks an anonymous import.
    function isAnonymousImport(importNode) {
      // import "some"
      return importNode.specifiers.length === 0;
    }

    // Checks a default import.
    function isImportDefault(importNode) {
      // import some from "some"
      return importNode.specifiers.length === 1 &&
        importNode.specifiers[0].type === 'ImportDefaultSpecifier';
    }

    // Checks importing all named exports to an object.
    function isImportAllAs(importNode) {
      // import * as some from "some"
      return importNode.specifiers.length === 1 &&
        importNode.specifiers[0].type !== 'ImportDefaultSpecifier' &&
        !importNode.specifiers[0].imported;
    }

    // Returns a statement assigning a property value to the exports object.
    function exportStatement(exportsVar, key, value) {
      return types.toStatement(types.assignmentExpression('=',
        types.memberExpression(exportsVar, types.identifier(key)), value));
    }

    return {
      visitor: {
        Program: {
          exit: function(program, meta) {
            var amds = detectDefinesOrRequires(program);
            var amdLen = amds.length;
            var i;
            if (amdLen) {
              for (i = 0; i < amdLen; ++i) {
                updateAmdDeps(amds[i], meta);
              }
            } else {
              transformEsmToAmd(program, meta);
            }
          }
        }
      }
    };
  }

  return transformModulesRequireJSBabel;
});
