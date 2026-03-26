import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    // Allow importing CJS modules in ESM context
    deps: {
      interopDefault: true
    }
  }
})
