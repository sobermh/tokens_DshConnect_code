import { inflateRawSync } from 'node:zlib';

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;

function requireRange(buffer, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length)
    || offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`dws archive: invalid ${label}`);
  }
}

/** Normalize one ZIP entry to a safe relative slash-form path. */
export function normalizeZipEntryName(rawName) {
  if (typeof rawName !== 'string' || rawName === '' || rawName.includes('\0')
    || rawName.includes('\\') || rawName.startsWith('/') || /^[A-Za-z]:/.test(rawName)) {
    throw new Error(`dws archive: unsafe entry path: ${String(rawName)}`);
  }
  const directory = rawName.endsWith('/');
  const trimmed = directory ? rawName.slice(0, -1) : rawName;
  const parts = trimmed.split('/');
  if (parts.length === 0 || parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error(`dws archive: unsafe entry path: ${rawName}`);
  }
  return { name: parts.join('/'), directory };
}

function findEndOfCentralDirectory(zip) {
  const floor = Math.max(0, zip.length - 22 - 0xffff);
  for (let offset = zip.length - 22; offset >= floor; offset -= 1) {
    if (zip.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) return offset;
  }
  throw new Error('dws archive: zip end-of-central-directory not found');
}

/**
 * Read selected regular files from a checksum-verified ZIP archive.
 * Paths are validated before selection or decompression.
 */
export function readZipEntries(zip, {
  select = () => true,
  maxEntrySize = 32 * 1024 * 1024,
  maxTotalSize = 128 * 1024 * 1024,
} = {}) {
  const eocd = findEndOfCentralDirectory(zip);
  requireRange(zip, eocd, 22, 'end-of-central-directory');
  const count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  const entries = [];
  let totalSize = 0;

  for (let index = 0; index < count; index += 1) {
    requireRange(zip, offset, 46, 'central-directory entry');
    if (zip.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE) {
      throw new Error('dws archive: corrupt zip central directory');
    }
    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    requireRange(zip, offset + 46, nameLength + extraLength + commentLength, 'central-directory data');
    const rawName = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    const normalized = normalizeZipEntryName(rawName);
    offset += 46 + nameLength + extraLength + commentLength;

    if (normalized.directory || !select(normalized.name)) continue;
    if ((flags & 0x1) !== 0) throw new Error('dws archive: encrypted entries are not supported');
    if (method !== 0 && method !== 8) throw new Error(`dws archive: unsupported compression method ${method}`);
    if (uncompressedSize > maxEntrySize || totalSize + uncompressedSize > maxTotalSize) {
      throw new Error('dws archive: extracted content is too large');
    }

    requireRange(zip, localOffset, 30, 'local header');
    if (zip.readUInt32LE(localOffset) !== ZIP_LOCAL_SIGNATURE) {
      throw new Error('dws archive: corrupt zip local header');
    }
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    requireRange(zip, dataOffset, compressedSize, 'compressed entry');
    const compressed = zip.subarray(dataOffset, dataOffset + compressedSize);
    const data = method === 0
      ? Buffer.from(compressed)
      : inflateRawSync(compressed, { maxOutputLength: maxEntrySize });
    if (data.length !== uncompressedSize) {
      throw new Error(`dws archive: size mismatch for ${normalized.name}`);
    }
    totalSize += data.length;
    entries.push({ name: normalized.name, data });
  }
  return entries;
}
