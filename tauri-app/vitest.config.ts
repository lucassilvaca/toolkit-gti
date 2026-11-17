import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Os specs Playwright vivem em tests/e2e e usam o runner do Playwright,
    // não o Vitest. Excluímos aqui para que `vitest` puro não os capture.
    exclude: ['**/node_modules/**', '**/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      // Arquivos sem lógica testável unitariamente: definições de tipo, barrels
      // de re-export, bootstraps de janela (entrypoints), ponto de entrada e CSS.
      exclude: [
        '**/*.d.ts',
        '**/__tests__/**',
        '**/index.ts',
        'src/main.tsx',
        'src/**/entrypoints/**',
        'src/styles/**',
        'src/vite-env.d.ts',
      ],
      // Baseline HONESTO medindo TODOS os arquivos de src (não só os tocados por
      // testes): ~22%. A maior parte das views/componentes é coberta por e2e
      // (Playwright), não por unit test. Estes números são um PISO anti-regressão
      // — adicionar módulo de lógica sem teste derruba a cobertura e quebra o CI.
      // Meta de longo prazo: 80% na camada de lógica.
      // Ao subir a cobertura, aumente estes números — nunca deixe cair.
      thresholds: {
        statements: 20,
        branches: 14,
        functions: 16,
        lines: 20,
      },
    },
  },
})
