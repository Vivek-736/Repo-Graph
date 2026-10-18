import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { extractTarGz } from "./tar";

export interface ParsedRepoUrl {
  owner: string;
  repo: string;
  ref?: string;
  normalizedUrl: string;
  projectName: string;
}

export interface FetchedRepo {
  extractedPath: string;
  commitHash: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  cleanUp: () => void;
}

/**
 * Parses GitHub URLs into owner, repo name, and optional ref/branch.
 * Handles forms like:
 * - https://github.com/facebook/react
 * - https://github.com/facebook/react.git
 * - https://github.com/facebook/react/tree/main
 * - github.com/facebook/react
 */
export function parseGitHubUrl(rawUrl: string): ParsedRepoUrl {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error("Repository URL cannot be empty");
  }

  // Strip git+ or git@ prefixes if present
  let clean = trimmed.replace(/^git\+/, "").replace(/\.git$/, "");
  if (clean.startsWith("git@github.com:")) {
    clean = `https://github.com/${clean.replace("git@github.com:", "")}`;
  } else if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    clean = `https://${clean}`;
  }

  let urlObj: URL;
  try {
    urlObj = new URL(clean);
  } catch {
    throw new Error(`Invalid repository URL: ${rawUrl}`);
  }

  if (urlObj.hostname !== "github.com" && urlObj.hostname !== "www.github.com") {
    throw new Error(`Only public GitHub repositories are supported. Received: ${urlObj.hostname}`);
  }

  const parts = urlObj.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error(`URL must point to a repository in the format owner/repo: ${rawUrl}`);
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, "");

  let ref: string | undefined;
  if (parts.length >= 4 && parts[2] === "tree") {
    ref = parts.slice(3).join("/");
  }

  const normalizedUrl = `https://github.com/${owner}/${repo}`;
  const projectName = repo;

  return {
    owner,
    repo,
    ref,
    normalizedUrl,
    projectName,
  };
}

/**
 * Fetches a public GitHub repository archive (.tar.gz) and extracts it into a temporary directory.
 * No user token is ever requested or stored.
 */
export async function fetchRepositoryArchive(
  owner: string,
  repo: string,
  ref?: string
): Promise<FetchedRepo> {
  const targetRef = ref || "HEAD";

  // 1. Try to determine commit hash and default branch via GitHub Commits API
  let commitHash = "";
  let defaultBranch = "main";

  try {
    const commitApiUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${targetRef}`;
    const commitRes = await fetch(commitApiUrl, {
      headers: {
        "User-Agent": "RepoGraph-Pipeline",
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (commitRes.status === 404) {
      throw new Error(`Repository or ref '${owner}/${repo}' not found on GitHub.`);
    }

    if (commitRes.ok) {
      const commitData = (await commitRes.json()) as { sha?: string };
      if (commitData?.sha) {
        commitHash = commitData.sha;
      }
    }
  } catch (err: unknown) {
    // If rate-limited or offline, we will recover the commit from the tarball root folder name
    if (err instanceof Error && err.message.includes("not found")) {
      throw err;
    }
  }

  // 2. Fetch the repository tarball (.tar.gz)
  // codeload.github.com / archive does not exhaust API rate limits
  const archiveUrl = `https://github.com/${owner}/${repo}/archive/${targetRef}.tar.gz`;
  const response = await fetch(archiveUrl, {
    headers: {
      "User-Agent": "RepoGraph-Pipeline",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Public repository '${owner}/${repo}' was not found on GitHub.`);
    }
    throw new Error(`Failed to download repository archive: HTTP ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const tarGzBuffer = Buffer.from(arrayBuffer);

  // 3. Extract into a temp directory
  const tempDir = path.join(
    os.tmpdir(),
    "repograph",
    `${owner}-${repo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  const extractResult = extractTarGz(tarGzBuffer, tempDir);

  if (extractResult.filesExtracted === 0) {
    throw new Error(`Repository archive for '${owner}/${repo}' was empty or contained no parseable files.`);
  }

  // 4. If commitHash was not yet recovered from GitHub API, parse it from root folder name
  // GitHub tarball root folders are named "${owner}-${repo}-${commitSha7}" or similar
  if (!commitHash && extractResult.rootPrefix) {
    const match = extractResult.rootPrefix.match(/-([a-f0-9]{7,40})$/i);
    if (match) {
      commitHash = match[1];
    }
  }

  if (!commitHash) {
    commitHash = "unknown";
  }

  return {
    extractedPath: tempDir,
    commitHash,
    owner,
    repo,
    defaultBranch,
    cleanUp: () => {
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (err) {
        console.warn(`[Pipeline] Failed to clean up temp dir ${tempDir}:`, err);
      }
    },
  };
}