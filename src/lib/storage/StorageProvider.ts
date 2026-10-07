import { promises as fs } from "node:fs";
import path from "node:path";
export interface StorageProvider {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
  resolve(key: string): string;
}
export const dataDirectory = () =>
  path.resolve(process.env.STORYMOTION_DATA_DIR || "data");
export class FileSystemStorage implements StorageProvider {
  constructor(private root = dataDirectory()) {}
  resolve(key: string) {
    if (
      !/^[a-zA-Z0-9/_\-.]+$/.test(key) ||
      key.includes("..") ||
      path.isAbsolute(key)
    )
      throw new Error("Ruta de almacenamiento inválida");
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root + path.sep))
      throw new Error("Ruta fuera del almacenamiento");
    return target;
  }
  async put(key: string, data: Uint8Array) {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temp, data);
    await fs.rename(temp, target);
  }
  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }
  async exists(key: string) {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}
