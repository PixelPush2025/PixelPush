import { config } from './config.js';

const BASE = 'https://api.vapi.ai';

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.vapiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = Array.isArray(data?.message) ? data.message.join('; ') : data?.message || text;
    throw new Error(`Vapi ${method} ${path} failed (${res.status}): ${detail}`);
  }
  return data;
}

export const vapi = {
  createAssistant: (body) => request('POST', '/assistant', body),
  updateAssistant: (id, body) => request('PATCH', `/assistant/${id}`, body),
  updatePhoneNumber: (id, body) => request('PATCH', `/phone-number/${id}`, body),
  createCall: (body) => request('POST', '/call', body),
};
