#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SUPPORTED_TEMPLATES = new Set([
  'CopyAllToMods',
  'CopyAllToResMods',
  'ExtractArchiveThenCopyToMods',
  'ExtractArchiveThenCopyToResMods',
  'ExtractArchiveAndCopyFolderToMods',
  'ExtractToGameRoot',
  'RunExternalInstaller',
  'ManualExternalDependency',
  'DeterministicButUnsupported',
  'MixedCustomPathButDeterministic',
  'Unknown',
]);

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const unknownArgs = [...args].filter((arg) => arg !== '--dry-run');
if (unknownArgs.length > 0) {
  fail(`Unknown argument(s): ${unknownArgs.join(', ')}`);
}

const rootDir = process.cwd();
const latestDir = path.join(rootDir, 'latest');
const overridesDir = path.join(rootDir, 'overrides');
const historyDir = path.join(rootDir, 'history');
const latestMetadataPath = path.join(latestDir, 'metadata.json');
const latestCatalogZipPath = path.join(latestDir, 'catalog.zip');
const latestChangelogPath = path.join(latestDir, 'catalog-changelog.json');
const overridesInstallationPath = path.join(overridesDir, 'catalog_installation.json');
const overridesCatalogPath = path.join(overridesDir, 'catalog.json');

for (const filePath of [latestMetadataPath, latestCatalogZipPath, overridesInstallationPath]) {
  requireFile(filePath);
}

const metadata = readJsonFile(latestMetadataPath, 'latest/metadata.json');
if (typeof metadata.catalogVersion !== 'string') {
  fail('latest/metadata.json must contain string catalogVersion.');
}

const oldCatalogVersion = metadata.catalogVersion;
const newCatalogVersion = incrementVersion(oldCatalogVersion);
const newHistoryDir = path.join(historyDir, newCatalogVersion);
if (existsSync(newHistoryDir)) {
  fail(`history/${newCatalogVersion}/ already exists.`);
}

const tempDir = mkdtempSync(path.join(tmpdir(), 'manual-installation-override-'));
try {
  const extractedCatalog = readZipJson(latestCatalogZipPath, 'catalog.json');
  const extractedInstallation = readZipJson(latestCatalogZipPath, 'catalog_installation.json');
  const extractedChangelog = readZipJson(latestCatalogZipPath, 'catalog-changelog.json');
  const overrideInstallation = readJsonFile(overridesInstallationPath, 'overrides/catalog_installation.json');

  if (!Array.isArray(overrideInstallation.mods)) {
    fail('overrides/catalog_installation.json mods must be an array.');
  }
  if (overrideInstallation.mods.length === 0) {
    fail('overrides/catalog_installation.json mods must keep at least one mod to override.');
  }
  if (!Array.isArray(extractedInstallation.mods)) {
    fail('catalog_installation.json from latest/catalog.zip mods must be an array.');
  }

  const originalModsByKey = new Map();
  for (const mod of extractedInstallation.mods) {
    if (mod && typeof mod === 'object' && hasNonEmptyString(mod.source) && hasNonEmptyString(mod.sourceId)) {
      originalModsByKey.set(modKey(mod), mod);
    }
  }

  const seenOverrideKeys = new Set();
  const appliedOverrides = [];
  for (const overrideMod of overrideInstallation.mods) {
    validateOverrideMod(overrideMod);
    const key = modKey(overrideMod);
    if (seenOverrideKeys.has(key)) {
      fail(`Duplicate override for ${key}.`);
    }
    seenOverrideKeys.add(key);

    const originalMod = originalModsByKey.get(key);
    if (!originalMod) {
      fail(`Override target ${key} does not exist in current catalog_installation.json.`);
    }

    const oldTemplate = originalMod.installationProcess?.installationTemplate ?? '<missing>';
    const newTemplate = overrideMod.installationProcess.installationTemplate;
    originalMod.installationProcess = deepClone(overrideMod.installationProcess);
    appliedOverrides.push({ key, oldTemplate, newTemplate });
  }

  extractedInstallation.catalogVersion = newCatalogVersion;
  extractedCatalog.catalogVersion = newCatalogVersion;
  extractedChangelog.catalogVersion = newCatalogVersion;
  const newMetadata = { ...metadata, catalogVersion: newCatalogVersion };

  console.log(`Old version: ${oldCatalogVersion}`);
  console.log(`New version: ${newCatalogVersion}`);
  console.log(`Override item count: ${overrideInstallation.mods.length}`);
  for (const applied of appliedOverrides) {
    console.log(`Override applied: ${applied.key} ${applied.oldTemplate} -> ${applied.newTemplate}`);
  }

  const outputDir = path.join(tempDir, 'zip');
  mkdirSync(outputDir, { recursive: true });
  const newCatalogJsonPath = path.join(outputDir, 'catalog.json');
  const newInstallationJsonPath = path.join(outputDir, 'catalog_installation.json');
  const newChangelogJsonPath = path.join(outputDir, 'catalog-changelog.json');
  writeJsonFile(newCatalogJsonPath, extractedCatalog);
  writeJsonFile(newInstallationJsonPath, extractedInstallation);
  writeJsonFile(newChangelogJsonPath, extractedChangelog);

  const newCatalogZipPath = path.join(tempDir, 'catalog.zip');
  execFileSync('zip', ['-X', '-q', newCatalogZipPath, 'catalog.json', 'catalog_installation.json', 'catalog-changelog.json'], {
    cwd: outputDir,
    stdio: 'pipe',
  });

  if (dryRun) {
    console.log('Dry run: no files written.');
  } else {
    mkdirSync(newHistoryDir, { recursive: true });
    writeJsonFile(latestMetadataPath, newMetadata);
    copyFileSync(newCatalogZipPath, latestCatalogZipPath);
    writeJsonFile(latestChangelogPath, extractedChangelog);
    writeJsonFile(path.join(newHistoryDir, 'metadata.json'), newMetadata);
    copyFileSync(newCatalogZipPath, path.join(newHistoryDir, 'catalog.zip'));
    writeJsonFile(path.join(newHistoryDir, 'catalog-changelog.json'), extractedChangelog);
    writeJsonFile(overridesCatalogPath, extractedCatalog);
    writeJsonFile(overridesInstallationPath, extractedInstallation);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function requireFile(filePath) {
  if (!existsSync(filePath)) {
    fail(`Required input file is missing: ${path.relative(rootDir, filePath)}`);
  }
}

function readJsonFile(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`Invalid JSON in ${label}: ${error.message}`);
  }
}

function readZipEntry(zipPath, entryName) {
  try {
    return execFileSync('unzip', ['-p', zipPath, entryName], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 50 * 1024 * 1024 });
  } catch (error) {
    fail(`Unable to read ${entryName} from latest/catalog.zip: ${error.stderr?.toString().trim() || error.message}`);
  }
}

function readZipJson(zipPath, entryName) {
  const bytes = readZipEntry(zipPath, entryName);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    fail(`Invalid JSON in ${entryName} from latest/catalog.zip: ${error.message}`);
  }
}

function incrementVersion(version) {
  const match = version.match(/^(.*?)(\d+)$/u);
  if (!match) {
    fail(`Version does not end with a numeric part: ${version}`);
  }
  const [, prefix, numericPart] = match;
  const nextNumericPart = String(Number.parseInt(numericPart, 10) + 1).padStart(numericPart.length, '0');
  return `${prefix}${nextNumericPart}`;
}

function validateOverrideMod(mod) {
  if (!mod || typeof mod !== 'object' || Array.isArray(mod)) {
    fail('Override mod must be an object.');
  }
  if (!hasNonEmptyString(mod.source)) {
    fail('Override mod must contain non-empty string source.');
  }
  if (!hasNonEmptyString(mod.sourceId)) {
    fail(`Override mod ${mod.source}/<missing> must contain non-empty string sourceId.`);
  }
  if (!mod.installationProcess || typeof mod.installationProcess !== 'object' || Array.isArray(mod.installationProcess)) {
    fail(`Override mod ${modKey(mod)} must contain installationProcess object.`);
  }
  validateInstallationProcess(mod.installationProcess, modKey(mod));
}

function validateInstallationProcess(installationProcess, key) {
  const template = installationProcess.installationTemplate;
  if (!SUPPORTED_TEMPLATES.has(template)) {
    fail(`Override mod ${key} has unsupported installationTemplate: ${template}`);
  }
  if (typeof installationProcess.installableByApp !== 'boolean') {
    fail(`Override mod ${key} installationProcess.installableByApp must be boolean.`);
  }
  if (typeof installationProcess.deleteDataWgpdc !== 'boolean') {
    fail(`Override mod ${key} installationProcess.deleteDataWgpdc must be boolean.`);
  }
  if (!hasNonEmptyString(installationProcess.decisionReason)) {
    fail(`Override mod ${key} installationProcess.decisionReason must be a non-empty string.`);
  }
  if (template === 'ExtractArchiveAndCopyFolderToMods' && !hasNonEmptyString(installationProcess.manualFolder)) {
    fail(`Override mod ${key} installationProcess.manualFolder must be a non-empty string for ExtractArchiveAndCopyFolderToMods.`);
  }
}

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function modKey(mod) {
  return `${mod.source}/${mod.sourceId}`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function writeJsonFile(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
