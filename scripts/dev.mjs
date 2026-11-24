import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import electron from 'electron';

const server = await createServer();
await server.listen();
server.printUrls();
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, CREATOR_WORKBENCH_DEV: '1' } });
child.on('exit', async code => { await server.close(); process.exitCode = code ?? 1; });
process.on('SIGINT', () => child.kill());
