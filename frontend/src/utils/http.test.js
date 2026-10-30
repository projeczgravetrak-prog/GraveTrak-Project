import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invalidSession, timedFetch } from './http.js';

test('only rejected credentials expire a session; network and server failures keep it', () => {
  assert.equal(invalidSession({ status: 401 }), true);
  for (const error of [new TypeError('Failed to fetch'), { status: 500 }, { status: 503 }, { status: 403 }, new Error('Timeout')]) {
    assert.equal(invalidSession(error), false);
  }
});

test('slow requests time out without retrying mutations', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', (_, options) => {
    calls++;
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  });
  await assert.rejects(timedFetch('/submit', { method: 'POST' }, 10), /taking too long/);
  assert.equal(calls, 1);
});

test('unmount cancellation is preserved as abort, not a server timeout', async t => {
  t.mock.method(globalThis, 'fetch', (_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  const controller = new AbortController();
  const request = timedFetch('/profile', { signal: controller.signal }, 1000);
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
});
