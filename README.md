# babel-plugin-transform-modules-requirejs-babel

[![Latest version](https://img.shields.io/npm/v/babel-plugin-transform-modules-requirejs-babel)
 ![Dependency status](https://img.shields.io/librariesio/release/npm/babel-plugin-transform-modules-requirejs-babel)
](https://www.npmjs.com/package/babel-plugin-transform-modules-requirejs-babel)

A [Babel] plugin transforming ESM modules to AMD modules, so that they will be processable by [RequireJS] with the help of the [requirejs-babel7] plugin.

The built-in plugin for the AMD module transformation - [@babel/plugin-transform-modules-amd] - covers only a simple scenario transform an ESM code base, which used AMD only as module format, without additional other RequireJS features. This plugin supports scenarios using all capabilities of RequireJS, above all:

* Mixing ESM and AMD modules at any dependency level.
* If an ESM module contains a single default export, it will be exported from the AMD module without wrapping to `{ default: ... }` to keep the compatibility. An AMD module can be rewritten to ESM and vice-versa anytime.
* AMD module bundles with multiple `define` statements are recognised.

### Table of Contents

- [History](#history)
- [Installation](#installation-and-getting-started)
- [Babel Configuration Examples](#babel-configuration-examples)
- [Contributing](#contributing)
- [License](#license)

## History

This plugin replaces a couple of plugins usually used together with [requirejs-babel7]: [@babel/plugin-transform-modules-amd], [babel-plugin-amd-checker], [babel-plugin-amd-default-export] and [babel-plugin-module-resolver-standalone]. An example of a Babel configuration using those plugins:

```js
{
  plugins: [
    'amd-checker',
    'transform-modules-amd',
    [
      'module-resolver',
      {
        resolvePath: function (sourcePath, currentFile, opts) {
          // Ignore paths with other plugins applied and the three built-in
          // pseudo-modules of RequireJS.
          if (sourcePath.indexOf('!') < 0 && sourcePath !== 'require' &&
            sourcePath !== 'module' && sourcePath !== 'exports') {
            return 'es6!' + sourcePath;
          }
        }
      }
    ],
    ['amd-default-export', { addDefaultProperty: false }]
  ]
}
```

Their combination did not support mixing ESM and AMD modules at any dependency level. Skipping of AMD modules had to be handled by catching an error of a special class, which needed to wrap Babel programmatically. The new plugin covers amm problems of the built-in AMD transformation, which the previous ones did, without any drawbacks.

## Installation

This module can be installed in your project using [NPM], [PNPM] or [Yarn]. Make sure, that you use [Node.js] version 6 or newer.

```sh
npm i -D babel-plugin-transform-modules-requirejs-babel
pnpm i -D babel-plugin-transform-modules-requirejs-babel
yarn add babel-plugin-transform-modules-requirejs-babel
```

## Babel Configuration Examples

Prevent the transpiler to wrap source files that are already wrapped by `define` or `require` as AMD modules:

```js
{
  plugins: ['transform-modules-requirejs-babel']
}
```

Customising the default module path transformation:

```js
{
  plugins: [
    [
      'transform-modules-requirejs-babel',
      {
        resolvePath: function (sourcePath, currentFile, opts) {
          // Ignore paths with other plugins applied and the three built-in
          // pseudo-modules of RequireJS.
          if (sourcePath.indexOf('!') < 0 && sourcePath !== 'require' &&
            sourcePath !== 'module' && sourcePath !== 'exports') {
            return 'es6!' + sourcePath;
          }
        }
      }
    ]
  ]
}
```

## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style. Lint and test your code.

## License

Copyright (c) 2022-2025 Ferdinand Prantl

Licensed under the MIT license.

[Node.js]: http://nodejs.org/
[NPM]: https://www.npmjs.com/
[PNPM]: https://pnpm.io/
[Yarn]: https://yarnpkg.com/
[Babel]: http://babeljs.io
[RequireJS]: https://requirejs.org/
[requirejs-babel7]: https://www.npmjs.com/package/requirejs-babel7
[@babel/plugin-transform-modules-amd]: https://www.npmjs.com/package/@babel/plugin-transform-modules-amd
[@babel/plugin-transform-modules-amd]: https://www.npmjs.com/package/requirejs-babel7
[babel-plugin-amd-checker]: https://www.npmjs.com/package/babel-plugin-amd-checker
[babel-plugin-amd-default-export]: https://www.npmjs.com/package/babel-plugin-amd-default-export
[babel-plugin-module-resolver-standalone]: https://www.npmjs.com/package/babel-plugin-module-resolver-standalone
