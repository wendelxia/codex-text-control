import test from "node:test";
import assert from "node:assert/strict";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import {
  PUBLIC_ASSET_NAMES,
  PUBLIC_MEDIA_LOCALE,
  PUBLIC_SUBTITLE_LOCALE,
  REQUIRED_STORY_STAGES,
  collectEnglishPublicText,
  collectSubtitleText,
  scenes,
} from "../scripts/promo-content.mjs";
import { assertChineseSubtitles, assertEnglishOnly } from "../scripts/public-media-guard.mjs";
import { escapeHtml, serializeForInlineScript } from "../scripts/promo-html.mjs";
import { publishDirectoryAtomically } from "../scripts/public-media-publisher.mjs";

const { mkdir, mkdtemp, readFile, readdir, rm, writeFile } = fsPromises;

const cjkPattern = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;

async function listFilesRecursively(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const relativePath = join(prefix, entry.name);
    if (entry.isDirectory()) paths.push(...await listFilesRecursively(join(directory, entry.name), relativePath));
    else paths.push(relativePath);
  }
  return paths;
}

async function createPublishFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "codex-text-control-media-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceDir = join(root, "source");
  const destinationDir = join(root, "public", "overview");
  await Promise.all([
    mkdir(sourceDir, { recursive: true }),
    mkdir(destinationDir, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(sourceDir, "README.md"), "new readme", "utf8"),
    writeFile(join(sourceDir, "overview.mp4"), "new video", "utf8"),
    writeFile(join(destinationDir, "old.txt"), "old package", "utf8"),
  ]);
  return { root, sourceDir, destinationDir, filenames: ["README.md", "overview.mp4"] };
}

test("GitHub promotional media uses English primary content with Simplified Chinese subtitles", () => {
  assert.equal(PUBLIC_MEDIA_LOCALE, "en-US");
  assert.equal(PUBLIC_SUBTITLE_LOCALE, "zh-CN");
  assert.equal(PUBLIC_ASSET_NAMES.subtitles, "codex-text-control-overview.zh-CN.ass");
  assert.equal(PUBLIC_ASSET_NAMES.transcript, "transcript.en-zh-CN.md");
  for (const filename of Object.values(PUBLIC_ASSET_NAMES)) {
    assert.match(filename, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
    assert.doesNotMatch(filename, cjkPattern);
  }
  for (const value of collectEnglishPublicText()) {
    assert.doesNotMatch(value, cjkPattern, `CJK text reached an English media surface: ${value}`);
  }
  for (const subtitle of collectSubtitleText()) {
    assert.match(subtitle, /[\u3400-\u4dbf\u4e00-\u9fff]/u, `Chinese subtitle is missing: ${subtitle}`);
  }
});

test("the storyboard starts with everyday problems before introducing the tool and its solution", () => {
  const stageIds = scenes.map((scene) => scene.stage);
  assert.deepEqual(stageIds, REQUIRED_STORY_STAGES, "Required stages must be unique and remain in workflow order.");

  assert.ok(scenes.length >= 12, "The usage demonstration needs enough distinct states to be inspectable.");
  assert.ok(stageIds.slice(0, 3).every((stage) => stage.startsWith("problem-")), "The first three scenes must be everyday problems.");
  const solutionIndex = stageIds.indexOf("solution-intro");
  assert.equal(solutionIndex, 3, "The tool must appear only after the three problem scenes.");
  assert.ok(
    scenes.filter((scene) => scene.stage.startsWith("use-")).length >= 9,
    "The video must show opening, editing, source mode, review, return, commit, notification, history, and re-read.",
  );

  const problemCopy = scenes.slice(0, solutionIndex).flatMap(({ title, body, narration }) => [title, body, narration]).join("\n");
  assert.match(problemCopy, /same requirement/i);
  assert.match(problemCopy, /one (?:table )?cell/i);
  assert.match(problemCopy, /which version/i);

  const solutionCopy = scenes.slice(solutionIndex).flatMap(({ title, body, narration }) => [title, body, narration]).join("\n");
  assert.match(solutionCopy, /Codex Text Control/);
  assert.match(solutionCopy, /canvas/i);
  assert.match(solutionCopy, /reviewed|confirmed/i);
});

test("the storyboard keeps evidence claims within the verified project boundary", () => {
  const allCopy = collectEnglishPublicText().join("\n");
  assert.match(allCopy, /source candidate/i);
  assert.match(allCopy, /UI demonstration · current source/);
  assert.doesNotMatch(allCopy, /production[- ]ready|industry[- ]leading|one[- ]click install/i);
});

test("the public-media guard rejects CJK text before rendering or publishing", () => {
  assert.doesNotThrow(() => assertEnglishOnly(["English title", "Revision 43"], "test copy"));
  assert.throws(
    () => assertEnglishOnly(["English title", "待提交 text"], "test copy"),
    /English-only check failed.*test copy.*U\+5F85/,
  );
  for (const unsupported of ["Привет", "مرحبا", "γειά"]) {
    assert.throws(
      () => assertEnglishOnly(["English title", unsupported], "test copy"),
      /English-only check failed.*test copy/,
    );
  }
});

test("the subtitle guard requires Chinese text and rejects unrelated scripts", () => {
  assert.doesNotThrow(() => assertChineseSubtitles(["聊天负责讨论，画布保存最终版本。"], "test subtitles"));
  assert.throws(
    () => assertChineseSubtitles(["English subtitle only"], "test subtitles"),
    /has no Chinese text/,
  );
  assert.throws(
    () => assertChineseSubtitles(["中文字幕と日本語"], "test subtitles"),
    /unsupported U\+3068/,
  );
});

test("promotional HTML escapes visible copy and cannot close an inline script", () => {
  assert.equal(
    escapeHtml(`A < B & "quoted" 'value'`),
    "A &lt; B &amp; &quot;quoted&quot; &#39;value&#39;",
  );
  const serialized = serializeForInlineScript({ text: "</script><section>safe copy</section>" });
  assert.doesNotMatch(serialized, /<\/script/iu);
  assert.deepEqual(JSON.parse(serialized), { text: "</script><section>safe copy</section>" });
});

test("tracked public media keeps English documentation and Chinese subtitle artifacts in their declared channels", async () => {
  const mediaDir = join(process.cwd(), "docs", "media", "codex-text-control-overview");
  const filenames = await readdir(mediaDir);
  assert.deepEqual(
    filenames.sort(),
    ["README.md", ...Object.values(PUBLIC_ASSET_NAMES)].sort(),
  );

  for (const filename of filenames) {
    assert.doesNotMatch(filename, cjkPattern);
    if (!/\.(?:ass|json|md)$/u.test(filename)) continue;
    const content = await readFile(join(mediaDir, filename), "utf8");
    if ([PUBLIC_ASSET_NAMES.subtitles, PUBLIC_ASSET_NAMES.transcript].includes(filename)) {
      assert.match(content, cjkPattern, `Chinese subtitles are missing from ${filename}`);
    } else {
      assert.doesNotThrow(() => assertEnglishOnly(content, `English public asset ${filename}`));
    }
  }

  const languageRule = await readFile(join(process.cwd(), "docs", "design", "public-media-language.md"), "utf8");
  assert.doesNotMatch(languageRule, cjkPattern);

  const rootReadme = await readFile(join(process.cwd(), "README.md"), "utf8");
  const publicBlock = rootReadme.match(/<!-- PUBLIC_MEDIA:START -->([\s\S]*?)<!-- PUBLIC_MEDIA:END -->/)?.[1];
  assert.ok(publicBlock, "The root README promotional block must be explicitly marked for language checks.");
  assert.doesNotThrow(() => assertEnglishOnly(publicBlock, "root README promotional block"));
});

test("the complete public media tree keeps bilingual text limited to subtitles and transcript", async () => {
  const mediaRoot = join(process.cwd(), "docs", "media");
  const paths = await listFilesRecursively(mediaRoot);
  assert.ok(paths.includes("README.md"));
  for (const path of paths) {
    assert.doesNotThrow(() => assertEnglishOnly(path.replaceAll("\\", "/"), `public media path ${path}`));
    if (!/\.(?:ass|json|md)$/u.test(path)) continue;
    const content = await readFile(join(mediaRoot, path), "utf8");
    const isBilingualArtifact = path.endsWith(PUBLIC_ASSET_NAMES.subtitles) || path.endsWith(PUBLIC_ASSET_NAMES.transcript);
    if (isBilingualArtifact) assert.match(content, cjkPattern);
    else assert.doesNotThrow(() => assertEnglishOnly(content, `English public media file ${path}`));
  }
  const attributes = await readFile(join(process.cwd(), ".gitattributes"), "utf8");
  assert.match(attributes, /^\*\.mp4 binary$/mu);
});

test("published Chinese subtitles keep every explicit line within the readability limit", async () => {
  const subtitles = await readFile(
    join(process.cwd(), "docs", "media", "codex-text-control-overview", PUBLIC_ASSET_NAMES.subtitles),
    "utf8",
  );
  const lines = subtitles
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("Dialogue:"))
    .flatMap((line) => line.slice(line.lastIndexOf(",,") + 2).split("\\N"));
  assert.ok(lines.length > scenes.length, "Chinese subtitles should be split into readable lines.");
  for (const line of lines) {
    assert.match(line, cjkPattern, `Subtitle line has no Chinese text: ${line}`);
    assert.ok(line.length <= 24, `Subtitle line is too long (${line.length}): ${line}`);
  }
});

test("the render report binds every public artifact and the exact GitHub Actions evidence", async () => {
  const mediaDir = join(process.cwd(), "docs", "media", "codex-text-control-overview");
  const report = JSON.parse(await readFile(join(mediaDir, PUBLIC_ASSET_NAMES.report), "utf8"));
  const expectedArtifacts = ["README.md", PUBLIC_ASSET_NAMES.video, PUBLIC_ASSET_NAMES.cover, PUBLIC_ASSET_NAMES.subtitles, PUBLIC_ASSET_NAMES.transcript].sort();
  assert.deepEqual(report.artifacts.map((artifact) => artifact.file).sort(), expectedArtifacts);
  for (const artifact of report.artifacts) {
    const data = await readFile(join(mediaDir, artifact.file));
    assert.equal(data.length, artifact.bytes, `Size mismatch for ${artifact.file}`);
    assert.equal(createHash("sha256").update(data).digest("hex"), artifact.sha256, `Hash mismatch for ${artifact.file}`);
  }
  assert.equal(report.githubActions.runId, 33545397952);
  assert.equal(report.githubActions.headSha, "863c380cdc3f64707cab56e856f24785a76f5ec0");
  assert.equal(report.githubActions.jobsPassed, 5);
  assert.match(report.githubActions.url, /^https:\/\/github\.com\/wendelxia\/codex-text-control\/actions\/runs\/33545397952$/u);
  assert.ok(report.environment.chrome);
  assert.ok(report.environment.ffmpeg);
  assert.ok(report.environment.ffprobe);
  assert.equal(report.reproducibility.mode, "semantic-not-byte-identical");
  assert.equal(report.locale, "en-US");
  assert.equal(report.subtitleLocale, "zh-CN");
  assert.equal(report.languageGate.englishNarration, "passed");
  assert.equal(report.languageGate.simplifiedChineseSubtitles, "passed");
  assert.match(report.source.productSourceHead, /^[0-9a-f]{40}$/u);
  assert.equal(report.source.identity, "input-hashes-authoritative");
  assert.equal(Object.hasOwn(report.source, "commit"), false);
});

test("public media publication leaves the previous directory untouched when staging fails", async (t) => {
  const fixture = await createPublishFixture(t);
  let copies = 0;
  const failingFs = {
    ...fsPromises,
    copyFile: async (...args) => {
      copies += 1;
      if (copies === 2) throw new Error("simulated copy failure");
      return fsPromises.copyFile(...args);
    },
  };
  await assert.rejects(
    publishDirectoryAtomically({ ...fixture, fs: failingFs, operationId: "copy-failure" }),
    /simulated copy failure/,
  );
  assert.deepEqual(await readdir(fixture.destinationDir), ["old.txt"]);
  assert.equal(await readFile(join(fixture.destinationDir, "old.txt"), "utf8"), "old package");
});

test("public media publication restores the previous directory when activation fails", async (t) => {
  const fixture = await createPublishFixture(t);
  const failingFs = {
    ...fsPromises,
    rename: async (from, to) => {
      if (from.includes(".staging-") && to === fixture.destinationDir) {
        throw new Error("simulated activation failure");
      }
      return fsPromises.rename(from, to);
    },
  };
  await assert.rejects(
    publishDirectoryAtomically({ ...fixture, fs: failingFs, operationId: "activation-failure" }),
    /simulated activation failure/,
  );
  assert.deepEqual(await readdir(fixture.destinationDir), ["old.txt"]);
  assert.deepEqual(await readdir(join(fixture.root, "public")), ["overview"]);
});

test("public media publication reports backup cleanup failure without hiding a successful publish", async (t) => {
  const fixture = await createPublishFixture(t);
  let activated = false;
  const cleanupFailingFs = {
    ...fsPromises,
    rename: async (from, to) => {
      const result = await fsPromises.rename(from, to);
      if (from.includes(".staging-") && to === fixture.destinationDir) activated = true;
      return result;
    },
    rm: async (path, options) => {
      if (activated && path.includes(".backup-")) throw new Error("simulated cleanup failure");
      return fsPromises.rm(path, options);
    },
  };
  const result = await publishDirectoryAtomically({
    ...fixture,
    fs: cleanupFailingFs,
    operationId: "cleanup-failure",
  });
  assert.equal(result.published, true);
  assert.match(result.cleanupWarning, /simulated cleanup failure/);
  assert.deepEqual((await readdir(fixture.destinationDir)).sort(), [...fixture.filenames].sort());
});

test("public media publication rejects paths that can escape the package", async (t) => {
  const fixture = await createPublishFixture(t);
  await assert.rejects(
    publishDirectoryAtomically({ ...fixture, filenames: ["../outside.txt"], operationId: "escape" }),
    /plain filenames/,
  );
});
