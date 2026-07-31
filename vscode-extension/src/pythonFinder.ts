import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Dò Python thật sự có trên máy thay vì đoán tên binary.
 *
 * Mục tiêu: cài extension xong là dùng được, không phải cấu hình gì. Vì vậy không dựa vào
 * mỗi PATH - máy Windows cài Python từ python.org mà quên tick "Add to PATH" là chuyện rất
 * thường, và lúc đó `python` trên PATH lại là alias Microsoft Store.
 *
 * Nguyên tắc: mọi ứng viên đều phải **tự khai phiên bản bằng cách chạy thật**. Không suy
 * đoán từ tên file hay đường dẫn. Ứng viên nào không chạy được, hoặc dưới 3.9, thì loại.
 */

export const MIN_PYTHON: readonly [number, number] = [3, 9];

export interface PythonCandidate {
  /** Đường dẫn tuyệt đối, hoặc tên binary để tra trên PATH. */
  command: string;
  /** Tham số đứng trước module, ví dụ ['-3'] cho py launcher. */
  args: string[];
  /** Nguồn phát hiện, chỉ dùng để báo lỗi cho dễ hiểu. */
  source: string;
}

export interface PythonFound extends PythonCandidate {
  version: [number, number];
}

function run(
  command: string,
  args: string[],
  timeoutMs = 8000
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: timeoutMs, windowsHide: true, encoding: 'utf8' },
      (err, stdout, stderr) => {
        const code = err && typeof (err as { code?: unknown }).code === 'number'
          ? ((err as { code: number }).code)
          : err
            ? 1
            : 0;
        resolve({ code, stdout: stdout || '', stderr: stderr || '' });
      }
    );
  });
}

/**
 * `py -0p` liệt kê mọi Python đã đăng ký với launcher, kèm đường dẫn thật:
 *
 *   -V:3.13 *        C:\Users\me\AppData\Local\Programs\Python\Python313\python.exe
 *   -V:3.11          C:\Python311\python.exe
 *
 * Định dạng đổi vài lần qua các bản Windows nên chỉ bắt đúng thứ chắc chắn: đường dẫn tới
 * python.exe nằm ở cuối dòng.
 */
export function parsePyLauncherPaths(stdout: string): string[] {
  const out: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/([A-Za-z]:\\[^\r\n]*?python(?:w)?\.exe)\s*$/i);
    if (m) out.push(m[1]);
  }
  return out;
}

/** `where`/`which` trả về nhiều dòng, mỗi dòng một đường dẫn. */
export function parseWhichOutput(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Alias App Execution của Microsoft Store là file 0 byte trong WindowsApps. CHẠY nó sẽ mở
 * trang Store - không được để việc dò Python gây ra chuyện đó, nên bỏ qua từ trước.
 *
 * Chỉ bỏ khi vừa nằm trong WindowsApps VỪA 0 byte: bản Python cài thật từ Store cũng nằm
 * trong thư mục đó nhưng là file có kích thước thật, và nó dùng được.
 */
export function isStoreAliasStub(filePath: string, statSize: (p: string) => number | null): boolean {
  if (!/\\WindowsApps\\/i.test(filePath)) return false;
  const size = statSize(filePath);
  return size === 0;
}

function safeSize(p: string): number | null {
  try {
    return fs.statSync(p).size;
  } catch {
    return null;
  }
}

function existsFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Các thư mục cài mặc định, dùng khi Python có trên máy nhưng không có trên PATH. */
export function wellKnownPaths(platform: string, env: NodeJS.ProcessEnv, home: string): string[] {
  const out: string[] = [];
  if (platform === 'win32') {
    const roots = [
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Python'),
      env.PROGRAMFILES && path.join(env.PROGRAMFILES, 'Python'),
      'C:\\',
    ].filter((x): x is string => Boolean(x));
    for (const root of roots) {
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(root);
      } catch {
        continue;
      }
      for (const name of entries) {
        if (!/^Python3\d+$/i.test(name)) continue;
        out.push(path.join(root, name, 'python.exe'));
      }
    }
  } else {
    out.push(
      '/opt/homebrew/bin/python3',
      '/usr/local/bin/python3',
      path.join(home, '.pyenv', 'shims', 'python3'),
      '/usr/bin/python3'
    );
  }
  return out;
}

/**
 * Dựng danh sách ứng viên theo thứ tự ưu tiên. Chưa kiểm tra gì - việc đó do `verify` làm.
 *
 * Windows để `py -3` lên đầu vì py.exe là launcher chính thức và không bao giờ trỏ về alias
 * Store. macOS/Linux để `python3` trên PATH lên đầu để tôn trọng pyenv/homebrew của người
 * dùng, `/usr/bin/python3` xuống cuối (trên macOS nó là stub của Command Line Tools, gọi khi
 * chưa cài CLT sẽ bật hộp thoại cài đặt).
 */
export function orderedCandidates(
  platform: string,
  fromLauncher: string[],
  fromPath: string[],
  fromWellKnown: string[]
): PythonCandidate[] {
  const out: PythonCandidate[] = [];
  const seen = new Set<string>();
  const push = (command: string, args: string[], source: string) => {
    const key = `${command} ${args.join(' ')}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ command, args, source });
  };

  if (platform === 'win32') {
    push('py', ['-3'], 'py launcher');
  }
  for (const p of fromLauncher) push(p, [], 'py -0p');
  for (const p of fromPath) push(p, [], 'PATH');
  if (platform !== 'win32') {
    push('python3', [], 'PATH');
    push('python', [], 'PATH');
  }
  for (const p of fromWellKnown) push(p, [], 'thư mục cài mặc định');
  return out;
}

const VERSION_PROBE = 'import sys;print("AIMONPY",sys.version_info[0],sys.version_info[1])';

export function parseVersionProbe(stdout: string): [number, number] | null {
  const m = stdout.match(/AIMONPY\s+(\d+)\s+(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

export function meetsMinimum(v: [number, number]): boolean {
  return v[0] > MIN_PYTHON[0] || (v[0] === MIN_PYTHON[0] && v[1] >= MIN_PYTHON[1]);
}

/** Chạy thật ứng viên để hỏi phiên bản. Không in được version = loại, không cần đoán vì sao. */
export async function verifyCandidate(c: PythonCandidate): Promise<PythonFound | null> {
  const res = await run(c.command, [...c.args, '-c', VERSION_PROBE]);
  const version = parseVersionProbe(res.stdout);
  if (!version || !meetsMinimum(version)) return null;
  return { ...c, version };
}

async function discoverPaths(platform: string): Promise<{ launcher: string[]; onPath: string[] }> {
  const launcher: string[] = [];
  const onPath: string[] = [];

  if (platform === 'win32') {
    const res = await run('py', ['-0p']);
    launcher.push(...parsePyLauncherPaths(res.stdout));
    for (const name of ['python.exe', 'python3.exe']) {
      const w = await run('where', [name]);
      onPath.push(...parseWhichOutput(w.stdout));
    }
  } else {
    for (const name of ['python3', 'python']) {
      const w = await run('which', ['-a', name]);
      onPath.push(...parseWhichOutput(w.stdout));
    }
  }
  return { launcher, onPath };
}

/**
 * Trả về mọi Python >= 3.9 tìm được, theo thứ tự ưu tiên. Mảng rỗng nghĩa là máy thật sự
 * chưa có Python - lúc đó mới nên bảo người dùng đi cài.
 */
export async function findPythons(
  platform: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): Promise<PythonFound[]> {
  const { launcher, onPath } = await discoverPaths(platform);
  const wellKnown = wellKnownPaths(platform, env, home).filter(existsFile);

  const candidates = orderedCandidates(platform, launcher, onPath, wellKnown).filter((c) => {
    // Bỏ alias Store trước khi chạy, kẻo việc dò lại tự mở trang Microsoft Store.
    if (path.isAbsolute(c.command) && isStoreAliasStub(c.command, safeSize)) return false;
    return true;
  });

  const found: PythonFound[] = [];
  for (const c of candidates) {
    const ok = await verifyCandidate(c);
    if (ok) found.push(ok);
  }
  return found;
}
