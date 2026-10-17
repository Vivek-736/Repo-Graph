import * as path from "node:path";
import { parseRepository, ParserResult } from "../lib/parser";
import * as fs from "node:fs";

async function runAcceptanceChecks(): Promise<void> {
  console.log("=== RUNNING PHASE 3 ACCEPTANCE CHECKS ===\n");

  // -------------------------------------------------------------
  // Check 1: Run against this project
  // -------------------------------------------------------------
  console.log("[Check 1] Running against this project...");
  const thisProjectResult = parseRepository(path.resolve("."));
  const { stats, files, skippedFiles, folders } = thisProjectResult;

  console.log(`  Files Found:   ${stats.filesFound}`);
  console.log(`  Files Parsed:  ${stats.filesParsed}`);
  console.log(`  Files Skipped: ${stats.filesSkipped}`);

  const mathValid = stats.filesFound === stats.filesParsed + stats.filesSkipped;
  if (!mathValid) {
    throw new Error(`[Check 1 FAILED] Math does not add up: ${stats.filesParsed} + ${stats.filesSkipped} !== ${stats.filesFound}`);
  }

  // Verify every skipped file has an explicit reason
  const missingReasons = skippedFiles.filter((s) => !s.reason || s.reason.trim() === "");
  if (missingReasons.length > 0) {
    throw new Error(`[Check 1 FAILED] ${missingReasons.length} skipped files do not have a reason!`);
  }
  console.log(`  -> Math adds up (${stats.filesParsed} + ${stats.filesSkipped} = ${stats.filesFound}) and all ${skippedFiles.length} skipped files have explicit reasons. PASSED.`);

  // -------------------------------------------------------------
  // Check 2: Distinct folders
  // -------------------------------------------------------------
  console.log("\n[Check 2] Validating distinct folders...");
  console.log(`  Distinct folders found: ${folders.length}`);
  for (const f of folders) {
    console.log(`    - ${f}`);
  }
  const filesWithoutFolder = files.filter((f) => f.folder === undefined || f.folder === null);
  if (filesWithoutFolder.length > 0) {
    throw new Error(`[Check 2 FAILED] Files found without folder field: ${filesWithoutFolder.length}`);
  }
  console.log(`  -> Every file carries its folder. Distinct folders: ${folders.length}. PASSED.`);

  // -------------------------------------------------------------
  // Check 3: Barrel files and re-exports
  // -------------------------------------------------------------
  console.log("\n[Check 3] Testing barrel files and re-exports...");
  const fixtureDir = path.resolve("./.temp_barrel_test");
  if (fs.existsSync(fixtureDir)) {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(fixtureDir, "src/components"), { recursive: true });

  fs.writeFileSync(path.join(fixtureDir, "src/components/button.ts"), "export const Button = 'btn';\n");
  fs.writeFileSync(path.join(fixtureDir, "src/components/card.ts"), "export const Card = 'card';\n");
  fs.writeFileSync(
    path.join(fixtureDir, "src/components/index.ts"),
    "export * from './button';\nexport { Card } from './card';\n"
  );
  fs.writeFileSync(
    path.join(fixtureDir, "src/index.ts"),
    "export * from './components';\nimport { Button } from './components';\n"
  );

  const barrelResult = parseRepository(fixtureDir);
  console.log(`  Re-exports Found:    ${barrelResult.stats.reexportsFound}`);
  console.log(`  Re-exports Resolved: ${barrelResult.stats.reexportsResolved}`);

  if (barrelResult.stats.reexportsFound !== 3 || barrelResult.stats.reexportsResolved !== 3) {
    throw new Error(
      `[Check 3 FAILED] Expected 3 re-exports found and 3 resolved, got found: ${barrelResult.stats.reexportsFound}, resolved: ${barrelResult.stats.reexportsResolved}`
    );
  }
  console.log(`  -> Re-exports found (${barrelResult.stats.reexportsFound}) matches resolved (${barrelResult.stats.reexportsResolved}). PASSED.`);

  // Clean up fixture
  fs.rmSync(fixtureDir, { recursive: true, force: true });

  // -------------------------------------------------------------
  // Check 4: Rename a target file and verify exactly one unresolved import with named reason
  // -------------------------------------------------------------
  console.log("\n[Check 4] Testing rename / missing target import...");
  const renameTestDir = path.resolve("./.temp_rename_test");
  if (fs.existsSync(renameTestDir)) {
    fs.rmSync(renameTestDir, { recursive: true, force: true });
  }
  fs.mkdirSync(renameTestDir, { recursive: true });

  // Source imports target
  fs.writeFileSync(path.join(renameTestDir, "source.ts"), "import { helper } from './helper';\n");
  fs.writeFileSync(path.join(renameTestDir, "helper.ts"), "export const helper = 42;\n");

  const beforeRename = parseRepository(renameTestDir);
  if (beforeRename.coverage.unresolved !== 0) {
    throw new Error(`[Check 4 FAILED] Unexpected unresolved imports before rename: ${beforeRename.coverage.unresolved}`);
  }

  // Now rename helper.ts -> helper_renamed.ts
  fs.renameSync(path.join(renameTestDir, "helper.ts"), path.join(renameTestDir, "helper_renamed.ts"));

  const afterRename = parseRepository(renameTestDir);
  console.log(`  Unresolved imports after rename: ${afterRename.coverage.unresolved}`);
  if (afterRename.coverage.unresolved !== 1) {
    throw new Error(`[Check 4 FAILED] Expected exactly 1 unresolved import, got: ${afterRename.coverage.unresolved}`);
  }

  const failure = afterRename.coverage.failures[0];
  console.log(`  Failure source: ${failure.sourceFile}`);
  console.log(`  Specifier:      ${failure.specifier}`);
  console.log(`  Named reason:   ${failure.reason}`);

  if (!failure.reason.includes("target_file_not_found")) {
    throw new Error(`[Check 4 FAILED] Reason did not name target file not found: ${failure.reason}`);
  }
  console.log("  -> Exactly one unresolved import reported with named reason. PASSED.");

  // Clean up rename fixture
  fs.rmSync(renameTestDir, { recursive: true, force: true });

  // -------------------------------------------------------------
  // Check 5: Write output to a file and read back (types hold)
  // -------------------------------------------------------------
  console.log("\n[Check 5] Validating typed file output and read-back...");
  const testOutputFile = path.resolve("./.temp_contract_test.json");
  fs.writeFileSync(testOutputFile, JSON.stringify(thisProjectResult, null, 2), "utf-8");

  const loadedContract: ParserResult = JSON.parse(fs.readFileSync(testOutputFile, "utf-8"));
  if (
    loadedContract.files.length !== thisProjectResult.files.length ||
    loadedContract.edges.length !== thisProjectResult.edges.length ||
    loadedContract.stats.filesFound !== thisProjectResult.stats.filesFound
  ) {
    throw new Error("[Check 5 FAILED] Loaded contract does not match original ParserResult");
  }

  const sampleFile = loadedContract.files[0];
  if (
    typeof sampleFile.id !== "string" ||
    typeof sampleFile.path !== "string" ||
    typeof sampleFile.folder !== "string" ||
    typeof sampleFile.fanIn !== "number" ||
    typeof sampleFile.fanOut !== "number" ||
    typeof sampleFile.linesCount !== "number" ||
    typeof sampleFile.contentHash !== "string"
  ) {
    throw new Error("[Check 5 FAILED] File properties do not match ParsedFile interface");
  }

  const sampleEdge = loadedContract.edges[0];
  if (
    typeof sampleEdge.id !== "string" ||
    typeof sampleEdge.source !== "string" ||
    typeof sampleEdge.specifier !== "string" ||
    typeof sampleEdge.resolved !== "boolean" ||
    !["import", "reexport", "dynamic"].includes(sampleEdge.kind)
  ) {
    throw new Error("[Check 5 FAILED] Edge properties do not match ParsedEdge interface");
  }

  fs.rmSync(testOutputFile, { force: true });
  console.log("  -> Types hold across file write and read-back. PASSED.");

  console.log("\n=================================================");
  console.log("ALL PHASE 3 ACCEPTANCE CHECKS PASSED SUCCESSFULLY");
  console.log("=================================================");
}

runAcceptanceChecks().catch((err) => {
  console.error(err);
  process.exit(1);
});