const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Matches *.test.js anywhere in the repo, at any depth —
    // works regardless of whether the file sits in tests/, at root,
    // or anywhere else, so folder-placement mistakes can't break CI.
    include: ['**/*.test.js'],
    exclude: ['**/node_modules/**'],
  },
});
