import { spawn, ChildProcess } from 'node:child_process';
import * as http from 'node:http';
import { readInstanceFile, AimonInstance } from './instanceFile';

export function spawnAimonServer(aimonParentDir: string, pythonBin = 'python3'): ChildProcess {
  // Không truyền --new: nếu instance khác (vd app macOS standalone) đã chạy,
  // server.py tự phát hiện và tiến trình này thoát ngay sau khi in URL cũ —
  // an toàn để SIGTERM sau đó (stopAimonServer) vì tiến trình đã tự thoát rồi.
  return spawn(pythonBin, ['-m', 'aimon.server', '--port', '0'], {
    cwd: aimonParentDir,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
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
