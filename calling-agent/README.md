# Pixel Push Calling Agent

An AI phone agent ("Priya") that **answers inbound calls** and **places outbound calls** in
**Hindi + English (Hinglish)**. Built on [Vapi](https://vapi.ai), with Claude as the brain,
Deepgram for speech-to-text and ElevenLabs for the voice.

```
Caller ⇄ Phone number (Vapi) ⇄ Assistant (Claude + Deepgram + ElevenLabs)
                                      │  tool calls / call reports
                                      ▼
                         this server  POST /vapi/webhook  →  data/*.jsonl
```

## What it does

| | Inbound | Outbound |
|---|---|---|
| Greets in Hinglish, switches to English if the caller does | ✅ | ✅ |
| Answers questions about Pixel Push services | ✅ | ✅ |
| Qualifies the lead (needs, budget, timeline, interest) → `leads.jsonl` | ✅ | ✅ |
| Books a 20-min discovery call → `meetings.jsonl` | ✅ | ✅ |
| Takes messages for the team → `messages.jsonl` | ✅ | |
| Personalised opener from your lead list (`{{name}}`, `{{business}}`, `{{notes}}`) | | ✅ |
| Leaves voicemail, honours "don't call me again" | | ✅ |
| Saves summary, transcript and recording link of every call → `calls.jsonl` | ✅ | ✅ |

## Setup (about 15 minutes)

1. **Vapi account**: sign up at dashboard.vapi.ai and copy your **private API key**.
2. **Phone number**: in Vapi → Phone Numbers, buy one or import one (see *Indian numbers* below). Copy its **ID**.
3. **Voice**: pick a Hindi-capable ElevenLabs voice from the Vapi voice library and copy its **voice ID**.
4. **Run the webhook server** somewhere public with HTTPS (Render, Railway, Fly, or `ngrok http 3000` for testing):
   ```bash
   cd calling-agent
   cp .env.example .env    # fill in VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, PUBLIC_URL, ELEVENLABS_VOICE_ID
   npm start               # needs Node 20.6+, no npm install required
   ```
5. **Create the assistants** (and point your number's inbound calls at them):
   ```bash
   npm run setup
   ```
   Paste the two printed assistant IDs into `.env`. Re-running `npm run setup` later updates them in place,
   so edit `src/prompts.js` and run it again whenever you change the script.
6. **Test it**: call your number (inbound) or place a call to yourself (outbound):
   ```bash
   npm run call -- +919876543210 "Nimish" "Pixel Push" "Testing the agent"
   ```

## Outbound campaigns

Put leads in a CSV (see `leads.example.csv`, columns `phone,name,business,notes`, phones in `+91…` format):

```bash
npm run call -- --csv leads.csv
```

Calls go out 5 seconds apart. Results land in `data/` as they happen.

## Customising

- **Script, persona, services**: `src/prompts.js`
- **Agent name, business details, booking link**: `.env` (`AGENT_NAME`, `BOOKING_LINK`, …)
- **What happens when a lead is saved or a meeting booked**: `src/tools.js` (swap the JSONL writes for
  your CRM, Google Sheets, WhatsApp or email)
- **Claude model / voice**: `LLM_MODEL`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL` in `.env`.
  Use a model that Vapi lists under Anthropic; faster models feel more natural on calls.

## Indian numbers & compliance

- Vapi's free numbers are US numbers. For an Indian caller ID, import a number from a provider that supports
  India (for example Plivo, Exotel or Twilio via SIP trunk) under Vapi → Phone Numbers.
- Outbound promotional calls in India fall under TRAI's telemarketing rules (DND/NCPR scrubbing and DLT
  registration through your telecom provider). Call people who opted in (form fills, existing contacts), and
  check the current rules with your provider before running campaigns.
- The agent says it's an AI when asked, and marks anyone who asks not to be called as `do_not_call`.
  Filter those out of future CSVs.

## Development

```bash
npm test     # tests for the webhook, tools, assistant config and CSV parsing
```
