import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { record } from './store.js';
import { runToolCalls } from './tools.js';

function secretMatches(header) {
  if (!config.webhookSecret) return true;
  const a = Buffer.from(String(header || ''));
  const b = Buffer.from(config.webhookSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function callContext(message) {
  const call = message.call || {};
  return {
    callId: call.id,
    direction: call.type === 'outboundPhoneCall' ? 'outbound' : 'inbound',
    customerNumber: call.customer?.number || message.customer?.number,
  };
}

export async function handleVapiMessage(message) {
  switch (message?.type) {
    case 'tool-calls':
      return { results: await runToolCalls(message.toolCallList || [], callContext(message)) };

    case 'end-of-call-report':
      await record('calls', {
        ...callContext(message),
        endedReason: message.endedReason,
        durationSeconds: message.durationSeconds,
        cost: message.cost,
        summary: message.analysis?.summary || message.summary,
        recordingUrl: message.recordingUrl || message.artifact?.recordingUrl,
        transcript: message.transcript || message.artifact?.transcript,
      });
      console.log(`Call ${message.call?.id} ended: ${message.endedReason}`);
      return {};

    case 'status-update':
      console.log(`Call ${message.call?.id} status: ${message.status}`);
      return {};

    default:
      return {};
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function createServer() {
  return http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
    if (req.method !== 'POST' || req.url !== '/vapi/webhook') return send(res, 404, { error: 'not found' });
    if (!secretMatches(req.headers['x-vapi-secret'])) return send(res, 401, { error: 'unauthorized' });

    let raw = '';
    for await (const chunk of req) raw += chunk;
    try {
      const { message } = JSON.parse(raw || '{}');
      send(res, 200, await handleVapiMessage(message));
    } catch (err) {
      console.error('Webhook error:', err);
      // Vapi ignores non-200s, so still answer 200.
      send(res, 200, {});
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer().listen(config.port, () => {
    console.log(`Calling agent webhook listening on :${config.port} (POST /vapi/webhook)`);
  });
}
