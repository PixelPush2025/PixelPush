// Place outbound calls.
//   npm run call -- +919876543210 "Rahul" "Rahul's Cafe" "Asked about Instagram growth"
//   npm run call -- --csv leads.csv
import { readFile } from 'node:fs/promises';
import { config, requireConfig } from '../src/config.js';
import { vapi } from '../src/vapi.js';
import { parseCsv } from '../src/csv.js';

requireConfig('vapiApiKey', 'phoneNumberId', 'outboundAssistantId');

const E164 = /^\+[1-9]\d{7,14}$/;

async function placeCall({ phone, name = '', business = '', notes = '' }) {
  if (!E164.test(phone)) throw new Error(`"${phone}" is not in +countrycode format (e.g. +919876543210)`);
  const call = await vapi.createCall({
    assistantId: config.outboundAssistantId,
    phoneNumberId: config.phoneNumberId,
    customer: { number: phone, ...(name ? { name } : {}) },
    assistantOverrides: {
      variableValues: { name: name || 'sir/madam', business: business || 'your business', notes: notes || 'none' },
    },
  });
  console.log(`Calling ${name || phone} -> call ${call.id} (${call.status})`);
}

const args = process.argv.slice(2);
let leads;
if (args[0] === '--csv') {
  leads = parseCsv(await readFile(args[1], 'utf8'));
} else if (args[0]) {
  const [phone, name, business, notes] = args;
  leads = [{ phone, name, business, notes }];
} else {
  console.log('Usage: npm run call -- <+phone> [name] [business] [notes]\n       npm run call -- --csv leads.csv');
  process.exit(1);
}

let failed = 0;
for (const lead of leads) {
  try {
    await placeCall(lead);
  } catch (err) {
    failed++;
    console.error(`Skipped ${lead.phone}: ${err.message}`);
  }
  // Space calls out so you don't hit concurrency limits or look like a robocaller.
  if (leads.length > 1) await new Promise((r) => setTimeout(r, 5000));
}
if (failed) process.exit(1);
