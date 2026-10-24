import { config } from './config.js';
import { inboundPrompt, outboundPrompt, inboundFirstMessage, outboundFirstMessage } from './prompts.js';

// Function tools the model can call. Vapi POSTs each call to our server (see src/server.js).
export const toolDefinitions = [
  {
    name: 'save_lead',
    description: 'Save or update what we know about the person on the call.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: "Person's name" },
        business: { type: 'string', description: 'Business or brand name' },
        phone: { type: 'string', description: 'Best callback number if different from the caller ID' },
        email: { type: 'string' },
        needs: { type: 'string', description: 'What they want help with, in their words' },
        budget: { type: 'string' },
        timeline: { type: 'string' },
        interest: {
          type: 'string',
          enum: ['hot', 'warm', 'cold', 'callback_later', 'not_interested', 'do_not_call'],
        },
        callbackTime: { type: 'string', description: 'When to call back, if they asked' },
        notes: { type: 'string' },
      },
      required: ['interest'],
    },
  },
  {
    name: 'book_meeting',
    description: 'Request a 20-minute discovery call with a Pixel Push strategist at a confirmed day/time.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        preferredTime: { type: 'string', description: 'Day and time the person agreed to, including timezone if known' },
        email: { type: 'string', description: 'Email to send the invite to, if given' },
        topic: { type: 'string', description: 'What they want to discuss' },
      },
      required: ['name', 'preferredTime'],
    },
  },
  {
    name: 'take_message',
    description: 'Leave a message for the Pixel Push team.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        callbackNumber: { type: 'string' },
        message: { type: 'string' },
        urgent: { type: 'boolean' },
      },
      required: ['message'],
    },
  },
];

function buildAssistant({ name, prompt, firstMessage }) {
  const server = {
    url: `${config.publicUrl}/vapi/webhook`,
    ...(config.webhookSecret ? { headers: { 'x-vapi-secret': config.webhookSecret } } : {}),
  };
  return {
    name,
    firstMessage,
    firstMessageMode: 'assistant-speaks-first',
    model: {
      provider: 'anthropic',
      model: config.llmModel,
      temperature: 0.4,
      messages: [{ role: 'system', content: prompt }],
      tools: [
        ...toolDefinitions.map((fn) => ({
          type: 'function',
          function: fn,
          server,
        })),
        { type: 'endCall' },
      ],
    },
    // Deepgram's "multi" mode handles Hindi/English code-switching in one call.
    transcriber: { provider: 'deepgram', model: 'nova-3', language: 'multi' },
    voice: {
      provider: '11labs',
      model: config.voiceModel,
      ...(config.voiceId ? { voiceId: config.voiceId } : {}),
    },
    voicemailMessage: `नमस्ते, मैं ${config.agentName}, ${config.businessName} से। हम आपको दोबारा call करेंगे, या आप हमें ${config.businessEmail} पर email कर सकते हैं। धन्यवाद!`,
    endCallMessage: 'धन्यवाद, आपका दिन शुभ हो!',
    maxDurationSeconds: 600,
    silenceTimeoutSeconds: 30,
    server,
    serverMessages: ['tool-calls', 'end-of-call-report', 'status-update'],
  };
}

export const inboundAssistant = () =>
  buildAssistant({
    name: `${config.businessName} Inbound`,
    prompt: inboundPrompt,
    firstMessage: inboundFirstMessage,
  });

export const outboundAssistant = () =>
  buildAssistant({
    name: `${config.businessName} Outbound`,
    prompt: outboundPrompt,
    firstMessage: outboundFirstMessage,
  });
