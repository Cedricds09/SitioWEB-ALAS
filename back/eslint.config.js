// Migración del .eslintrc.json legacy a flat config (requerido en eslint v9+).
// Mismas reglas que la config anterior. eslint-config-prettier se aplica al final
// para desactivar reglas de formato que chocan con Prettier.

const js = require('@eslint/js');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  // Base recommended de eslint
  js.configs.recommended,

  // Reglas y entorno del proyecto ALAS
  {
    files: ['src/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        // Globals de Node (CommonJS)
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'warn',
    },
  },

  // Apaga reglas formato que chocan con Prettier (debe ir al final)
  prettierConfig,
];
