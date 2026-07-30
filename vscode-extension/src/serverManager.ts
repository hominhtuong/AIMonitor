import { spawn, ChildProcess } from 'node:child_process';
import * as http from 'node:http';
import { readInstanceFile, AimonInstance } from './instanceFile';

/** Tên binary Python thử lần lượt. Windows (cài từ python.org) thường chỉ có `python`,
 * không có `python3`. Không thử `py -3` để giữ đơn giản - đủ dùng cho macOS/Linux/Windows
 * phổ biến. */
export const DEFAULT_PYTHON_CANDIDATES = ['python3', 'python'];

const MAX_STDERR_LEN = 2000;

export interface SpawnInfo {
  pythonBin: string;
  stderr: string;
  enoent: boolean;
}

// Gắn kèm thông tin lỗi/stderr theo từng ChildProcess mà không đổi kiểu ChildProcess.
const spawnInfoByProc = new WeakMap<ChildProcess, SpawnInfo>();

export function getSpawnInfo(proc: ChildProcess): SpawnInfo | undefined {
  return spawnInfoByProc.get(proc);
}

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

function spawnOnce(pythonBin: string, aimonParentDir: string): ChildProcess {
  const proc = spawn(pythonBin, ['-m', 'aimon.server', '--port', '0'], {
    cwd: aimonParentDir,
    // stdout không cần đọc -> 'ignore'. stderr PHẢI được đọc (finding 5): nếu để 'pipe' mà
    // không ai đọc, buffer OS đầy sẽ làm server Python block ghi vĩnh viễn.
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const info: SpawnInfo = { pythonBin, stderr: '', enoent: false };
  spawnInfoByProc.set(proc, info);
  proc.stderr?.on('data', (chunk: Buffer) => {
    info.stderr = (info.stderr + chunk.toString()).slice(-MAX_STDERR_LEN);
  });
  proc.on('error', (err) => {
    if (isEnoent(err)) info.enoent = true;
  });
  return proc;
}

function waitForSpawnOutcome(proc: ChildProcess): Promise<'spawn' | 'error'> {
  return new Promise((resolve) => {
    proc.once('spawn', () => resolve('spawn'));
    proc.once('error', () => resolve('error'));
  });
}

/**
 * Spawn server aimon, thử lần lượt các candidate binary Python. Khi candidate hiện tại lỗi
 * ENOENT (không có trên PATH), tự động thử candidate kế tiếp. Trả về ChildProcess của lần
 * spawn thành công, hoặc lần cuối cùng (kèm SpawnInfo để caller đọc lỗi) nếu mọi candidate
 * đều thất bại.
 */
export async function spawnAimonServer(
  aimonParentDir: string,
  pythonBinCandidates: string[] = DEFAULT_PYTHON_CANDIDATES
): Promise<ChildProcess> {
  const candidates = pythonBinCandidates.length > 0 ? pythonBinCandidates : DEFAULT_PYTHON_CANDIDATES;
  let lastProc: ChildProcess | undefined;

  for (let i = 0; i < candidates.length; i++) {
    const proc = spawnOnce(candidates[i], aimonParentDir);
    lastProc = proc;
    const outcome = await waitForSpawnOutcome(proc);
    if (outcome === 'spawn') {
      return proc;
    }
    const info = spawnInfoByProc.get(proc);
    const hasMoreCandidates = i < candidates.length - 1;
    if (info?.enoent && hasMoreCandidates) {
      continue; // thử binary tiếp theo
    }
    return proc; // hết candidate hoặc lỗi khác ENOENT - trả về để caller đọc SpawnInfo
  }
  return lastProc as ChildProcess;
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

function buildTimeoutMessage(proc?: ChildProcess): string {
  const base = 'aimon server did not start within timeout';
  if (!proc) return base;
  const info = getSpawnInfo(proc);
  if (!info) return base;
  if (info.enoent) {
    return (
      `${base}: python binary "${info.pythonBin}" not found on PATH. ` +
      'Install Python 3 (https://www.python.org/downloads/) and ensure "python3" or "python" is on PATH.'
    );
  }
  if (info.stderr.trim()) {
    return `${base}. Server stderr:\n${info.stderr.trim()}`;
  }
  return base;
}

export async function waitForServer(
  pollIntervalMs = 300,
  timeoutMs = 15000,
  readFn: () => AimonInstance | null = readInstanceFile,
  proc?: ChildProcess
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
  throw new Error(buildTimeoutMessage(proc));
}

export function stopAimonServer(proc: ChildProcess): void {
  if (!proc.killed) {
    proc.kill('SIGTERM');
  }
}
