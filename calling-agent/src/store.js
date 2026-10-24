import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

// Append-only JSONL files: leads.jsonl, meetings.jsonl, messages.jsonl, calls.jsonl.
// Swap this for a CRM / Google Sheet / Supabase write when you're ready.
export async function record(kind, data) {
  await mkdir(config.dataDir, { recursive: true });
  const row = { at: new Date().toISOString(), ...data };
  await appendFile(path.join(config.dataDir, `${kind}.jsonl`), JSON.stringify(row) + '\n');
  return row;
}
