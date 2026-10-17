import * as fs from "node:fs";
import * as path from "node:path";
import { parseRepository, ParserResult } from "../lib/parser";

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/parse.ts [directory] [--out <output.json>]

Options:
  --out, -o <file>   Write the full typed ParserResult to a JSON file.
  --help, -h         Show this help message.
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  let targetDir = ".";
  let outFile: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" || args[i] === "-o") {
      outFile = args[i + 1] || null;
      i++;
    } else if (!args[i].startsWith("-")) {
      targetDir = args[i];
    }
  }

  const resolvedDir = path.resolve(targetDir);
  console.log(`[RepoGraph Parser] Scanning directory: ${resolvedDir}\n`);

  const startTime = Date.now();
  const result: ParserResult = parseRepository(resolvedDir);
  const elapsedMs = Date.now() - startTime;

  const { stats, coverage, folders, skippedFiles, edges, files } = result;

  console.log("=================================================");
  console.log("              PARSER RUN REPORT                  ");
  console.log("=================================================");
  console.log(`Root Path:         ${result.rootPath}`);
  console.log(`Files Found:       ${stats.filesFound}`);
  console.log(`Files Parsed:      ${stats.filesParsed}`);
  console.log(`Files Skipped:     ${stats.filesSkipped}`);
  console.log(`Sum Validation:    ${stats.filesParsed} + ${stats.filesSkipped} = ${stats.filesParsed + stats.filesSkipped} (Matches Files Found: ${stats.filesFound === stats.filesParsed + stats.filesSkipped ? "YES" : "NO"})`);
  console.log(`Total Code Lines:  ${stats.totalLines}`);
  console.log(`Distinct Folders:  ${stats.distinctFolders}`);
  console.log(`Elapsed Time:      ${elapsedMs}ms\n`);

  console.log("--- FOLDERS DETECTED ---");
  for (const folder of folders) {
    console.log(`  - ${folder}`);
  }
  console.log("");

  console.log("--- SKIPPED FILES BREAKDOWN ---");
  const skipReasons = new Map<string, number>();
  for (const skipped of skippedFiles) {
    skipReasons.set(skipped.reason, (skipReasons.get(skipped.reason) || 0) + 1);
  }
  for (const [reason, count] of skipReasons.entries()) {
    console.log(`  ${reason.padEnd(40)}: ${count}`);
  }
  console.log("");

  console.log("--- EDGES & DEPENDENCIES ---");
  console.log(`Total Edges Extracted: ${edges.length}`);
  console.log(`Total Import Statements: ${coverage.totalImports}`);
  console.log(`  - Resolved to Internal Repo Files: ${coverage.resolvedInternal}`);
  console.log(`  - External Packages:               ${coverage.externalDependencies}`);
  console.log(`  - Node Built-ins:                  ${coverage.builtins}`);
  console.log(`  - Deliberately Excluded (assets):  ${coverage.deliberatelyExcluded}`);
  console.log(`  - Unresolved Imports:              ${coverage.unresolved}`);
  console.log("");

  console.log("--- RE-EXPORTS ---");
  console.log(`Re-exports Found:    ${stats.reexportsFound}`);
  console.log(`Re-exports Resolved: ${stats.reexportsResolved}`);
  if (stats.reexportsFound === stats.reexportsResolved) {
    console.log(`All re-exports resolved cleanly!`);
  } else {
    console.log(`Gap: ${stats.reexportsFound - stats.reexportsResolved} re-exports were external or unresolved.`);
  }
  console.log("");

  if (coverage.failures.length > 0) {
    console.log("--- UNRESOLVED / FAILURE EXAMPLES ---");
    for (const failure of coverage.failures.slice(0, 10)) {
      console.log(`  [${failure.kind}] in ${failure.sourceFile}: '${failure.specifier}'`);
      console.log(`    Reason: ${failure.reason}`);
    }
    if (coverage.failures.length > 10) {
      console.log(`  ... and ${coverage.failures.length - 10} more failures.`);
    }
    console.log("");
  }

  // Top files by Fan-in and Fan-out
  const topFanIn = [...files].sort((a, b) => b.fanIn - a.fanIn).slice(0, 5);
  const topFanOut = [...files].sort((a, b) => b.fanOut - a.fanOut).slice(0, 5);

  console.log("--- TOP NODES BY FAN-IN (Depended upon by most files) ---");
  for (const f of topFanIn) {
    console.log(`  ${f.path.padEnd(45)} fan-in: ${f.fanIn}, fan-out: ${f.fanOut}`);
  }
  console.log("");

  console.log("--- TOP NODES BY FAN-OUT (Imports the most internal files) ---");
  for (const f of topFanOut) {
    console.log(`  ${f.path.padEnd(45)} fan-out: ${f.fanOut}, fan-in: ${f.fanIn}`);
  }
  console.log("");

  // Write out to JSON file if requested
  if (outFile) {
    const outPath = path.resolve(outFile);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");
    console.log(`[RepoGraph Parser] Wrote typed data contract to: ${outPath}`);

    // Verify reading back holds exact types
    const readBack: ParserResult = JSON.parse(fs.readFileSync(outPath, "utf-8"));
    if (readBack.files.length === result.files.length && readBack.edges.length === result.edges.length) {
      console.log(`[Verification] Read-back validated: ${readBack.files.length} files and ${readBack.edges.length} edges successfully verified.`);
    } else {
      throw new Error("[Verification Error] Read-back JSON does not match generated result!");
    }
  }

  console.log("=================================================");
}

main().catch((err) => {
  console.error("[Parser CLI Error]", err);
  process.exit(1);
});