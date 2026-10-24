import { config } from './config.js';
import { record } from './store.js';

// Each handler gets the tool arguments plus call context, and returns a short string
// the assistant can use in its next reply.
export const handlers = {
  async save_lead(args, ctx) {
    await record('leads', { callId: ctx.callId, direction: ctx.direction, callerNumber: ctx.customerNumber, ...args });
    return 'Lead saved.';
  },

  async book_meeting(args, ctx) {
    await record('meetings', { callId: ctx.callId, callerNumber: ctx.customerNumber, status: 'requested', ...args });
    const link = config.bookingLink
      ? ` Tell them we will also send a booking link (${config.bookingLink}) to confirm.`
      : '';
    return `Meeting requested for ${args.preferredTime}. Tell the person a strategist will confirm shortly.${link}`;
  },

  async take_message(args, ctx) {
    await record('messages', { callId: ctx.callId, callerNumber: ctx.customerNumber, ...args });
    return 'Message saved. Tell the person the team will get back to them soon.';
  },
};

export async function runToolCalls(toolCallList, ctx) {
  return Promise.all(
    toolCallList.map(async ({ id, function: fn }) => {
      const handler = handlers[fn?.name];
      if (!handler) return { toolCallId: id, error: `Unknown tool: ${fn?.name}` };
      try {
        const args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments || '{}') : fn.arguments || {};
        return { toolCallId: id, result: await handler(args, ctx) };
      } catch (err) {
        console.error(`Tool ${fn.name} failed:`, err);
        return { toolCallId: id, error: 'Something went wrong saving that; continue the conversation.' };
      }
    }),
  );
}
