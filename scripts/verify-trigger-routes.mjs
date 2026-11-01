import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const repo = fileURLToPath(new URL('..', import.meta.url));
const plansPath = process.argv[2];
if (!plansPath) throw new Error('Usage: node scripts/verify-trigger-routes.mjs <model-decisions.json> [report.json]');
const cases = JSON.parse(await readFile(join(repo, 'tests/fixtures/trigger-cases.json'), 'utf8'));
const expected = JSON.parse(await readFile(join(repo, 'tests/fixtures/trigger-expected.json'), 'utf8'));
const plans = JSON.parse(await readFile(resolve(plansPath), 'utf8'));
if (!Array.isArray(plans) || plans.length !== cases.length || new Set(plans.map(value => value.id)).size !== cases.length) throw new Error('Expected exactly one decision for each scenario.');
const client = new Client({ name: 'trigger-routing-verification', version: '1.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(repo, 'scripts/start-mcp.mjs')], cwd: repo }));
const results = [];
try {
  for (const input of cases) {
    const plan = plans.find(value => value.id === input.id);
    const want = expected.find(value => value.id === input.id);
    const projectDir = await mkdtemp(join(tmpdir(), 'ctc-routing-'));
    const call = (name, args = {}) => client.callTool({ name, arguments: { ...args, projectDir } });
    let revisionId = null;
    if (input.savedContext) {
      const seed = await call('update_authoritative_context', { content: input.savedContext, expectedCurrentRevisionId: null });
      if (seed.isError) throw new Error(seed.content[0].text);
      revisionId = seed.structuredContent.revision.id;
    }
    if (input.savedDraft) await call('save_context_draft', { content: input.savedDraft, baseRevisionId: revisionId, draftSessionId: 'fixture', draftVersion: 1 });
    const failures = [];
    if (!plan) { results.push({ id: input.id, pass: false, failures: ['Missing decision'] }); continue; }
    if (plan.route !== want.route) failures.push(`route: expected ${want.route}, got ${plan.route}`);
    const outputs = [];
    for (const step of plan.toolCalls || []) {
      const name = step.name.split('__').at(-1);
      if (!['get_authoritative_context', 'render_text_control_widget', 'list_text_revisions'].includes(name)) { failures.push(`Unrequested tool: ${step.name}`); continue; }
      const result = await call(name, step.arguments || {});
      if (result.isError) failures.push(`${name}: ${result.content?.[0]?.text}`);
      outputs.push({ name, value: result.structuredContent });
    }
    const renders = outputs.filter(output => output.name === 'render_text_control_widget');
    const needsRender = ['reply', 'candidate', 'saved', 'extension'].includes(want.route);
    if (renders.length !== (needsRender ? 1 : 0)) failures.push(`render count: ${renders.length}`);
    if (want.route === 'none' && outputs.length) failures.push('Ordinary answer invoked plugin');
    if (want.route === 'read' && !outputs.some(output => output.name === 'get_authoritative_context')) failures.push('Notice did not read current authority');
    const shown = renders[0]?.value;
    if (want.text !== null && shown?.sourceText !== want.text) failures.push('Displayed text differs from the requested reply');
    if (want.route === 'saved' && shown?.sourceText !== (input.savedDraft || input.savedContext)) failures.push('Saved context/draft was not reopened');
    if (want.route === 'extension' && (shown?.mode !== 'extension' || shown?.sourceText !== input.extensionCandidate)) failures.push('Extension target was not isolated');
    const current = await call('get_authoritative_context', { fullContent: true });
    if ((current.structuredContent?.current?.content || null) !== (input.savedContext || null)) failures.push('Rendering changed confirmed context');
    results.push({ id: input.id, pass: failures.length === 0, route: plan.route, failures, displayedText: shown?.sourceText || null });
  }
} finally { await client.close(); }
const report = { passed: results.filter(result => result.pass).length, total: results.length, results };
if (process.argv[3]) await writeFile(resolve(process.argv[3]), JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify({ passed: report.passed, total: report.total, failures: results.filter(result => !result.pass) }, null, 2));
process.exitCode = report.passed === report.total ? 0 : 1;
