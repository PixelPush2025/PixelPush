import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(tmpdir(), 'agent-'));
process.env.DATA_DIR = dataDir;
process.env.VAPI_WEBHOOK_SECRET = 's3cret';
process.env.PUBLIC_URL = 'https://example.com/';

const { createServer, handleVapiMessage } = await import('../src/server.js');
const { inboundAssistant, outboundAssistant } = await import('../src/assistants.js');
const { parseCsv } = await import('../src/csv.js');

const call = { id: 'call_1', type: 'outboundPhoneCall', customer: { number: '+919800000001' } };

test('tool-calls run handlers and persist leads', async () => {
  const res = await handleVapiMessage({
    type: 'tool-calls',
    call,
    toolCallList: [
      { id: 't1', type: 'function', function: { name: 'save_lead', arguments: { name: 'Rahul', interest: 'hot' } } },
      { id: 't2', type: 'function', function: { name: 'book_meeting', arguments: '{"name":"Rahul","preferredTime":"Mon 4pm"}' } },
      { id: 't3', type: 'function', function: { name: 'nope', arguments: {} } },
    ],
  });
  assert.equal(res.results.length, 3);
  assert.equal(res.results[0].result, 'Lead saved.');
  assert.match(res.results[1].result, /Mon 4pm/);
  assert.match(res.results[2].error, /Unknown tool/);

  const lead = JSON.parse((await readFile(path.join(dataDir, 'leads.jsonl'), 'utf8')).trim());
  assert.equal(lead.name, 'Rahul');
  assert.equal(lead.direction, 'outbound');
  assert.equal(lead.callerNumber, '+919800000001');
});

test('webhook rejects a wrong secret and accepts the right one', async () => {
  const server = createServer().listen(0);
  const url = `http://127.0.0.1:${server.address().port}/vapi/webhook`;
  const body = JSON.stringify({ message: { type: 'status-update', status: 'ringing', call } });
  try {
    const bad = await fetch(url, { method: 'POST', body, headers: { 'x-vapi-secret': 'wrong' } });
    assert.equal(bad.status, 401);
    const good = await fetch(url, { method: 'POST', body, headers: { 'x-vapi-secret': 's3cret' } });
    assert.equal(good.status, 200);
  } finally {
    server.close();
  }
});

test('assistants point tools at the webhook with the secret header', () => {
  for (const a of [inboundAssistant(), outboundAssistant()]) {
    assert.equal(a.server.url, 'https://example.com/vapi/webhook');
    assert.equal(a.server.headers['x-vapi-secret'], 's3cret');
    assert.equal(a.model.provider, 'anthropic');
    assert.deepEqual(a.model.tools.map((t) => t.function?.name ?? t.type), ['save_lead', 'book_meeting', 'take_message', 'endCall']);
  }
  assert.match(outboundAssistant().model.messages[0].content, /\{\{name\}\}/);
});

test('parseCsv handles quoted commas', () => {
  const rows = parseCsv('phone,Name,notes\n+911,"Ram, Jr","said ""hi"""\n\n');
  assert.deepEqual(rows, [{ phone: '+911', name: 'Ram, Jr', notes: 'said "hi"' }]);
});
