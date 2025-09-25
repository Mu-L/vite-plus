import { expect, test } from '@voidzero-dev/vite-plus/test';
// import { test, expect } from 'vitest';

export function hello() {
  return 'Hello vitest!';
}

test('hello', () => {
  expect(hello()).toBe('Hello vitest!');
});
