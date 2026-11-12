// Shows remaining ElevenLabs credits.  Usage: node --env-file=.env.local credits.mjs
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
const s = await new ElevenLabsClient().user.subscription.get();
console.log(`tier: ${s.tier}  used: ${s.characterCount}  limit: ${s.characterLimit}  left: ${s.characterLimit - s.characterCount}  resets: ${new Date(s.nextCharacterCountResetUnix * 1000).toISOString().slice(0, 10)}`);
