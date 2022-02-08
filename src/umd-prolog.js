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

