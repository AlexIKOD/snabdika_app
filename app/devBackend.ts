import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import type { Plugin } from 'vite';

export async function devBackend() {
  const socket = createServer();
  await new Promise<void>(resolve => socket.listen(0, '127.0.0.1', resolve));
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('No backend port');
  const port = address.port;
  await new Promise<void>(resolve => socket.close(() => resolve()));
  const key = randomBytes(32).toString('hex');
  let child: ChildProcess | undefined;
  function stop() {
    // Windows' python launcher can have its own child; EOF reaches both processes.
    child?.stdin?.end();
    const processToStop = child;
    setTimeout(() => processToStop?.kill(), 2000).unref();
  }
  async function start() {
    child = spawn(process.env.SNABDIKA_PYTHON || 'python', ['-m', 'backend.main'], {
      cwd: process.cwd(), windowsHide: true,
      env: { ...process.env, SNABDIKA_DEV: '1', SNABDIKA_LOCAL_KEY: key, SNABDIKA_PORT: String(port), SNABDIKA_PARENT_PIPE: '1' },
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    child.on('error', error => console.error('Backend startup failed:', error.message));
    process.once('exit', stop);
    // Do not serve the initial page until its API can accept requests.
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error('Локальный сервис завершился при запуске');
      try {
        const ready = await fetch(`http://127.0.0.1:${port}/api/health`, {
          headers: { 'x-snab-key': key }, signal: AbortSignal.timeout(1000),
        });
        if (ready.ok) return;
      } catch { /* The child may still be importing its runtime. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    stop();
    throw new Error('Локальный сервис не запустился');
  }
  const plugin: Plugin = {
    name: 'snabdika-local-backend',
    async configureServer(server) { await start(); server.httpServer?.once('close', stop); },
    async configurePreviewServer(server) { await start(); server.httpServer.once('close', stop); },
  };
  return { plugin, proxy: { '/api': { target: `http://127.0.0.1:${port}`, changeOrigin: true, headers: { 'x-snab-key': key } } } };
}
