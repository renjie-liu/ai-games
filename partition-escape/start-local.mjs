// This private playtest uses a human player and a real Gemini Live teammate.
if (process.argv.length !== 2) {
  throw new Error('本机试玩只支持真人与 Gemini Live。请直接运行 npm run start:local。');
}
await import('./start-live.mjs');
