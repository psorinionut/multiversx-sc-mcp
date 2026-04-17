import { execSync } from "child_process";
import { readFileSync, existsSync, readdirSync, statSync, rmSync, renameSync } from "fs";
import { join, basename } from "path";
import { createHash } from "crypto";
import { resolveNetwork, type NetworkName } from "../utils/networks.js";
import { validateAddress } from "../utils/validation.js";
import { fetchWithTimeout } from "../utils/fetch.js";

const EXEC_OPTS = { encoding: "utf-8" as const, maxBuffer: 50 * 1024 * 1024, timeout: 600_000 };

// ─── Tool 1: mvx_sc_build ─────────────────────────────────────────────────

export async function buildContract(params: {
  path: string;
  locked?: boolean;
  wasmSymbols?: boolean;
  noWasmOpt?: boolean;
}) {
  const { path, locked, wasmSymbols, noWasmOpt } = params;

  const metaDir = join(path, "meta");
  if (!existsSync(metaDir)) {
    throw new Error(`Meta directory not found: ${metaDir}. Is "${path}" a MultiversX contract directory?`);
  }

  const flags: string[] = [];
  if (locked) flags.push("--locked");
  if (wasmSymbols) flags.push("--wasm-symbols");
  if (noWasmOpt) flags.push("--no-wasm-opt");

  const cmd = `cd "${metaDir}" && cargo run build ${flags.join(" ")}`;

  let stdout: string;
  try {
    stdout = execSync(cmd, EXEC_OPTS);
  } catch (err) {
    const execErr = err as { stderr?: string; stdout?: string; message: string };
    throw new Error(
      `Build failed:\n${execErr.stderr || execErr.stdout || execErr.message}`
    );
  }

  // Find the output directory and WASM file
  const outputDir = join(path, "output");
  let contractName = basename(path);
  let wasmPath = "";
  let wasmSize = 0;
  let abiPath = "";

  if (existsSync(outputDir)) {
    const files = readdirSync(outputDir);
    const wasmFile = files.find((f) => f.endsWith(".wasm"));
    const abiFile = files.find((f) => f.endsWith(".abi.json"));

    if (wasmFile) {
      wasmPath = join(outputDir, wasmFile);
      wasmSize = statSync(wasmPath).size;
      contractName = wasmFile.replace(/\.wasm$/, "");
    }
    if (abiFile) {
      abiPath = join(outputDir, abiFile);
    }
  }

  return {
    success: true,
    contractName,
    wasmPath,
    wasmSize,
    wasmSizeKb: +(wasmSize / 1024).toFixed(2),
    abiPath,
    outputDir,
    stdout: stdout.trim(),
  };
}

// ─── Tool 2: mvx_sc_test ──────────────────────────────────────────────────

export async function runTests(params: {
  path: string;
  chainSimulator?: boolean;
  wasm?: boolean;
  nocapture?: boolean;
}) {
  const { path, chainSimulator, wasm, nocapture } = params;

  if (!existsSync(path)) {
    throw new Error(`Directory not found: ${path}`);
  }

  // Try sc-meta test first, fall back to cargo test
  let stdout: string;
  let success = true;

  const scMetaFlags: string[] = [`--path`, `"${path}"`];
  if (chainSimulator) scMetaFlags.push("--chain-simulator");
  if (wasm) scMetaFlags.push("--wasm");
  if (nocapture) scMetaFlags.push("--nocapture");

  try {
    stdout = execSync(
      `sc-meta test ${scMetaFlags.join(" ")}`,
      EXEC_OPTS
    );
  } catch {
    // sc-meta not available or failed, fall back to cargo test
    try {
      const cargoFlags: string[] = [];
      if (nocapture) cargoFlags.push("-- --nocapture");

      stdout = execSync(
        `cd "${path}" && cargo test ${cargoFlags.join(" ")} 2>&1`,
        EXEC_OPTS
      );
    } catch (cargoErr) {
      const execErr = cargoErr as { stderr?: string; stdout?: string; message: string };
      stdout = execErr.stdout || execErr.stderr || execErr.message;
      success = false;
    }
  }

  // Parse cargo test output for pass/fail/ignore counts
  let testsPassed = 0;
  let testsFailed = 0;
  let testsIgnored = 0;

  const resultMatch = stdout.match(
    /test result: (?:ok|FAILED)\.\s+(\d+)\s+passed;\s+(\d+)\s+failed;\s+(\d+)\s+ignored/
  );
  if (resultMatch) {
    testsPassed = parseInt(resultMatch[1], 10);
    testsFailed = parseInt(resultMatch[2], 10);
    testsIgnored = parseInt(resultMatch[3], 10);
    success = testsFailed === 0;
  }

  // If there are multiple test result lines (e.g., multiple crates), sum them all
  const allResults = stdout.matchAll(
    /test result: (?:ok|FAILED)\.\s+(\d+)\s+passed;\s+(\d+)\s+failed;\s+(\d+)\s+ignored/g
  );
  let hasMultiple = false;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalIgnored = 0;
  for (const m of allResults) {
    hasMultiple = true;
    totalPassed += parseInt(m[1], 10);
    totalFailed += parseInt(m[2], 10);
    totalIgnored += parseInt(m[3], 10);
  }
  if (hasMultiple) {
    testsPassed = totalPassed;
    testsFailed = totalFailed;
    testsIgnored = totalIgnored;
    success = testsFailed === 0;
  }

  return {
    success,
    testsPassed,
    testsFailed,
    testsIgnored,
    stdout: stdout.trim(),
  };
}

// ─── Tool 3: mvx_sc_new ───────────────────────────────────────────────────

export async function createNewContract(params: {
  template: string;
  name: string;
  path?: string;
}) {
  const { template, name, path: targetPath } = params;

  const flags: string[] = [
    `--template`, template,
    `--name`, name,
  ];
  if (targetPath) {
    flags.push(`--path`, `"${targetPath}"`);
  }

  let stdout: string;
  try {
    stdout = execSync(`sc-meta new ${flags.join(" ")}`, EXEC_OPTS);
  } catch (err) {
    const execErr = err as { stderr?: string; stdout?: string; message: string };
    throw new Error(
      `Failed to create contract:\n${execErr.stderr || execErr.stdout || execErr.message}`
    );
  }

  const projectPath = targetPath ? join(targetPath, name) : name;

  return {
    success: true,
    name,
    template,
    projectPath,
    stdout: stdout.trim(),
  };
}

// ─── Tool 4: mvx_sc_proxy ─────────────────────────────────────────────────

export async function generateProxy(params: {
  path: string;
}) {
  const { path } = params;

  const metaDir = join(path, "meta");
  if (!existsSync(metaDir)) {
    throw new Error(`Meta directory not found: ${metaDir}. Is "${path}" a MultiversX contract directory?`);
  }

  let stdout: string;
  try {
    stdout = execSync(`cd "${metaDir}" && cargo run proxy`, EXEC_OPTS);
  } catch (err) {
    const execErr = err as { stderr?: string; stdout?: string; message: string };
    throw new Error(
      `Proxy generation failed:\n${execErr.stderr || execErr.stdout || execErr.message}`
    );
  }

  return {
    success: true,
    stdout: stdout.trim(),
  };
}

// ─── Tool 5: mvx_sc_compare ───────────────────────────────────────────────

export async function compareCodehash(params: {
  wasmPath: string;
  address: string;
  network?: NetworkName;
}) {
  const { wasmPath, address, network } = params;

  validateAddress(address);

  if (!existsSync(wasmPath)) {
    throw new Error(`WASM file not found: ${wasmPath}`);
  }

  // Read local WASM
  const localWasm = readFileSync(wasmPath);
  const localHex = localWasm.toString("hex");
  const localHash = createHash("sha256").update(localWasm).digest("hex");
  const localSize = localWasm.length;

  // Fetch deployed code from API
  const config = resolveNetwork(network);
  const response = await fetchWithTimeout(
    `${config.apiUrl}/accounts/${address}`,
    undefined,
    30_000
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch account: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  let deployedCode = (data.code as string) || "";

  // The API returns hex code, sometimes with 0x prefix
  if (deployedCode.startsWith("0x")) {
    deployedCode = deployedCode.slice(2);
  }

  if (!deployedCode) {
    throw new Error(
      `No code found at address ${address}. Is it a smart contract?`
    );
  }

  const deployedSize = deployedCode.length / 2; // hex => bytes
  const deployedHash = createHash("sha256")
    .update(Buffer.from(deployedCode, "hex"))
    .digest("hex");

  const match = localHex === deployedCode;

  return {
    match,
    localSize,
    deployedSize,
    localCodeHash: localHash,
    deployedCodeHash: deployedHash,
    address,
    wasmPath,
    ...(match
      ? {}
      : { hint: "Code does not match. The contract may have been built with different settings or a different version." }),
  };
}

// ─── Tool 6: mvx_sc_reproducible_build ─────────────────────────────────────

export async function reproducibleBuild(params: {
  path: string;
  dockerImage: string;
  contract?: string;
  noWasmOpt?: boolean;
  /** Default true. mxpy refuses to run if output-docker is non-empty.
   *  If "preserve", we rename output-docker → output-docker-<prev-contract> to keep prior artifacts. */
  cleanOutput?: boolean | "preserve";
}) {
  const { path, dockerImage, contract, noWasmOpt, cleanOutput = true } = params;

  if (!existsSync(path)) {
    throw new Error(`Directory not found: ${path}`);
  }

  // Handle the recurring "Output folder must be empty: /output" mxpy failure.
  const outputDirPre = join(path, "output-docker");
  let preservedAs: string | undefined;
  if (cleanOutput && existsSync(outputDirPre)) {
    const entries = readdirSync(outputDirPre).filter((e) => e !== ".DS_Store");
    if (entries.length > 0) {
      if (cleanOutput === "preserve") {
        // Find a non-conflicting backup name based on what's inside
        const subdirs = entries.filter((e) => statSync(join(outputDirPre, e)).isDirectory());
        const tag = subdirs[0] || "prev";
        let backup = `${outputDirPre}-${tag}`;
        let n = 2;
        while (existsSync(backup)) backup = `${outputDirPre}-${tag}-${n++}`;
        renameSync(outputDirPre, backup);
        preservedAs = backup;
      } else {
        rmSync(outputDirPre, { recursive: true, force: true });
      }
    }
  }

  const flags: string[] = [
    ".",
    `--docker-image=${dockerImage}`,
    "--no-docker-interactive",
    "--no-docker-tty",
  ];
  if (contract) flags.push(`--contract=${contract}`);
  if (noWasmOpt) flags.push("--no-wasm-opt");

  const cmd = `cd "${path}" && mxpy contract reproducible-build ${flags.join(" ")}`;

  let stdout: string;
  try {
    stdout = execSync(cmd, EXEC_OPTS);
  } catch (err) {
    const execErr = err as { stderr?: string; stdout?: string; message: string };
    throw new Error(
      `Reproducible build failed:\n${execErr.stderr || execErr.stdout || execErr.message}`
    );
  }

  // List output artifacts
  const outputDir = join(path, "output-docker");
  const artifacts: Array<{ file: string; size: number; sizeKb: number }> = [];

  if (existsSync(outputDir)) {
    const listRecursive = (dir: string) => {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          listRecursive(fullPath);
        } else {
          artifacts.push({
            file: fullPath.replace(path + "/", ""),
            size: stat.size,
            sizeKb: +(stat.size / 1024).toFixed(2),
          });
        }
      }
    };
    listRecursive(outputDir);
  }

  return {
    success: true,
    outputDir,
    artifacts,
    ...(preservedAs ? { preservedPriorArtifactsAs: preservedAs } : {}),
    stdout: stdout.trim(),
  };
}
