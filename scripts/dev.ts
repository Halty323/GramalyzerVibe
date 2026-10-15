import { spawn } from 'node:child_process';
import { backendDirectory, runBackend } from './backend.js';
try {
  backendDirectory();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
const children = [
  runBackend(['spring-boot:run', '-Dspring-boot.run.profiles=demo'], {DEMO_MODE: 'true', TELEGRAM_BOT_ENABLED: 'false'}, process.platform !== 'win32'),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], {stdio: 'inherit', detached: process.platform !== 'win32'}),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return; stopping = true;
  for (const child of children) if (child.pid) {try {if (process.platform === 'win32') child.kill('SIGTERM'); else process.kill(-child.pid, 'SIGTERM');} catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;}}
  process.exitCode = code;
}
for (const child of children) {child.on('exit', code => stop(code ?? 0)); child.on('error', error => {console.error(error.message); stop(1);});}
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
