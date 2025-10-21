import * as fs from "fs/promises";
import { ExfatReader } from "../src/exfat";
import * as path from "path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

const EXFAT_IMAGE = path.join(
  rootDir,
  "../exfat/SDGB_A007_20250619173010_0.exfat"
);

const OUTPUT_DIR = path.join(rootDir, "../exfat/SDGB_A007_20250619173010_0");

async function main() {
  const reader = new ExfatReader(await fs.readFile(EXFAT_IMAGE));
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  for await (const e of reader.walk("/")) {
    if (e.isDir) {
      await fs.mkdir(path.join(OUTPUT_DIR, e.path), { recursive: true });
    } else {
      await fs.writeFile(path.join(OUTPUT_DIR, e.path), Buffer.from(e.read!()));
    }
  }
}

main();
