(() => {
  window.__calls = [];
  window.__messages = [];
  window.codexTextControlMcp = {
    async callServerTool(request) {
      window.__calls.push(request);
      return {
        structuredContent: {
          revision: {
            id: "rev-preview",
            number: 2,
            content: request.arguments.content,
            source: "widget-canvas",
          },
          committedAt: "2026-08-31T00:00:00.000Z",
          followUpMessage: "",
        },
      };
    },
    async sendFollowUpMessage(message) { window.__messages.push(message); },
  };
  window.dispatchEvent(new CustomEvent("openai:set_globals", {
    detail: {
      globals: {
        codexTextControlBridgeStatus: { state: "ready", message: "已连接 Codex" },
        toolOutput: {
          mode: "full",
          renderId: "preview-1",
          projectDir: "/workspace/preview",
          title: "项目上下文",
          sourceText: [
            "# 发布门槛",
            "",
            "直接修改下面的要求。",
            "",
            "| 项目 | 状态 | 负责人 |",
            "| :--- | :---: | ---: |",
            "| 真实闭环 | 待验收 | 用户 |",
            "| 失败样例 | 必须保留 | Codex |",
            "",
            "1. 保持旧能力不退步",
            "2. 汇报不能超过证据",
            "",
            ...Array.from({ length: 60 }, (_, index) => `长文检查 ${String(index + 1).padStart(2, "0")}：正文区域内部滚动，控制栏保持可见。`),
          ].join("\n"),
          revisions: [{ id: "rev-base", number: 1, content: "旧版本", source: "preview" }],
          current: { id: "rev-base", revisionId: "rev-base", content: "旧版本" },
          limits: { content: 1_000_000 },
        },
      },
    },
  }));
  return "ready";
})();
