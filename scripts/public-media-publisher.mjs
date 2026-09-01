import * as defaultFs from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

async function pathExists(fs, path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

function validateFilenames(filenames) {
  if (!Array.isArray(filenames) || filenames.length === 0) {
    throw new Error("Public media publication requires at least one filename.");
  }
  if (new Set(filenames).size !== filenames.length) {
    throw new Error("Public media publication filenames must be unique.");
  }
  for (const filename of filenames) {
    if (!filename || basename(filename) !== filename || filename === "." || filename === "..") {
      throw new Error("Public media publication accepts plain filenames only.");
    }
  }
}

function assertTransientPath(parentDir, path) {
  if (dirname(resolve(path)) !== resolve(parentDir)) {
    throw new Error(`Refusing to publish through unexpected path: ${path}`);
  }
}

export async function publishDirectoryAtomically({
  sourceDir,
  destinationDir,
  filenames,
  operationId = `${process.pid}-${Date.now()}`,
  fs = defaultFs,
}) {
  validateFilenames(filenames);
  if (!/^[A-Za-z0-9._-]+$/u.test(operationId)) {
    throw new Error("Public media publication operation ID contains unsupported characters.");
  }

  const parentDir = dirname(destinationDir);
  const destinationName = basename(destinationDir);
  const stagingDir = join(parentDir, `.${destinationName}.staging-${operationId}`);
  const backupDir = join(parentDir, `.${destinationName}.backup-${operationId}`);
  assertTransientPath(parentDir, stagingDir);
  assertTransientPath(parentDir, backupDir);

  await fs.mkdir(parentDir, { recursive: true });
  await fs.rm(stagingDir, { recursive: true, force: true });
  await fs.rm(backupDir, { recursive: true, force: true });
  await fs.mkdir(stagingDir);

  let previousMoved = false;
  try {
    for (const filename of filenames) {
      await fs.copyFile(join(sourceDir, filename), join(stagingDir, filename));
    }
    const stagedFiles = (await fs.readdir(stagingDir)).sort();
    const expectedFiles = [...filenames].sort();
    if (JSON.stringify(stagedFiles) !== JSON.stringify(expectedFiles)) {
      throw new Error(`Staged media package is incomplete: ${stagedFiles.join(", ")}`);
    }
    if (await pathExists(fs, destinationDir)) {
      await fs.rename(destinationDir, backupDir);
      previousMoved = true;
    }
    await fs.rename(stagingDir, destinationDir);
  } catch (publishError) {
    let restoreError;
    if (!(await pathExists(fs, destinationDir)) && previousMoved && await pathExists(fs, backupDir)) {
      try {
        await fs.rename(backupDir, destinationDir);
      } catch (error) {
        restoreError = error;
      }
    }
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    if (restoreError) {
      throw new AggregateError(
        [publishError, restoreError],
        `Media publication failed and the previous directory could not be restored. Backup remains at ${backupDir}.`,
      );
    }
    throw publishError;
  }

  let cleanupWarning = null;
  if (previousMoved) {
    try {
      await fs.rm(backupDir, { recursive: true, force: true });
    } catch (error) {
      cleanupWarning = `Media published successfully, but backup cleanup failed: ${error.message}`;
    }
  }
  return {
    published: true,
    cleanupWarning,
    retainedBackupDir: cleanupWarning ? backupDir : null,
  };
}
