import { updateAuthoritativeContext } from "../../mcp/context-storage.mjs";

const [projectDir, content, expectedCurrentRevisionId] = process.argv.slice(2);

process.send?.({ type: "ready" });
process.once("message", async (message) => {
  if (message?.type !== "start") return;
  try {
    const result = await updateAuthoritativeContext({ projectDir, content, expectedCurrentRevisionId });
    process.send?.({ type: "result", ok: true, revisionId: result.revision.id });
  } catch (error) {
    process.send?.({ type: "result", ok: false, message: String(error?.message || error) });
  } finally {
    process.disconnect?.();
  }
});
