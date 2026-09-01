import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { arch as osArch, release as osRelease, version as osVersion } from "node:os";

import {
  PUBLIC_ASSET_NAMES,
  PUBLIC_MEDIA_LOCALE,
  UI_DEMO_LABEL,
  collectPublicText,
  editedMarkdown,
  githubActionsEvidence,
  originalMarkdown,
  scenes,
  sharedCopy,
} from "./promo-content.mjs";
import { escapeHtml, serializeForInlineScript } from "./promo-html.mjs";
import { assertEnglishOnly } from "./public-media-guard.mjs";
import { publishDirectoryAtomically } from "./public-media-publisher.mjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptsDir, "..");
const publicDir = join(rootDir, "docs", "media", "codex-text-control-overview");
const tempDir = join(rootDir, "tmp", "github-promo");
const generatedDir = join(tempDir, "generated");
const uiDir = join(rootDir, "ui");
const chromePath = process.env.CHROME_PATH
  || (process.platform === "win32"
    ? join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe")
    : "google-chrome");
const tempVideo = join(tempDir, PUBLIC_ASSET_NAMES.video);
const tempCover = join(tempDir, PUBLIC_ASSET_NAMES.cover);
const tempSubtitles = join(tempDir, PUBLIC_ASSET_NAMES.subtitles);
const tempTranscript = join(tempDir, PUBLIC_ASSET_NAMES.transcript);
const tempReport = join(tempDir, PUBLIC_ASSET_NAMES.report);
const tempReadme = join(tempDir, "README.md");
const publicFilenames = Object.freeze(["README.md", ...Object.values(PUBLIC_ASSET_NAMES)]);
const fps = 30;

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || rootDir,
      env: { ...process.env, ...(options.env || {}) },
      windowsHide: true,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeoutMs = options.timeoutMs ?? 120_000;
    const settle = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      settle(() => reject(new Error(`${command} exceeded the ${timeoutMs} ms timeout.`)));
    }, timeoutMs);
    if (options.capture) {
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
    }
    child.once("error", (error) => settle(() => reject(error)));
    child.once("exit", (code) => {
      settle(() => {
        if (code === 0) resolvePromise({ stdout, stderr });
        else reject(new Error(`${command} exited with ${code}\n${stderr || stdout}`));
      });
    });
  });
}

async function ensurePath(path, label) {
  try {
    await access(path, fsConstants.F_OK);
  } catch {
    throw new Error(`${label} not found: ${path}`);
  }
}

async function resetTempDirectory() {
  const resolved = resolve(tempDir);
  if (dirname(resolved) !== resolve(rootDir, "tmp") || !resolved.endsWith("github-promo")) {
    throw new Error(`Refusing to reset unexpected path: ${resolved}`);
  }
  await rm(resolved, { recursive: true, force: true });
  await mkdir(generatedDir, { recursive: true });
}

function inlineScript(source) {
  return String(source).replaceAll("</script", "<\\/script");
}

function demoInitScript() {
  const current = {
    id: "rev-demo-042",
    revisionId: "rev-demo-042",
    number: 42,
    source: "Current authoritative version",
    content: originalMarkdown,
    committedAt: "2026-09-02T00:00:00.000Z",
  };
  const output = {
    mode: "full",
    renderId: "github-promo-render-001",
    title: "Project release requirements",
    projectDir: "/workspace/demo",
    sourceText: originalMarkdown,
    revisions: [current],
    current,
  };
  return `<script>
window.__CTC_REQUEST_TIMEOUT_MS__ = 3000;
window.openai = {
  codexTextControlBridgeStatus: { state: "ready" },
  toolOutput: ${serializeForInlineScript(output)}
};
window.codexTextControlMcp = {
  callServerTool: async (request) => ({
    structuredContent: {
      revision: {
        id: "rev-demo-043",
        revisionId: "rev-demo-043",
        number: 43,
        source: "Canvas confirmation",
        content: request.arguments.content
      },
      committedAt: "2026-09-02T00:01:00.000Z",
      followUpMessage: "Context canvas updated. Revision: rev-demo-043."
    }
  }),
  sendFollowUpMessage: async () => undefined
};
</script>`;
}

function demoActionScript(stateName) {
  return `<script>
window.addEventListener("load", async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  };
  const setLabel = (selector, value) => {
    const node = document.querySelector(selector);
    if (node) node.setAttribute("aria-label", value);
  };
  const translateUi = () => {
    document.documentElement.lang = "en";
    document.title = "Codex Context Canvas";
    setText("page-title", "Codex Context Canvas");
    const subtitle = document.querySelector(".subtitle");
    if (subtitle) subtitle.textContent = "Edit text and tables directly. Save only after confirmation.";
    setText("canvas-tab", "Canvas");
    setText("source-tab", "Markdown");
    setText("finish-editing", "Finish editing");
    setText("reset", "Restore current revision");
    setText("editor-label", "Markdown source");
    const summary = document.querySelector("#history-panel summary");
    if (summary) summary.textContent = "Revision history";
    setText("review-title", "Final review before commit");
    setText("review-help", "Review the complete text below. Commit only when it is correct.");
    setText("review-cancel", "Return to edit");
    setText("review-submit", "Confirm commit");
    setLabel(".tabs", "Editing view");
    setLabel(".toolbar", "Canvas tools");
    setLabel("#canvas", "Editable context canvas");
    setLabel("#review-content", "Complete text awaiting commit");
    for (const [index, input] of [...document.querySelectorAll(".block-input")].entries()) {
      input.setAttribute("aria-label", \`Editable context block \${index + 1}\`);
    }
    for (const [index, input] of [...document.querySelectorAll(".cell-input")].entries()) {
      input.setAttribute("aria-label", \`Editable table cell \${index + 1}\`);
    }
    for (const copy of document.querySelectorAll(".revision-copy")) {
      const id = copy.textContent.match(/rev-demo-\\d+/)?.[0] || "rev-demo-042";
      const number = id.endsWith("043") ? "43" : "42";
      const source = id.endsWith("043") ? "Canvas confirmation" : "Current authoritative version";
      copy.textContent = \`Revision \${number} · \${id}\\n\${source}\`;
    }
    for (const button of document.querySelectorAll(".revision button")) button.textContent = "Load";
  };
  const setStatus = (value, meta) => {
    setText("status", value);
    setText("meta", meta);
  };
  const editText = () => {
    const input = [...document.querySelectorAll(".block-input")]
      .find((item) => item.value.includes("Edit the accepted requirements here"));
    if (!input) throw new Error("Demo paragraph was not found.");
    input.value = "Edit text and tables directly while keeping accepted requirements intact.";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return input;
  };
  const editTable = () => {
    const input = [...document.querySelectorAll(".cell-input")]
      .find((item) => item.value === "Needs review");
    if (!input) throw new Error("Demo table cell was not found.");
    input.value = "Confirmed";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return input;
  };
  const verifyVisibleLanguage = () => {
    const visible = [];
    const isVisible = (element) => element && !element.closest("script,style") && element.getClientRects().length > 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const value = walker.currentNode.nodeValue.trim();
      if (value && isVisible(walker.currentNode.parentElement)) visible.push(value);
    }
    for (const input of document.querySelectorAll("input,textarea")) {
      if (isVisible(input) && input.value) visible.push(input.value);
    }
    for (const element of document.querySelectorAll("[aria-label],[title],[placeholder]")) {
      if (!isVisible(element)) continue;
      for (const name of ["aria-label", "title", "placeholder"]) {
        const value = element.getAttribute(name);
        if (value) visible.push(value);
      }
    }
    const unsupported = [...visible.join("\\n")].filter((character) => {
      const codePoint = character.codePointAt(0);
      return !(
        codePoint === 0x09
        || codePoint === 0x0a
        || codePoint === 0x0d
        || (codePoint >= 0x20 && codePoint <= 0x7e)
        || codePoint === 0x00b7
      );
    });
    document.documentElement.dataset.promoLanguageCheck = unsupported.length ? "failed" : "passed";
    document.documentElement.dataset.promoUnsupportedCodepoints = [...new Set(unsupported)]
      .map((character) => \`U+\${character.codePointAt(0).toString(16).toUpperCase()}\`)
      .join(",");
  };

  await wait(120);
  translateUi();
  let focusTarget = null;
  const stateName = ${serializeForInlineScript(stateName)};
  if (stateName !== "initial") focusTarget = editText();
  if (["edited-table", "source", "review", "returned", "success", "history"].includes(stateName)) {
    focusTarget = editTable();
  }
  if (stateName === "source") {
    document.getElementById("source-tab").click();
    focusTarget = document.getElementById("editor");
  }
  if (["review", "returned", "success", "history"].includes(stateName)) {
    document.getElementById("finish-editing").click();
    await wait(100);
  }
  if (stateName === "returned") {
    document.getElementById("review-cancel").click();
    await wait(80);
  }
  if (["success", "history"].includes(stateName)) {
    document.getElementById("review-submit").click();
    await wait(260);
  }
  if (stateName === "history") document.getElementById("history-panel").open = true;

  translateUi();
  if (stateName === "initial") {
    setStatus("Connected to Codex · changes save only after confirmation.", "Current authoritative revision: rev-demo-042");
  } else if (stateName === "review") {
    setStatus("Reviewing the complete draft · nothing has been saved yet.", "Current authoritative revision: rev-demo-042 · unsaved changes");
  } else if (stateName === "returned") {
    setStatus("Draft retained · no revision was written.", "Current authoritative revision: rev-demo-042 · unsaved changes");
  } else if (["success", "history"].includes(stateName)) {
    setStatus("Revision rev-demo-043 committed and sent to the conversation.", "Current authoritative revision: rev-demo-043");
  } else {
    setStatus("Draft changed locally · finish editing to review it.", "Current authoritative revision: rev-demo-042 · unsaved changes");
  }
  if (focusTarget && stateName !== "review") focusTarget.focus();
  verifyVisibleLanguage();
  document.documentElement.dataset.promoReady = "true";
});
</script>`;
}

async function renderUiStates() {
  const [editorHtml, canvasModel, editorJs] = await Promise.all([
    readFile(join(uiDir, "editor.html"), "utf8"),
    readFile(join(uiDir, "canvas-model.js"), "utf8"),
    readFile(join(uiDir, "editor.js"), "utf8"),
  ]);
  const stateNames = ["initial", "edited-text", "edited-table", "source", "review", "returned", "success", "history"];
  const uiPaths = {};
  const languageChecks = [];
  for (const stateName of stateNames) {
    const html = editorHtml
      .replace(
        "</head>",
        `<style>
          :root { color-scheme: light !important; --bg:#f4f6f8 !important; --surface:#fff !important; --surface-subtle:#eef2f5 !important; --text:#17202a !important; --muted:#5d6874 !important; --border:#c8d0d8 !important; --focus:#2374c6 !important; --accent:#216e4e !important; --on-accent:#fff !important; --danger:#b42318 !important; --warning:#8a4b08 !important; }
          body, main { background:#f4f6f8 !important; }
        </style></head>`,
      )
      .replace(
        '<script src="canvas-model.js"></script>',
        `${demoInitScript()}<script>${inlineScript(canvasModel)}</script>`,
      )
      .replace(
        '<script src="editor.js"></script>',
        `<script>${inlineScript(editorJs)}</script>${demoActionScript(stateName)}`,
      );
    const htmlPath = join(generatedDir, `ui-${stateName}.html`);
    const screenshotPath = join(generatedDir, `ui-${stateName}.png`);
    await writeFile(htmlPath, html, "utf8");
    const chromeArgs = [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--window-size=1280,780",
      "--force-device-scale-factor=1",
      "--virtual-time-budget=2200",
    ];
    await run(chromePath, [
      ...chromeArgs,
      `--user-data-dir=${join(generatedDir, `chrome-shot-${stateName}`)}`,
      `--screenshot=${screenshotPath}`,
      pathToFileURL(htmlPath).href,
    ], { capture: true });
    const dom = await run(chromePath, [
      ...chromeArgs,
      `--user-data-dir=${join(generatedDir, `chrome-dom-${stateName}`)}`,
      "--dump-dom",
      pathToFileURL(htmlPath).href,
    ], { capture: true });
    if (!/data-promo-ready="true"/.test(dom.stdout)) {
      throw new Error(`UI state did not finish rendering: ${stateName}`);
    }
    if (!/data-promo-language-check="passed"/.test(dom.stdout)) {
      const codePoints = dom.stdout.match(/data-promo-unsupported-codepoints="([^"]*)"/)?.[1] || "unknown";
      throw new Error(`English-only visible UI check failed for ${stateName}: ${codePoints}`);
    }
    languageChecks.push({ state: stateName, result: "passed" });
    uiPaths[stateName] = screenshotPath;
  }
  return { uiPaths, languageChecks };
}

function commonSceneCss() {
  return `
    * { box-sizing:border-box; }
    html,body { width:1920px; height:1080px; margin:0; overflow:hidden; }
    body { background:#f4f6f8; color:#111827; font-family:Arial,"Segoe UI",sans-serif; letter-spacing:0; }
    .stage { position:relative; width:100%; height:100%; padding:52px 72px 126px; overflow:hidden; }
    .mast { display:flex; align-items:center; justify-content:space-between; height:52px; margin-bottom:32px; border-bottom:2px solid #111827; }
    .brand { font-size:26px; font-weight:800; }
    .proof { color:#5d6874; font-size:19px; }
    h1 { margin:0; max-width:980px; font-size:62px; line-height:1.08; font-weight:800; letter-spacing:0; }
    h2 { margin:0; font-size:45px; line-height:1.16; letter-spacing:0; }
    p { margin:0; font-size:26px; line-height:1.48; }
    .eyebrow { margin-bottom:18px; color:#216e4e; font-size:21px; font-weight:800; text-transform:uppercase; }
    .muted { color:#5d6874; }
    .green { color:#216e4e; }
    .blue { color:#2374c6; }
    .red { color:#b42318; }
    .ui { display:block; width:100%; height:100%; object-fit:contain; object-position:center top; border:1px solid #c8d0d8; border-radius:8px; box-shadow:0 22px 50px rgba(17,24,39,.16); background:#fff; }
    .ui-shell { display:grid; grid-template-rows:auto minmax(0,1fr); gap:10px; height:100%; min-height:0; }
    .ui-frame { min-height:0; overflow:hidden; border-radius:8px; background:#e7ebef; }
    .demo-label { justify-self:end; padding:7px 11px; border:1px solid #c8d0d8; border-radius:6px; background:#fff; color:#5d6874; font-size:15px; font-weight:700; }
    .step { display:inline-grid; place-items:center; width:48px; height:48px; margin-right:14px; border-radius:50%; background:#111827; color:#fff; font-size:24px; font-weight:800; vertical-align:middle; }
    .footer { position:absolute; left:72px; right:72px; bottom:40px; display:flex; justify-content:space-between; color:#5d6874; font-size:17px; border-top:1px solid #c8d0d8; padding-top:14px; }
    .tag { display:inline-block; padding:9px 13px; border-radius:6px; background:#e7f2ec; color:#216e4e; font-size:18px; font-weight:750; }
  `;
}

function uiImage(uiUrl) {
  return `<div class="ui-shell"><span class="demo-label">${escapeHtml(UI_DEMO_LABEL)}</span><div class="ui-frame"><img class="ui" src="${escapeHtml(uiUrl)}" alt="Codex Text Control interface demonstration"></div></div>`;
}

function sceneBody(scene, uiUrl) {
  scene = {
    ...scene,
    eyebrow: escapeHtml(scene.eyebrow),
    title: escapeHtml(scene.title),
    body: escapeHtml(scene.body),
  };
  const image = uiImage(uiUrl);
  if (scene.stage === "intro") return `
    <section style="display:grid;grid-template-columns:700px 1fr;gap:58px;align-items:center;height:790px;">
      <div><div class="tag">${scene.eyebrow}</div><h1 style="margin-top:24px;">${scene.title}</h1><p class="muted" style="margin-top:26px;max-width:650px;">${scene.body}</p></div>
      <div style="height:680px;">${image}</div>
    </section>`;
  if (scene.stage === "problem-fragmentation") return `
    <section style="display:grid;grid-template-columns:790px 1fr;gap:76px;align-items:center;height:790px;">
      <div><div class="eyebrow">${scene.eyebrow}</div><h1>${scene.title}</h1><p class="muted" style="margin-top:28px;">${scene.body}</p></div>
      <div style="border-left:2px solid #c8d0d8;padding-left:52px;">
        ${[
          ["01", "Keep the real user loop"],
          ["02", "Add evidence limits"],
          ["03", "Make the table editable"],
          ["?", "Which message is final?"],
        ].map(([number, text], index) => `<div style="display:grid;grid-template-columns:58px 1fr;gap:18px;padding:22px 0;border-bottom:1px solid #c8d0d8;"><strong style="color:${index === 3 ? "#b42318" : "#2374c6"};font-size:22px;">${number}</strong><span style="font-size:27px;font-weight:${index === 3 ? 800 : 600};">${text}</span></div>`).join("")}
      </div>
    </section>`;
  if (scene.stage === "problem-precision") return `
    <section style="display:grid;grid-template-rows:auto 1fr;gap:34px;height:790px;">
      <div style="display:flex;justify-content:space-between;gap:60px;align-items:flex-end;"><div><div class="eyebrow">${scene.eyebrow}</div><h2 style="max-width:980px;">${scene.title}</h2></div><p class="muted" style="max-width:620px;font-size:22px;">${scene.body}</p></div>
      <div style="display:grid;grid-template-columns:1fr 120px 1fr;align-items:center;">
        <div style="border:2px solid #111827;background:#fff;"><div style="padding:18px 22px;background:#eef2f5;font-size:20px;font-weight:800;">Before</div><div style="display:grid;grid-template-columns:1.3fr 1fr 1fr;font-size:24px;"><strong style="padding:22px;border-top:1px solid #c8d0d8;">Real user loop</strong><span style="padding:22px;border:1px solid #c8d0d8;border-bottom:0;">Needs review</span><span style="padding:22px;border-top:1px solid #c8d0d8;">Product owner</span></div></div>
        <div style="text-align:center;font-size:54px;color:#2374c6;">&gt;</div>
        <div style="border:2px solid #216e4e;background:#fff;"><div style="padding:18px 22px;background:#e7f2ec;color:#216e4e;font-size:20px;font-weight:800;">One cell changed</div><div style="display:grid;grid-template-columns:1.3fr 1fr 1fr;font-size:24px;"><strong style="padding:22px;border-top:1px solid #c8d0d8;">Real user loop</strong><span style="padding:22px;border:2px solid #216e4e;border-bottom:0;background:#e7f2ec;font-weight:800;">Confirmed</span><span style="padding:22px;border-top:1px solid #c8d0d8;">Product owner</span></div></div>
      </div>
    </section>`;
  if (scene.stage === "problem-authority") return `
    <section style="display:grid;grid-template-rows:auto 1fr;gap:42px;height:790px;">
      <div><div class="eyebrow">${scene.eyebrow}</div><h1>${scene.title}</h1></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border:2px solid #111827;background:#fff;">
        <div style="padding:48px;border-right:2px solid #111827;"><div class="blue" style="font-size:24px;font-weight:800;">CHAT</div><h2 style="margin-top:20px;">Explore, compare, revise</h2><p class="muted" style="margin-top:26px;">Useful conversation can stay messy while ideas are still changing.</p></div>
        <div style="padding:48px;"><div class="green" style="font-size:24px;font-weight:800;">AUTHORITATIVE CONTEXT</div><h2 style="margin-top:20px;">One reviewed current version</h2><p class="muted" style="margin-top:26px;">Only user-confirmed text becomes the context future answers should follow.</p></div>
      </div>
    </section>`;
  if (scene.stage === "use-open") return `
    <section style="display:grid;grid-template-rows:auto 1fr;gap:28px;height:790px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:42px;"><div><div class="eyebrow">${scene.eyebrow}</div><h2><span class="step">1</span>${scene.title}</h2></div><div style="max-width:730px;padding:18px 24px;border-left:5px solid #216e4e;background:#e7f2ec;font-size:25px;font-weight:750;">Open the current authoritative context canvas</div></div>
      <div style="height:650px;">${image}</div>
    </section>`;
  if (scene.stage === "use-notification") return `
    <section style="display:grid;grid-template-rows:auto 1fr;gap:26px;height:790px;">
      <div><div class="eyebrow">${scene.eyebrow}</div><h2><span class="step">8</span>${scene.title}</h2></div>
      <div style="display:grid;grid-template-columns:minmax(0,1120px) 1fr;gap:42px;height:650px;">
        <div style="height:650px;">${image}</div>
        <aside style="display:flex;flex-direction:column;justify-content:center;gap:24px;border-left:4px solid #2374c6;padding-left:30px;">
          <div class="blue" style="font-size:19px;font-weight:800;text-transform:uppercase;">Simulated Codex host message</div>
          <div style="padding:24px;border:1px solid #c8d0d8;border-radius:8px;background:#fff;font:20px/1.55 'Cascadia Code',Consolas,monospace;">Context canvas updated.<br>Revision: rev-demo-043.</div>
          <p class="muted" style="font-size:20px;">${scene.body}</p>
        </aside>
      </div>
    </section>`;
  if (scene.stage === "use-reread") return `
    <section style="display:grid;grid-template-rows:auto 1fr;gap:30px;height:790px;">
      <div><div class="eyebrow">${scene.eyebrow}</div><h2><span class="step">10</span>${scene.title}</h2></div>
      <div style="display:grid;grid-template-columns:1fr 120px 1fr 120px 1fr;align-items:center;">
        ${[
          ["1", "Resolve pointer", "current.json identifies rev-demo-043"],
          ["2", "Read snapshot", "The full accepted Markdown comes from project storage"],
          ["3", "Answer from it", "The next response uses the reviewed context"],
        ].map(([number, title, body], index) => `${index ? '<div style="text-align:center;font-size:46px;color:#2374c6;">&gt;</div>' : ''}<div style="min-height:300px;padding:32px;border-top:4px solid ${index === 2 ? '#216e4e' : '#111827'};background:#fff;"><span class="step">${number}</span><h2 style="margin-top:24px;font-size:32px;">${title}</h2><p class="muted" style="margin-top:22px;font-size:20px;">${body}</p></div>`).join("")}
      </div>
    </section>`;
  if (scene.stage.startsWith("use-")) {
    const stepNumber = {
      "use-edit-text": 2,
      "use-edit-table": 3,
      "use-source": 4,
      "use-review": 5,
      "use-return": 6,
      "use-commit": 7,
      "use-history": 9,
    }[scene.stage];
    const annotation = {
      "use-edit-text": "Draft only · no revision created",
      "use-edit-table": "One cell · surrounding text preserved",
      "use-source": "The same draft in Markdown",
      "use-review": "Complete text · read-only final check",
      "use-return": "Draft retained · current pointer unchanged",
      "use-commit": "rev-demo-043 · immutable snapshot",
      "use-notification": "Only the revision ID returns to chat",
      "use-history": "Load first · confirm again to restore",
      "use-reread": "The next answer resolves the accepted pointer",
    }[scene.stage];
    return `
      <section style="display:grid;grid-template-rows:auto 1fr;gap:26px;height:790px;">
        <div><div class="eyebrow">${scene.eyebrow}</div><h2><span class="step">${stepNumber}</span>${scene.title}</h2></div>
        <div style="display:grid;grid-template-columns:minmax(0,1180px) 1fr;gap:36px;height:650px;">
          <div style="height:650px;">${image}</div>
          <aside style="display:flex;flex-direction:column;justify-content:space-between;border-left:4px solid #216e4e;padding:28px 0 28px 28px;">
            <div><div class="green" style="font-size:19px;font-weight:800;text-transform:uppercase;">What changes</div><p style="margin-top:20px;font-size:24px;font-weight:700;">${annotation}</p></div>
            <p class="muted" style="font-size:20px;">${scene.body}</p>
          </aside>
        </div>
      </section>`;
  }
  return `
    <section style="display:grid;grid-template-columns:1fr 720px;gap:72px;align-items:center;height:790px;">
      <div><div class="tag">${scene.eyebrow}</div><h1 style="margin-top:24px;">${scene.title}</h1><p style="margin-top:28px;font:24px 'Cascadia Code',Consolas,monospace;color:#2374c6;">${escapeHtml(sharedCopy.repository)}</p><p class="muted" style="margin-top:24px;font-size:20px;">Current evidence is deliberately narrower than a production-readiness claim.</p></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;border-top:2px solid #111827;border-left:2px solid #111827;">
        ${[["74 / 74", "Product tests"], ["5 / 5", "GitHub Actions jobs"], ["MIT", "License"], ["0.5.8", "Source candidate"]].map(([value, label]) => `<div style="height:205px;padding:32px;border-right:2px solid #111827;border-bottom:2px solid #111827;background:#fff;"><strong style="display:block;font-size:48px;line-height:1;color:#216e4e;">${value}</strong><span style="display:block;margin-top:20px;color:#5d6874;font-size:21px;">${label}</span></div>`).join("")}
      </div>
    </section>`;
}

async function renderSceneFrames(uiPaths) {
  const scenePaths = [];
  for (const scene of scenes) {
    const uiUrl = pathToFileURL(uiPaths[scene.uiState]).href;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${commonSceneCss()}</style></head><body><div class="stage"><header class="mast"><span class="brand">${escapeHtml(sharedCopy.product)}</span><span class="proof">${escapeHtml(sharedCopy.candidate)}</span></header>${sceneBody(scene, uiUrl)}<footer class="footer"><span>${escapeHtml(sharedCopy.footer)}</span><span>${escapeHtml(sharedCopy.repository)}</span></footer></div></body></html>`;
    assertEnglishOnly([scene, sharedCopy, UI_DEMO_LABEL], `scene ${scene.id}`);
    assertEnglishOnly(html.replaceAll(uiUrl, ""), `visible scene template ${scene.id}`);
    const htmlPath = join(generatedDir, `scene-${scene.id}.html`);
    const pngPath = join(generatedDir, `scene-${scene.id}.png`);
    await writeFile(htmlPath, html, "utf8");
    await run(chromePath, [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      `--user-data-dir=${join(generatedDir, `chrome-scene-${scene.id}`)}`,
      "--window-size=1920,1080",
      "--force-device-scale-factor=1",
      "--virtual-time-budget=1200",
      `--screenshot=${pngPath}`,
      pathToFileURL(htmlPath).href,
    ], { capture: true });
    scenePaths.push(pngPath);
  }
  await copyFile(scenePaths[0], tempCover);
  return scenePaths;
}

function psQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function synthesizeNarration() {
  const wavPaths = [];
  const voiceDescriptions = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const textPath = join(generatedDir, `voice-${index + 1}.txt`);
    const wavPath = join(generatedDir, `voice-${index + 1}.wav`);
    await writeFile(textPath, scenes[index].narration, "utf8");
    const powershell = `$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$synth=New-Object System.Speech.Synthesis.SpeechSynthesizer
$candidate=$synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'en-*' } | Select-Object -First 1
if(-not $candidate){throw 'No enabled English speech voice is installed.'}
$synth.SelectVoice($candidate.VoiceInfo.Name)
$synth.Rate=0
$synth.Volume=100
$synth.SetOutputToWaveFile(${psQuote(wavPath)})
$text=[IO.File]::ReadAllText(${psQuote(textPath)},[Text.Encoding]::UTF8)
$synth.Speak($text)
$synth.SetOutputToNull()
$synth.Dispose()
if((Get-Item ${psQuote(wavPath)}).Length -le 46){throw 'Speech synthesis produced an empty WAV file.'}
[pscustomobject]@{name=$candidate.VoiceInfo.Name;culture=$candidate.VoiceInfo.Culture.Name} | ConvertTo-Json -Compress`;
    const encoded = Buffer.from(powershell, "utf16le").toString("base64");
    const result = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-STA", "-EncodedCommand", encoded], { capture: true });
    const description = result.stdout.trim().split(/\r?\n/u).filter(Boolean).at(-1);
    voiceDescriptions.push(description ? JSON.parse(description) : null);
    wavPaths.push(wavPath);
  }
  return {
    wavPaths,
    voice: voiceDescriptions.find(Boolean) || { name: "Windows SAPI English voice", culture: PUBLIC_MEDIA_LOCALE },
  };
}

function firstOutputLine(result) {
  return `${result.stdout}\n${result.stderr}`.split(/\r?\n/u).map((line) => line.trim()).find(Boolean) || "unknown";
}

async function probeRenderEnvironment() {
  const windowsMetadataScript = `$ErrorActionPreference='Stop'
$chrome=Get-Item ${psQuote(chromePath)}
$font=Join-Path $env:WINDIR 'Fonts\\arial.ttf'
if(-not (Test-Path $font)){throw 'Arial font file is not installed.'}
$item=Get-Item $font
[pscustomobject]@{
  chrome=('Google Chrome ' + $chrome.VersionInfo.ProductVersion)
  font=[pscustomobject]@{family='Arial';file=$item.Name;fileVersion=$item.VersionInfo.FileVersion}
} | ConvertTo-Json -Compress`;
  const encodedMetadataScript = Buffer.from(windowsMetadataScript, "utf16le").toString("base64");
  const [ffmpeg, ffprobe, windowsMetadata] = await Promise.all([
    run("ffmpeg", ["-version"], { capture: true }),
    run("ffprobe", ["-version"], { capture: true }),
    run("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedMetadataScript], { capture: true }),
  ]);
  const metadataLine = windowsMetadata.stdout.trim().split(/\r?\n/u).filter(Boolean).at(-1);
  const metadata = JSON.parse(metadataLine);
  return {
    os: {
      platform: process.platform,
      release: osRelease(),
      version: osVersion(),
      architecture: osArch(),
    },
    node: process.version,
    chrome: metadata.chrome,
    ffmpeg: firstOutputLine(ffmpeg),
    ffprobe: firstOutputLine(ffprobe),
    font: metadata.font,
  };
}

async function probeDuration(path) {
  const result = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    path,
  ], { capture: true });
  const duration = Number(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid duration for ${path}`);
  return duration;
}

function assTime(seconds) {
  const centiseconds = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  const cs = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function subtitleText(text, maxLineLength = 54) {
  const words = text.split(/\s+/u);
  const lines = [];
  let currentLine = "";
  for (const word of words) {
    const candidate = `${currentLine} ${word}`.trim();
    if (candidate.length <= maxLineLength) {
      currentLine = candidate;
      continue;
    }
    if (currentLine) lines.push(currentLine);
    if (word.length <= maxLineLength) {
      currentLine = word;
      continue;
    }
    for (let offset = 0; offset < word.length; offset += maxLineLength) {
      const chunk = word.slice(offset, offset + maxLineLength);
      if (chunk.length === maxLineLength) lines.push(chunk);
      else currentLine = chunk;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.join("\\N");
}

async function writeSubtitlesAndTranscript(durations, voiceDurations) {
  let cursor = 0;
  const events = [];
  const transcriptRows = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const start = cursor + 0.28;
    const end = Math.min(cursor + durations[index] - 0.25, start + voiceDurations[index] + 0.55);
    events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${subtitleText(scenes[index].narration)}`);
    transcriptRows.push(`## ${assTime(cursor)} · ${scenes[index].title}\n\n${scenes[index].narration}`);
    cursor += durations[index];
  }
  const ass = `[Script Info]
Title: Codex Text Control overview
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Default,Arial,36,&H00FFFFFF,&H00FFFFFF,&H00111827,&H98000000,0,0,0,0,100,100,0,0,3,1,0,2,90,90,70,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
${events.join("\n")}
`;
  const transcript = `# Codex Text Control Overview Transcript

- Language: English (United States)
- Source status: 0.5.8 source candidate
- Screen label: ${UI_DEMO_LABEL}

${transcriptRows.join("\n\n")}

## Evidence boundary

The interface screens are generated from the current product source with a simulated Codex bridge. They are not a recording of the Codex host. The repository evidence supports 74/74 automated tests, 5/5 GitHub Actions jobs, and an MIT license. It does not establish production readiness, cross-platform host support, or an external capability benchmark.
`;
  assertEnglishOnly([ass, transcript], "subtitles and transcript");
  await Promise.all([
    writeFile(tempSubtitles, ass, "utf8"),
    writeFile(tempTranscript, transcript, "utf8"),
  ]);
}

async function writeMediaReadme() {
  const readme = `# Codex Text Control Overview

[![Watch the Codex Text Control overview](codex-text-control-overview-cover.png)](codex-text-control-overview.mp4)

**[Watch the English overview](codex-text-control-overview.mp4)**

## Purpose

This media package explains why chat alone is a poor place to maintain accepted context, then demonstrates the complete user-confirmed workflow in Codex Text Control.

The problem section covers fragmented amendments, precise one-cell table changes, and the boundary between discussion and accepted context. The usage section shows opening the canvas, editing text, editing a table cell, switching to Markdown source, reviewing the complete draft, returning without saving, confirming one immutable revision, receiving the revision ID in the conversation, inspecting history, and re-reading the accepted revision before the next answer.

## Files

| File | Purpose | Input | Output |
| --- | --- | --- | --- |
| [\`codex-text-control-overview.mp4\`](codex-text-control-overview.mp4) | Main product overview | Rendered scenes, narration, and subtitles | 1920x1080 H.264 and AAC video |
| [\`codex-text-control-overview-cover.png\`](codex-text-control-overview-cover.png) | GitHub preview image | Intro scene | 1920x1080 PNG |
| [\`codex-text-control-overview.en.ass\`](codex-text-control-overview.en.ass) | Editable subtitle source | Scene narration and measured timing | Advanced SubStation Alpha subtitle file |
| [\`transcript.en.md\`](transcript.en.md) | Accessible text alternative | Scene narration | Timestamped English transcript |
| [\`render-report.json\`](render-report.json) | Reproducibility evidence | Source hashes, tool versions, media probes, and public artifacts | Machine-readable report |

## Reproduce

Run from the repository root on Windows:

\`\`\`powershell
npm ci --ignore-scripts
npm run render:promo:github
\`\`\`

Inputs are [\`scripts/promo-content.mjs\`](../../../scripts/promo-content.mjs), [\`scripts/public-media-guard.mjs\`](../../../scripts/public-media-guard.mjs), [\`scripts/render-github-promo.mjs\`](../../../scripts/render-github-promo.mjs), and the current files in [\`ui/\`](../../../ui/). Temporary frames, audio, and segments are written under the ignored \`tmp/github-promo/\` directory. Publication replaces this complete directory only after every check passes.

Dependencies are Node.js 22 or newer, Google Chrome, FFmpeg, FFprobe, Windows speech synthesis, and an enabled English voice. The exact verified environment is recorded in [\`render-report.json\`](render-report.json).

## Verification

The render rejects public characters outside printable ASCII and the middle dot used by the demonstration label. It checks storyboard copy, hardcoded scene copy, visible product text, form values, accessibility labels, subtitles, transcript, package documentation, and report metadata. Every public artifact is bound to a byte size and SHA-256 digest in the report.

The verified GitHub Actions evidence is run [\`${githubActionsEvidence.runId}\`](${githubActionsEvidence.url}), commit \`${githubActionsEvidence.headSha}\`, observed ${githubActionsEvidence.observedAt}, with ${githubActionsEvidence.jobsPassed}/${githubActionsEvidence.jobsTotal} jobs passing and conclusion \`${githubActionsEvidence.conclusion}\`.

## Limits

- Product screens come from the current UI source with a simulated Codex bridge. They are labeled \`${UI_DEMO_LABEL}\` and are not a real Codex host recording.
- English labels belong to the demonstration harness and do not claim product localization.
- Version 0.5.8 remains a source candidate. The video does not claim production readiness, one-click installation, industry leadership, or cross-platform host support.
- The repository evidence supports 74/74 product tests before this media-only change, 5/5 jobs in the cited GitHub Actions run, and an MIT license. It does not provide an external authoritative capability benchmark for this workflow.
- Rendering is semantically reproducible, but compatible browser, voice, font, and codec versions may produce different bytes.

Objective assessment: the package explains both the user problem and the full confirmation loop with inspectable source and artifact evidence. It remains a source-generated demonstration, not independent user validation.
`;
  assertEnglishOnly(readme, "media package README");
  await writeFile(tempReadme, readme, "utf8");
}

async function encodeSegments(scenePaths, wavPaths) {
  const voiceDurations = await Promise.all(wavPaths.map(probeDuration));
  const durations = scenes.map((scene, index) => Math.max(
    scene.minDuration,
    Math.ceil((voiceDurations[index] + 0.9) * 10) / 10,
  ));
  const segmentPaths = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const duration = durations[index];
    const frames = Math.ceil(duration * fps);
    const segmentPath = join(generatedDir, `segment-${index + 1}.mp4`);
    const filter = `[0:v]scale=1920:1080,zoompan=z='min(zoom+0.000045,1.007)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1920x1080:fps=${fps},setsar=1,format=yuv420p[v];[1:a]adelay=280:all=1,apad=pad_dur=${duration.toFixed(2)},atrim=0:${duration.toFixed(2)},afade=t=in:st=0.28:d=0.10,afade=t=out:st=${Math.max(0, duration - 0.45).toFixed(2)}:d=0.35[a]`;
    await run("ffmpeg", [
      "-y",
      "-loop", "1",
      "-framerate", String(fps),
      "-i", scenePaths[index],
      "-i", wavPaths[index],
      "-filter_complex", filter,
      "-map", "[v]",
      "-map", "[a]",
      "-t", duration.toFixed(2),
      "-r", String(fps),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "19",
      "-profile:v", "high",
      "-level", "4.1",
      "-g", "60",
      "-c:a", "aac",
      "-b:a", "160k",
      "-ar", "48000",
      segmentPath,
    ]);
    segmentPaths.push(segmentPath);
  }
  await writeSubtitlesAndTranscript(durations, voiceDurations);
  return { durations, voiceDurations, segmentPaths };
}

async function concatAndCaption(segmentPaths) {
  const inputs = segmentPaths.flatMap((path) => ["-i", path]);
  const concatInputs = segmentPaths.map((_, index) => `[${index}:v][${index}:a]`).join("");
  const subtitleFile = PUBLIC_ASSET_NAMES.subtitles.replaceAll("'", "\\'");
  const filter = `${concatInputs}concat=n=${segmentPaths.length}:v=1:a=1[vcat][acat];[vcat]ass='${subtitleFile}'[vout];[acat]loudnorm=I=-16:LRA=7:TP=-1.5[aout]`;
  await run("ffmpeg", [
    "-y", ...inputs,
    "-filter_complex", filter,
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "fast", "-crf", "19",
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
    "-movflags", "+faststart",
    tempVideo,
  ], { cwd: tempDir });
}

function sceneMidpoints(durations) {
  let cursor = 0;
  return durations.map((duration) => {
    const midpoint = cursor + (duration / 2);
    cursor += duration;
    return midpoint;
  });
}

async function extractQaFrames(durations) {
  const paths = [];
  for (const [index, time] of sceneMidpoints(durations).entries()) {
    const path = join(generatedDir, `qa-${String(index + 1).padStart(2, "0")}-${scenes[index].id}.png`);
    await run("ffmpeg", [
      "-y", "-ss", time.toFixed(2), "-i", tempVideo,
      "-frames:v", "1", path,
    ], { capture: true });
    paths.push(path);
  }
  return paths;
}

async function sha256(path) {
  const data = await readFile(path);
  return createHash("sha256").update(data).digest("hex");
}

async function makeReport({ durations, voiceDurations, voice, qaFrames, languageChecks, environment }) {
  await run("ffmpeg", ["-v", "error", "-i", tempVideo, "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null"], { capture: true });
  const probe = await run("ffprobe", [
    "-v", "error", "-show_format", "-show_streams", "-of", "json", tempVideo,
  ], { capture: true });
  const loudness = await run("ffmpeg", [
    "-i", tempVideo, "-vn", "-af", "loudnorm=I=-16:LRA=7:TP=-1.5:print_format=json", "-f", "null", process.platform === "win32" ? "NUL" : "/dev/null",
  ], { capture: true });
  const media = JSON.parse(probe.stdout);
  const videoStat = await stat(tempVideo);
  const productSourceHead = (await run("git", ["rev-parse", "HEAD"], { capture: true })).stdout.trim();
  const inputs = [
    join(scriptsDir, "promo-content.mjs"),
    join(scriptsDir, "promo-html.mjs"),
    join(scriptsDir, "public-media-guard.mjs"),
    join(scriptsDir, "public-media-publisher.mjs"),
    join(scriptsDir, "render-github-promo.mjs"),
    join(rootDir, "docs", "design", "public-media-language.md"),
    join(uiDir, "editor.html"),
    join(uiDir, "editor.js"),
    join(uiDir, "canvas-model.js"),
  ];
  const report = {
    generatedAt: new Date().toISOString(),
    locale: PUBLIC_MEDIA_LOCALE,
    purpose: "Explain why authoritative context needs a direct editing surface and demonstrate the complete user-confirmed revision loop.",
    source: {
      productSourceHead,
      identity: "input-hashes-authoritative",
      note: "The HEAD identifies the product baseline at render time. The input hashes below identify the exact staged or working-tree render sources.",
      version: "0.5.8",
      screenLabel: UI_DEMO_LABEL,
    },
    output: {
      file: `docs/media/codex-text-control-overview/${PUBLIC_ASSET_NAMES.video}`,
      bytes: videoStat.size,
      sha256: await sha256(tempVideo),
      durationSeconds: Number(media.format.duration),
      streams: media.streams.map((stream) => ({
        codecType: stream.codec_type,
        codecName: stream.codec_name,
        width: stream.width,
        height: stream.height,
        frameRate: stream.r_frame_rate,
        sampleRate: stream.sample_rate,
        channels: stream.channels,
      })),
      loudnessAnalysis: loudness.stderr.split(/\r?\n/).filter((line) => /input_i|input_tp|input_lra|input_thresh/.test(line)),
      cleanDecode: true,
    },
    narration: {
      voice,
      sceneDurationsSeconds: durations,
      voiceDurationsSeconds: voiceDurations,
    },
    environment: {
      ...environment,
      speechVoice: voice.name,
      speechCulture: voice.culture,
    },
    githubActions: githubActionsEvidence,
    reproducibility: {
      mode: "semantic-not-byte-identical",
      guarantee: "The same source and compatible tools reproduce the same scenes, narration text, dimensions, codecs, and evidence structure.",
      byteLimit: "Browser rendering, speech synthesis, font rasterization, and codec builds can change encoded bytes across toolchains.",
    },
    languageGate: {
      publicCopy: "passed",
      renderedVisibleUi: languageChecks,
    },
    inputs: await Promise.all(inputs.map(async (path) => ({
      file: relative(rootDir, path).replaceAll("\\", "/"),
      sha256: await sha256(path),
    }))),
    artifacts: await Promise.all([
      tempReadme,
      tempVideo,
      tempCover,
      tempSubtitles,
      tempTranscript,
    ].map(async (path) => ({
      file: relative(tempDir, path).replaceAll("\\", "/"),
      bytes: (await stat(path)).size,
      sha256: await sha256(path),
    }))),
    qaFrames: await Promise.all(qaFrames.map(async (path, index) => ({
      scene: scenes[index].id,
      file: relative(rootDir, path).replaceAll("\\", "/"),
      bytes: (await stat(path)).size,
      sha256: await sha256(path),
    }))),
    verifiedClaims: [
      "The product test suite reported 74/74 tests passing before this media-only change.",
      `GitHub Actions run ${githubActionsEvidence.runId} for commit ${githubActionsEvidence.headSha} reported ${githubActionsEvidence.jobsPassed}/${githubActionsEvidence.jobsTotal} jobs passing with conclusion ${githubActionsEvidence.conclusion} on ${githubActionsEvidence.observedAt}.`,
      "The repository license is MIT.",
    ],
    limitations: [
      "Product screens are generated from the current source with a simulated Codex bridge; they are not a Codex host recording.",
      "The demo harness replaces visible labels for English-only public media; it does not claim product localization.",
      "Version 0.5.8 remains a source candidate and has not inherited the 0.5.7 real-host result.",
      "No external authoritative capability benchmark currently fits this Codex context-canvas workflow.",
    ],
  };
  assertEnglishOnly(report, "render report");
  await writeFile(tempReport, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function main() {
  assertEnglishOnly(collectPublicText(), "public storyboard copy");
  await Promise.all([
    ensurePath(join(uiDir, "editor.html"), "Product editor"),
    process.platform === "win32" ? ensurePath(chromePath, "Google Chrome") : Promise.resolve(),
  ]);
  await resetTempDirectory();
  const environment = await probeRenderEnvironment();

  const { uiPaths, languageChecks } = await renderUiStates();
  const scenePaths = await renderSceneFrames(uiPaths);
  const { wavPaths, voice } = await synthesizeNarration();
  const encoded = await encodeSegments(scenePaths, wavPaths);
  await concatAndCaption(encoded.segmentPaths);
  const qaFrames = await extractQaFrames(encoded.durations);
  await writeMediaReadme();
  const report = await makeReport({ ...encoded, voice, qaFrames, languageChecks, environment });
  const publication = await publishDirectoryAtomically({
    sourceDir: tempDir,
    destinationDir: publicDir,
    filenames: publicFilenames,
  });
  if (publication.cleanupWarning) process.stderr.write(`${publication.cleanupWarning}\n`);

  process.stdout.write(`${JSON.stringify({
    video: join(publicDir, PUBLIC_ASSET_NAMES.video),
    cover: join(publicDir, PUBLIC_ASSET_NAMES.cover),
    durationSeconds: report.output.durationSeconds,
    bytes: report.output.bytes,
    sha256: report.output.sha256,
    publication,
    qaFrames,
  }, null, 2)}\n`);
}

await main();
