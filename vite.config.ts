import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 빌드 결과는 dist/index.html 한 파일. 인터넷 없이 파일을 더블클릭해도 열린다.
export default defineConfig({
  base: './',
  plugins: [preact(), viteSingleFile()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx', 'src/test-setup.ts', 'src/test-utils.tsx', 'src/ui/download.ts'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
});
