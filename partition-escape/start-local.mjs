import {python,pythonEnv} from './harness-paths.mjs';
// Deliberately strips model opt-ins for this local voice playtest.
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
const root=path.dirname(fileURLToPath(import.meta.url));
const mode=process.argv[2]||'off';
if(!['off','mock','elevenlabs'].includes(mode)||process.argv.length>3)throw Error('Usage: npm run start:local -- [off|mock|elevenlabs]');
if(!fs.existsSync(python))throw Error('Install ai-gaming dependencies first; see README or set PARTITION_HARNESS_ROOT / PARTITION_PYTHON.');
const env={...process.env,PARTITION_ALLOW_MODEL:'0',PARTITION_ALLOW_LIVE:'0',PARTITION_TTS_MODE:mode,PARTITION_PYTHON:python,...pythonEnv};
for(const k of ['PARTITION_MODEL_CONFIG','PARTITION_PRICE_TABLE','PARTITION_MODEL_LEDGER'])delete env[k];
const child=spawn(process.execPath,[path.join(root,'server3d.mjs')],{cwd:root,env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??0));
