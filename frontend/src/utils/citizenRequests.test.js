import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestMessages, requestReplies } from './citizenRequests.js';

test('requests retain backend identity and replies retain the original request context', () => {
  const rows = [{ id: 4, kind: 'transfer', message: 'Relocation requested', reply: 'Office instructions', appId: 'BUR-4', admin: 'Office', responded_at: '2026-10-28', reply_dismissed: false },
    { id: 8, kind: 'support', message: 'Question', reply: 'Answer', reply_dismissed: true }];
  assert.equal(requestMessages(rows)[0].message, 'TRANSFER PLOT REQUEST\nRelocation requested');
  assert.equal(rows[0].message, 'Relocation requested');
  assert.deepEqual(requestReplies(rows).map(row => row.id), [4]);
  assert.deepEqual(requestReplies(rows, true).map(row => row.id), [4, 8]);
  assert.equal(requestReplies(rows)[0].appId, 'BUR-4');
});
