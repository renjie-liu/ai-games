// The harness is a separate checkout, never copied into the game repository.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const gameRoot=path.dirname(fileURLToPath(import.meta.url));
export const harnessRoot=path.resolve(process.env.PARTITION_HARNESS_ROOT||path.join(gameRoot,'../../ai-gaming'));
export const python=process.env.PARTITION_PYTHON||path.join(harnessRoot,'.venv/bin/python');
export const pythonEnv={PARTITION_HARNESS_ROOT:harnessRoot,PYTHONPATH:path.join(harnessRoot,'src')};
