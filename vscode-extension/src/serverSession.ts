import { ChildProcess } from 'node:child_process';
import {
  startWithDiscoveredPython,
  shutdownAimonServer,
  probeVersion,
  SpawnOptions,
} from './serverManager';
import { readInstanceFile, AimonInstance } from './instanceFile';
import { verifyCandidate, findPythons, PythonFound } from './pythonFinder';
import { AimonConfig } from './config';

/**
 * Một server cho cả cửa sổ, dùng chung giữa panel sidebar, tab dashboard và thanh trạng thái.
 *
 * Trước đây provider của sidebar tự giữ tiến trình. Thêm tab và thanh trạng thái vào thì ba
 * nơi cùng muốn một server, mà ai đóng trước cũng giết nó - nên phải đếm người dùng: server
 * chỉ tắt khi KHÔNG còn ai giữ.
 */
export class AimonServerSession {
  private proc: ChildProcess | undefined;
  private ownInstance: AimonInstance | undefined;
  private holders = new Set<string>();
  private starting: Promise<AimonInstance> | undefined;

  constructor(private readonly aimonParentDir: string, private config: AimonConfig) {}

  setConfig(config: AimonConfig): void {
    this.config = config;
  }

  /** Instance đang sống, KHÔNG bật server mới. Thanh trạng thái dùng cái này để không
   * biến việc mở VSCode thành việc chạy thêm một tiến trình Python. */
  async peek(): Promise<AimonInstance | null> {
    if (this.ownInstance && (await probeVersion(this.ownInstance.host, this.ownInstance.port))) {
      return this.ownInstance;
    }
    const existing = readInstanceFile();
    if (existing && (await probeVersion(existing.host, existing.port))) return existing;
    return null;
  }

  /** Giữ chỗ và lấy server, bật mới nếu cần. Nhiều lời gọi song song chỉ bật một lần. */
  async acquire(holder: string): Promise<AimonInstance> {
    this.holders.add(holder);
    if (this.starting) return this.starting;
    this.starting = this.resolve().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  private async resolve(): Promise<AimonInstance> {
    if (this.config.reuseRunningInstance) {
      const alive = await this.peek();
      if (alive) return alive;
    } else if (this.ownInstance) {
      const mine = await probeVersion(this.ownInstance.host, this.ownInstance.port);
      if (mine) return this.ownInstance;
    }

    await this.stopOwn();
    const started = await startWithDiscoveredPython(
      this.aimonParentDir,
      () => this.pythons(),
      undefined,
      this.spawnOptions()
    );
    this.proc = started.proc;
    this.ownInstance = started.instance;
    return started.instance;
  }

  private spawnOptions(): SpawnOptions {
    return {
      port: this.config.serverPort,
      claudeDataDir: this.config.claudeDataDir || undefined,
      pricingFile: this.config.pricingFile || undefined,
    };
  }

  /**
   * Người dùng chỉ đích danh một interpreter thì thử đúng bản đó trước - nhưng vẫn phải qua
   * bước chạy thử và kiểm phiên bản. Đường dẫn cũ trỏ tới bản Python đã gỡ mà làm panel chết
   * cứng thì còn tệ hơn không có settings.
   */
  private async pythons(): Promise<PythonFound[]> {
    const pinned = this.config.pythonPath;
    if (pinned) {
      const ok = await verifyCandidate({ command: pinned, args: [], source: 'aimon.pythonPath' });
      if (ok) return [ok];
      // Không dùng được thì rơi về tự dò, đừng bỏ cuộc.
    }
    return findPythons();
  }

  async release(holder: string): Promise<void> {
    this.holders.delete(holder);
    if (this.holders.size === 0) await this.stopOwn();
  }

  private async stopOwn(): Promise<void> {
    const proc = this.proc;
    const instance = this.ownInstance;
    this.proc = undefined;
    this.ownInstance = undefined;
    if (proc) await shutdownAimonServer(proc, instance);
  }

  async dispose(): Promise<void> {
    this.holders.clear();
    await this.stopOwn();
  }
}
