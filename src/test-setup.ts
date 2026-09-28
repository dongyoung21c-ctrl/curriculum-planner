import { cleanup } from '@testing-library/preact';
import { afterEach, vi } from 'vitest';

// jsdom에 없는 브라우저 기능
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

afterEach(() => {
  cleanup();
  localStorage.clear();
});
