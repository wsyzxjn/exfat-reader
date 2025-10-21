type BytesLike = Uint8Array | ArrayBuffer;

type Boot = {
  sectorSize: number;
  clusterSize: number;
  fatOffsetBytes: number;
  fatLengthBytes: number;
  clusterHeapOffsetBytes: number;
  clusterCount: number;
  rootDirCluster: number;
};

type DirEntry = {
  name: string;
  isDir: boolean;
  size: number;
  firstCluster: number;
};

const TD16 = new TextDecoder("utf-16le");

function toUint8(b: BytesLike): Uint8Array {
  return b instanceof Uint8Array ? b : new Uint8Array(b);
}

function dv(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

function readU32(d: DataView, o: number): number {
  return d.getUint32(o, true);
}

function readU64(d: DataView, o: number): number {
  const lo = d.getUint32(o, true);
  const hi = d.getUint32(o + 4, true);
  return hi * 2 ** 32 + lo;
}

function parseBoot(buf: Uint8Array): Boot {
  const d = dv(buf);
  const bytesPerSectorShift = buf[0x6c];
  const sectorsPerClusterShift = buf[0x6d];
  const sectorSize = 1 << bytesPerSectorShift;
  const clusterSize = sectorSize * (1 << sectorsPerClusterShift);
  const fatOffset = readU32(d, 0x50);
  const fatLength = readU32(d, 0x54);
  const clusterHeapOffset = readU32(d, 0x58);
  const clusterCount = readU32(d, 0x5c);
  const rootDirCluster = readU32(d, 0x60);
  return {
    sectorSize,
    clusterSize,
    fatOffsetBytes: fatOffset * sectorSize,
    fatLengthBytes: fatLength * sectorSize,
    clusterHeapOffsetBytes: clusterHeapOffset * sectorSize,
    clusterCount,
    rootDirCluster,
  };
}

function clusterOffset(boot: Boot, cluster: number): number {
  return boot.clusterHeapOffsetBytes + (cluster - 2) * boot.clusterSize;
}

function readFATNext(buf: Uint8Array, boot: Boot, cluster: number): number {
  const off = boot.fatOffsetBytes + cluster * 4;
  if (off + 4 > buf.length) return 0xffffffff;
  const d = dv(buf);
  return d.getUint32(off, true);
}

function isEndOfChain(v: number): boolean {
  return v >= 0xfffffff8 || v === 0xffffffff || v === 0;
}

function readChain(
  buf: Uint8Array,
  boot: Boot,
  startCluster: number,
  limitBytes?: number
): Uint8Array {
  const chunks: Uint8Array[] = [];
  let remaining = typeof limitBytes === "number" ? limitBytes : undefined;
  let c = startCluster;
  while (c >= 2 && c < 0x0fffffff) {
    const off = clusterOffset(boot, c);
    const size = boot.clusterSize;
    const slice = buf.subarray(off, off + size);
    if (remaining === undefined) {
      chunks.push(slice);
    } else {
      if (remaining <= 0) break;
      chunks.push(slice.subarray(0, Math.min(slice.length, remaining)));
      remaining -= Math.min(slice.length, remaining);
    }
    const next = readFATNext(buf, boot, c);
    if (isEndOfChain(next)) break;
    c = next;
  }
  if (chunks.length === 1) return chunks[0];
  let total = 0;
  for (const s of chunks) total += s.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const s of chunks) {
    out.set(s, p);
    p += s.length;
  }
  return out;
}

function readDirectory(
  buf: Uint8Array,
  boot: Boot,
  startCluster: number
): DirEntry[] {
  const data = readChain(buf, boot, startCluster);
  const d = dv(data);
  const res: DirEntry[] = [];
  let i = 0;
  while (i + 32 <= data.length) {
    const et = data[i];
    if (et === 0x00) {
      i += 32;
      continue;
    }
    if (et === 0x85) {
      const secondaryCount = data[i + 1];
      let isDir = (data[i + 4] & 0x10) !== 0;
      let name = "";
      let firstCluster = 0;
      let size = 0;
      let consumed = 1;
      let j = i + 32;
      while (consumed <= secondaryCount && j + 32 <= data.length) {
        const st = data[j];
        if (st === 0xc0) {
          firstCluster = readU32(d, j + 0x14);
          size = Number(readU64(d, j + 0x18));
          consumed++;
          j += 32;
          continue;
        }
        if (st === 0xc1) {
          const part = data.subarray(j + 2, j + 32);
          name += TD16.decode(part);
          consumed++;
          j += 32;
          continue;
        }
        consumed++;
        j += 32;
      }
      name = name.replace(/\u0000+$/g, "");
      res.push({ name, isDir, size, firstCluster });
      i = j;
      continue;
    }
    i += 32;
  }
  return res;
}

function normalizePath(p: string): string[] {
  const parts = p.split("/").filter(Boolean);
  return parts;
}

export type ExfatListItem = {
  name: string;
  isDir: boolean;
  size: number;
};

export type ExfatWalkItem = {
  path: string;
  isDir: boolean;
  size: number;
  read?: () => Uint8Array;
};

export class ExfatReader {
  private buf: Uint8Array;
  private boot: Boot;

  constructor(image: BytesLike) {
    const b = toUint8(image);
    this.buf = b;
    this.boot = parseBoot(b);
  }

  list(path: string = "/"): ExfatListItem[] {
    const parts = normalizePath(path);
    let cluster = this.boot.rootDirCluster;
    for (const part of parts) {
      const entries = readDirectory(this.buf, this.boot, cluster);
      const next = entries.find(e => e.isDir && e.name === part);
      if (!next) return [];
      cluster = next.firstCluster;
    }
    const out = readDirectory(this.buf, this.boot, cluster);
    return out.map(e => ({ name: e.name, isDir: e.isDir, size: e.size }));
  }

  exists(path: string): boolean {
    const parts = normalizePath(path);
    let cluster = this.boot.rootDirCluster;
    for (let idx = 0; idx < parts.length; idx++) {
      const part = parts[idx];
      const entries = readDirectory(this.buf, this.boot, cluster);
      const last = idx === parts.length - 1;
      const found = entries.find(e => e.name === part && (last || e.isDir));
      if (!found) return false;
      cluster = found.firstCluster;
    }
    return true;
  }

  readFile(path: string): Uint8Array | null {
    const parts = normalizePath(path);
    let cluster = this.boot.rootDirCluster;
    for (let idx = 0; idx < parts.length; idx++) {
      const part = parts[idx];
      const entries = readDirectory(this.buf, this.boot, cluster);
      const last = idx === parts.length - 1;
      const found = entries.find(
        e => e.name === part && (!last ? e.isDir : !e.isDir)
      );
      if (!found) return null;
      if (last) {
        return readChain(this.buf, this.boot, found.firstCluster, found.size);
      }
      cluster = found.firstCluster;
    }
    return null;
  }

  walk(path: string = "/"): ExfatWalkItem[] {
    const parts = normalizePath(path);
    let cluster = this.boot.rootDirCluster;
    for (const part of parts) {
      const entries = readDirectory(this.buf, this.boot, cluster);
      const next = entries.find(e => e.isDir && e.name === part);
      if (!next) return [];
      cluster = next.firstCluster;
    }
    const result: ExfatWalkItem[] = [];
    const basePath = parts.length ? `/${parts.join("/")}` : "/";
    const visit = (currentPath: string, c: number) => {
      const entries = readDirectory(this.buf, this.boot, c);
      for (const e of entries) {
        const p = currentPath === "/" ? `/${e.name}` : `${currentPath}/${e.name}`;
        if (e.isDir) {
          result.push({ path: p, isDir: true, size: e.size });
          visit(p, e.firstCluster);
        } else {
          result.push({
            path: p,
            isDir: false,
            size: e.size,
            read: () => readChain(this.buf, this.boot, e.firstCluster, e.size),
          });
        }
      }
    };
    visit(basePath, cluster);
    return result;
  }
}

export function createExfatReader(image: BytesLike): ExfatReader {
  return new ExfatReader(image);
}
