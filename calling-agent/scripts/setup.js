// Creates (or updates) the inbound + outbound assistants on Vapi and attaches the
// inbound assistant to your phone number so incoming calls are answered.
import { config, requireConfig } from '../src/config.js';
import { inboundAssistant, outboundAssistant } from '../src/assistants.js';
import { vapi } from '../src/vapi.js';

requireConfig('vapiApiKey', 'publicUrl', 'voiceId');

async function upsert(id, body) {
  return id ? vapi.updateAssistant(id, body) : vapi.createAssistant(body);
}

try {
  const inbound = await upsert(config.inboundAssistantId, inboundAssistant());
  const outbound = await upsert(config.outboundAssistantId, outboundAssistant());
  console.log(`Inbound assistant:  ${inbound.id}`);
  console.log(`Outbound assistant: ${outbound.id}`);

  if (config.phoneNumberId) {
    await vapi.updatePhoneNumber(config.phoneNumberId, { assistantId: inbound.id });
    console.log(`Phone number ${config.phoneNumberId} now answers with the inbound assistant.`);
  } else {
    console.log('No VAPI_PHONE_NUMBER_ID set, so inbound calls are not wired up yet.');
  }

  if (!config.inboundAssistantId || !config.outboundAssistantId) {
    console.log('\nAdd these to .env so re-running setup updates instead of duplicating:');
    console.log(`VAPI_INBOUND_ASSISTANT_ID=${inbound.id}`);
    console.log(`VAPI_OUTBOUND_ASSISTANT_ID=${outbound.id}`);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
