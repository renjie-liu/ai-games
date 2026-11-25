import {python,pythonEnv} from './harness-paths.mjs';
// Explicit local Live entry point. No legacy smoke / ElevenLabs / second LLM.
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const env={...process.env,PARTITION_ALLOW_MODEL:'0',PARTITION_ALLOW_LIVE:'1',PARTITION_LIVE_ONLY:'1',PARTITION_TTS_MODE:'off',PARTITION_PYTHON:python,...pythonEnv};
for(const k of ['PARTITION_MODEL_CONFIG','PARTITION_PRICE_TABLE','PARTITION_MODEL_LEDGER','ELEVENLABS_API_KEY','PARTITION_LIVE_FIXTURE'])delete env[k];
const child=spawn(process.execPath,[path.join(root,'server3d.mjs')],{cwd:root,env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??0));
