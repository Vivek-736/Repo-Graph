import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

export interface TarExtractResult {
  extractedPath: string;
  rootPrefix: string;
  filesExtracted: number;
}

/**
 * Pure TypeScript POSIX ustar / GNU tar archive extractor.
 * Decompresses .tar.gz using node:zlib and extracts files into targetDir.
 * Zero external dependencies.
 */
export function extractTarGz(tarGzBuffer: Buffer, targetDir: string): TarExtractResult {
  // 1. Decompress gzip
  const tarBuffer = zlib.gunzipSync(tarGzBuffer);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let offset = 0;
  let rootPrefix = "";
  let filesExtracted = 0;

  while (offset + 512 <= tarBuffer.length) {
    const headerBlock = tarBuffer.subarray(offset, offset + 512);

    // Check for end-of-archive marker (block of all zeros)
    let isAllZero = true;
    for (let i = 0; i < 512; i++) {
      if (headerBlock[i] !== 0) {
        isAllZero = false;
        break;
      }
    }
    if (isAllZero) {
      break;
    }

    // Read tar header fields
    let rawName = headerBlock.subarray(0, 100).toString("utf8").replace(/\0.*$/, "").trim();
    const sizeStr = headerBlock.subarray(124, 136).toString("utf8").replace(/\0.*$/, "").trim();
    const typeFlag = String.fromCharCode(headerBlock[156]);
    const ustarIndicator = headerBlock.subarray(257, 263).toString("utf8").replace(/\0.*$/, "").trim();
    const prefix = ustarIndicator.startsWith("ustar")
      ? headerBlock.subarray(345, 500).toString("utf8").replace(/\0.*$/, "").trim()
      : "";

    let fullName = prefix ? `${prefix}/${rawName}` : rawName;
    fullName = fullName.replace(/\\/g, "/");

    // Capture the top-level folder prefix (e.g. "owner-repo-sha/")
    const slashIdx = fullName.indexOf("/");
    if (slashIdx !== -1 && !rootPrefix) {
      rootPrefix = fullName.slice(0, slashIdx);
    }

    const fileSize = parseInt(sizeStr, 8) || 0;
    offset += 512; // Advance past header

    // Strip top-level prefix so files are placed directly in targetDir
    let relativePath = fullName;
    if (rootPrefix && relativePath.startsWith(`${rootPrefix}/`)) {
      relativePath = relativePath.slice(rootPrefix.length + 1);
    }

    // Prevent path traversal
    const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
    if (!safePath || safePath === "." || safePath === "..") {
      offset += Math.ceil(fileSize / 512) * 512;
      continue;
    }

    const destination = path.join(targetDir, safePath);

    // Type 5: directory
    if (typeFlag === "5" || fullName.endsWith("/")) {
      if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
      }
    } else if (typeFlag === "0" || typeFlag === "\0" || typeFlag === "") {
      // Normal regular file
      const dir = path.dirname(destination);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const fileData = tarBuffer.subarray(offset, offset + fileSize);
      fs.writeFileSync(destination, fileData);
      filesExtracted++;
    }

    // Tar blocks are padded to 512 bytes
    offset += Math.ceil(fileSize / 512) * 512;
  }

  return {
    extractedPath: targetDir,
    rootPrefix,
    filesExtracted,
  };
}