import { config } from "../config.ts";

export interface VaultFile {
  relativePath: string;
  absolutePath: string;
  mtime: Date;
}

export async function scanVault(vaultPath: string = config.vaultPath): Promise<VaultFile[]> {
  const glob = new Bun.Glob("**/*.md");
  const files: VaultFile[] = [];

  for await (const relativePath of glob.scan({ cwd: vaultPath, absolute: false })) {
    // Skip Obsidian system files
    if (relativePath.startsWith(".obsidian/") || relativePath.startsWith(".trash/")) continue;

    const absolutePath = `${vaultPath}/${relativePath}`;
    const file = Bun.file(absolutePath);
    files.push({
      relativePath,
      absolutePath,
      mtime: new Date(file.lastModified),
    });
  }

  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
