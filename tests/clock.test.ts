import test from 'node:test';
import assert from 'node:assert/strict';
import {clockContext} from '../server/clock';
test('clock context uses the requested local date at a UTC day boundary',()=>{
  const now=new Date('2026-10-17T01:00:00Z');
  assert.match(clockContext('America/Los_Angeles',now),/Friday, October 16, 2026/);
  assert.match(clockContext('Asia/Tokyo',now),/Saturday, October 17, 2026/);
  assert.match(clockContext('America/Los_Angeles',now),/does not establish any appointments/);
  assert.throws(()=>clockContext('not-a-timezone',now));
});
