import js from '@eslint/js'
import globals from 'globals'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.browser,
        define: 'readonly',
        require: 'readonly',
        exports: true
      }
    }
  }
]
