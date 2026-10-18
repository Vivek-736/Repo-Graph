import { parseGitHubUrl, fetchRepositoryArchive } from "../lib/pipeline/fetcher";
import { parseRepository } from "../lib/parser";

async function main() {
  const testUrl = process.argv[2] || "https://github.com/reduxjs/redux-thunk";
  console.log(`[Test Pipeline] Testing with repo: ${testUrl}`);

  const parsedUrl = parseGitHubUrl(testUrl);
  console.log("[Test Pipeline] Parsed URL:", parsedUrl);

  console.log("[Test Pipeline] Fetching archive from GitHub...");
  const fetched = await fetchRepositoryArchive(parsedUrl.owner, parsedUrl.repo, parsedUrl.ref);
  console.log(`[Test Pipeline] Downloaded and unpacked to: ${fetched.extractedPath}`);
  console.log(`[Test Pipeline] Commit hash: ${fetched.commitHash}`);

  try {
    console.log("[Test Pipeline] Running standalone parser...");
    const result = parseRepository(fetched.extractedPath);
    console.log(`[Test Pipeline] Parser finished successfully!`);
    console.log(`- Files parsed: ${result.files.length}`);
    console.log(`- Edges resolved: ${result.edges.length}`);
    console.log(`- Folders: ${result.folders.length}`);
    console.log(`- Coverage: ${result.coverage.resolvedInternal}/${result.coverage.totalImports} internal imports resolved`);
  } finally {
    fetched.cleanUp();
    console.log("[Test Pipeline] Cleaned up temporary directory.");
  }
}

main().catch((err) => {
  console.error("[Test Pipeline] Error:", err);
  process.exit(1);
});