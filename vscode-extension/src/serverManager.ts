import { spawn, ChildProcess } from 'node:child_process';
import * as http from 'node:http';
import { readInstanceFile, AimonInstance } from './instanceFile';

export function spawnAimonServer(aimonParentDir: string, pythonBin = 'python3'): ChildProcess {
  const proc = spawn(pythonBin, ['-m', 'aimon.server', '--port', '0'], {
    cwd: aimonParentDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Tránh Node throw khi pythonBin không tồn tại trên PATH (vd Windows chỉ có `python`).
  // waitForServer() sẽ tự timeout vì instance.json không bao giờ xuất hiện.
  proc.on('error', () => {});
  return proc;
}

export function probeVersion(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/api/version', timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function waitForServer(
  pollIntervalMs = 300,
  timeoutMs = 15000,
  readFn: () => AimonInstance | null = readInstanceFile
): Promise<AimonInstance> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const instance = readFn();
    if (instance) {
      const alive = await probeVersion(instance.host, instance.port);
      if (alive) return instance;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error('aimon server did not start within timeout');
}

export function stopAimonServer(proc: ChildProcess): void {
  if (!proc.killed) {
    proc.kill('SIGTERM');
  }
}
