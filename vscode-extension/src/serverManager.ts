import { spawn, ChildProcess } from 'node:child_process';
import * as http from 'node:http';
import { readInstanceFile, AimonInstance } from './instanceFile';

/**
 * Tên binary Python thử lần lượt, theo thứ tự ưu tiên của từng hệ điều hành. Mỗi mục có thể
 * kèm tham số (`py -3`), tách bằng khoảng trắng.
 *
 * Windows để `py -3` lên đầu là có lý do: `python` trên Windows 10/11 mặc định là App
 * Execution Alias của Microsoft Store. Khi máy chưa cài Python thật, alias đó vẫn nằm trên
 * PATH nên `spawn` KHÔNG báo ENOENT - nó chạy, mở trang Store rồi thoát ngay với mã 9009.
 * Nếu chỉ dựa vào ENOENT để chuyển candidate thì extension sẽ đứng chờ hết 15 giây rồi báo
 * timeout vô nghĩa. `py.exe` là launcher chính thức, có mặt khi cài từ python.org và không
 * bao giờ trỏ về alias Store.
 */
export function pythonCandidates(platform: string = process.platform): string[] {
  if (platform === 'win32') return ['py -3', 'python', 'python3'];
  return ['python3', 'python'];
}

/** Giữ lại cho tương thích: danh sách mặc định của hệ đang chạy. */
export const DEFAULT_PYTHON_CANDIDATES = pythonCandidates();

const MAX_STDERR_LEN = 2000;
const PYTHON_DOWNLOAD_URL = 'https://www.python.org/downloads/';

export interface SpawnInfo {
  /** Nguyên văn candidate, ví dụ 'py -3'. */
  pythonBin: string;
  stderr: string;
  enoent: boolean;
  /** Tiến trình đã thoát chưa (dùng để bỏ chờ sớm thay vì đợi hết timeout). */
  exited: boolean;
  exitCode: number | null;
}

// Gắn kèm thông tin lỗi/stderr theo từng ChildProcess mà không đổi kiểu ChildProcess.
const spawnInfoByProc = new WeakMap<ChildProcess, SpawnInfo>();

export function getSpawnInfo(proc: ChildProcess): SpawnInfo | undefined {
  return spawnInfoByProc.get(proc);
}

function isEnoent(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'ENOENT';
}

function spawnOnce(candidate: string, aimonParentDir: string): ChildProcess {
  const [bin, ...prefixArgs] = candidate.trim().split(/\s+/);
  const proc = spawn(bin, [...prefixArgs, '-m', 'aimon.server', '--port', '0'], {
    cwd: aimonParentDir,
    // stdout không cần đọc -> 'ignore'. stderr PHẢI được đọc: nếu để 'pipe' mà không ai đọc,
    // buffer OS đầy sẽ làm server Python block ghi vĩnh viễn.
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const info: SpawnInfo = { pythonBin: candidate, stderr: '', enoent: false, exited: false, exitCode: null };
  spawnInfoByProc.set(proc, info);
  proc.stderr?.on('data', (chunk: Buffer) => {
    info.stderr = (info.stderr + chunk.toString()).slice(-MAX_STDERR_LEN);
  });
  proc.on('error', (err) => {
    if (isEnoent(err)) info.enoent = true;
  });
  proc.on('exit', (code) => {
    info.exited = true;
    info.exitCode = code;
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
 *
 * Hàm này chỉ lo bước spawn. Chuyện "spawn được nhưng server không lên" (alias Store, thiếu
 * module...) do startAimonServer xử lý.
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

/**
 * Nhờ server tự tắt qua POST /api/quit thay vì giết thẳng.
 *
 * Trên Windows, `proc.kill('SIGTERM')` của Node dịch thành `TerminateProcess`: tiến trình
 * Python chết ngay, khối `finally` trong server.py không chạy, `~/.aimon/instance.json` ở lại
 * làm rác. `/api/quit` gọi `server.shutdown()` nên `serve_forever()` thoát êm và state được
 * dọn - cùng một đường trên cả ba hệ điều hành.
 */
export function requestQuit(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      { host, port, path: '/api/quit', method: 'POST', timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Dịch SpawnInfo thành câu giải thích cho người dùng. Tách riêng để test được không cần
 * dựng tiến trình thật - hành vi thoát-ngay-không-stderr chỉ xảy ra trên Windows. */
export function explainSpawnFailure(info: SpawnInfo): string {
  if (info.enoent) {
    return `"${info.pythonBin}" is not on PATH.`;
  }
  if (info.stderr.trim()) {
    return `"${info.pythonBin}" failed. Server stderr:\n${info.stderr.trim()}`;
  }
  if (info.exited) {
    // Không stderr mà vẫn thoát ngay: gần như chắc chắn là alias Microsoft Store trên
    // Windows (thoát 9009 và mở trang Store) hoặc một wrapper tương tự.
    return (
      `"${info.pythonBin}" exited immediately with code ${info.exitCode} without starting a server. ` +
      'On Windows this usually means "python" is the Microsoft Store placeholder, not a real ' +
      `interpreter. Install Python 3 from ${PYTHON_DOWNLOAD_URL} and tick "Add python.exe to PATH".`
    );
  }
  return `"${info.pythonBin}" started but the dashboard never came up.`;
}

function describeFailure(proc?: ChildProcess): string {
  if (!proc) return '';
  const info = getSpawnInfo(proc);
  return info ? explainSpawnFailure(info) : '';
}

function buildTimeoutMessage(proc?: ChildProcess): string {
  const base = 'aimon server did not start within timeout';
  const detail = describeFailure(proc);
  return detail ? `${base}: ${detail}` : base;
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
    // Tiến trình chết rồi thì chờ tiếp cũng vô ích - báo lỗi ngay để còn thử candidate khác.
    if (proc && getSpawnInfo(proc)?.exited) break;
    await delay(pollIntervalMs);
  }
  throw new Error(buildTimeoutMessage(proc));
}

export interface StartedServer {
  proc: ChildProcess;
  instance: AimonInstance;
}

/**
 * Bật server và chờ tới lúc thật sự trả lời được. Khác `spawnAimonServer` ở chỗ nó đi hết
 * vòng đời: candidate nào spawn được nhưng server không lên (alias Store, thiếu module,
 * Python quá cũ) thì giết đi rồi thử candidate kế tiếp, thay vì báo timeout và bỏ cuộc.
 */
export async function startAimonServer(
  aimonParentDir: string,
  pythonBinCandidates: string[] = DEFAULT_PYTHON_CANDIDATES,
  timeoutPerCandidateMs = 15000
): Promise<StartedServer> {
  const candidates = pythonBinCandidates.length > 0 ? pythonBinCandidates : DEFAULT_PYTHON_CANDIDATES;
  const problems: string[] = [];

  for (const candidate of candidates) {
    const proc = spawnOnce(candidate, aimonParentDir);
    const outcome = await waitForSpawnOutcome(proc);
    if (outcome === 'error') {
      problems.push(describeFailure(proc));
      continue;
    }
    try {
      const instance = await waitForServer(300, timeoutPerCandidateMs, readInstanceFile, proc);
      return { proc, instance };
    } catch {
      problems.push(describeFailure(proc));
      if (!getSpawnInfo(proc)?.exited) proc.kill('SIGTERM');
    }
  }

  throw new Error(
    'AI Monitor could not start a Python 3 interpreter.\n' +
      problems.filter(Boolean).map((p) => `- ${p}`).join('\n') +
      `\nInstall Python 3.9 or newer from ${PYTHON_DOWNLOAD_URL} and reload the window.`
  );
}

/**
 * Tắt server: xin tắt êm trước, hết hạn mới giết. Xem `requestQuit` để biết vì sao không
 * SIGTERM thẳng.
 */
export async function shutdownAimonServer(
  proc: ChildProcess,
  instance?: AimonInstance | null,
  graceMs = 1500
): Promise<void> {
  if (getSpawnInfo(proc)?.exited) return;

  if (instance) {
    const accepted = await requestQuit(instance.host, instance.port);
    if (accepted) {
      const deadline = Date.now() + graceMs;
      while (Date.now() < deadline) {
        if (getSpawnInfo(proc)?.exited) return;
        await delay(100);
      }
    }
  }
  stopAimonServer(proc);
}

export function stopAimonServer(proc: ChildProcess): void {
  if (!proc.killed) {
    proc.kill('SIGTERM');
  }
}
