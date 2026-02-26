/**
 * Parse MD5 checksums from file content.
 * Supports formats:
 *   md5hash  filename
 *   md5hash *filename
 *   MD5 (filename) = md5hash
 */
export function parseMd5Content(content: string): Map<string, string> {
  const map = new Map<string, string>();

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    // BSD format: MD5 (filename) = hash
    if (line.startsWith("MD5 (") || line.startsWith("md5 (")) {
      const eqIdx = line.indexOf(") = ");
      if (eqIdx !== -1) {
        const filename = line.slice(line.indexOf("(") + 1, eqIdx);
        const hash = line.slice(eqIdx + 4).trim();
        const basename = filename.split("/").pop() ?? filename;
        map.set(basename, hash.toLowerCase());
      }
      continue;
    }

    // Standard format: hash  filename  OR  hash *filename
    const match = line.match(/^([a-fA-F0-9]{32})\s+\*?(.+)$/);
    if (match) {
      const hash = match[1];
      const filename = match[2].trim();
      const basename = filename.split("/").pop() ?? filename;
      if (basename) {
        map.set(basename, hash.toLowerCase());
      }
    }
  }

  return map;
}
