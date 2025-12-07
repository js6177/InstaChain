import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    input: './specs/openapi.json',
    output: {
      target: './src/generated/api.ts',
      client: 'axios',
      mode: 'tags-split',
      schemas: './src/generated/models',
      tsconfig: './tsconfig.json',
      override: {
        mutator: {
          path: './src/api-client.ts',
          name: 'customInstance',
        },
      },
    },
    hooks: {
      afterAllFilesWrite: 'bun run prettier --write',
    },
  },
});