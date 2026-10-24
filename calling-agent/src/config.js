// Central config, read from environment (.env is loaded by `node --env-file-if-exists`).
const env = process.env;

export const config = {
  vapiApiKey: env.VAPI_API_KEY || '',
  phoneNumberId: env.VAPI_PHONE_NUMBER_ID || '',
  publicUrl: (env.PUBLIC_URL || '').replace(/\/+$/, ''),
  webhookSecret: env.VAPI_WEBHOOK_SECRET || '',
  inboundAssistantId: env.VAPI_INBOUND_ASSISTANT_ID || '',
  outboundAssistantId: env.VAPI_OUTBOUND_ASSISTANT_ID || '',

  llmModel: env.LLM_MODEL || 'claude-sonnet-5-5',
  voiceId: env.ELEVENLABS_VOICE_ID || '',
  voiceModel: env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',

  agentName: env.AGENT_NAME || 'Priya',
  businessName: env.BUSINESS_NAME || 'Pixel Push',
  businessEmail: env.BUSINESS_EMAIL || 'hello@pixelpush.marketing',
  bookingLink: env.BOOKING_LINK || '',

  dataDir: env.DATA_DIR || './data',
  port: Number(env.PORT) || 3000,
};

export function requireConfig(...keys) {
  const missing = keys.filter((k) => !config[k]);
  if (missing.length) {
    console.error(`Missing config: ${missing.join(', ')}. Copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
}
