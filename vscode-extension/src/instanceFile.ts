import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface AimonInstance {
  host: string;
  port: number;
  pid: number;
}

export function instanceFilePath(): string {
  return path.join(os.homedir(), '.aimon', 'instance.json');
}

export function readInstanceFile(filePath: string = instanceFilePath()): AimonInstance | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    typeof (data as Record<string, unknown>).host !== 'string' ||
    typeof (data as Record<string, unknown>).port !== 'number' ||
    typeof (data as Record<string, unknown>).pid !== 'number'
  ) {
    return null;
  }

  const record = data as Record<string, unknown>;
  return { host: record.host as string, port: record.port as number, pid: record.pid as number };
}
