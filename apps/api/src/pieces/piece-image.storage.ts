import { Injectable } from "@nestjs/common";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

@Injectable()
export class PieceImageStorage {
  private readonly root = resolve(
    process.env.MEDIA_ROOT?.trim() || join(process.cwd(), "storage", "media"),
  );

  async write(storageKey: string, buffer: Buffer): Promise<void> {
    const target = this.resolveKey(storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer, { flag: "wx" });
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.resolveKey(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    try {
      await unlink(this.resolveKey(storageKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private resolveKey(storageKey: string): string {
    if (!storageKey || isAbsolute(storageKey)) throw new Error("Invalid media storage key");
    const target = resolve(this.root, storageKey);
    const fromRoot = relative(this.root, target);
    if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
      throw new Error("Invalid media storage key");
    }
    return join(this.root, fromRoot);
  }
}
