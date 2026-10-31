# 第三方依赖声明

本项目直接依赖以下开源软件。实际安装版本以 `package-lock.json` 为准。

| 英文包名 | 中文用途 | 当前锁定版本 | 许可证 | 来源 |
|---|---|---:|---|---|
| `@modelcontextprotocol/ext-apps` | MCP 应用和 Widget 桥接 | 1.7.5 | MIT | https://github.com/modelcontextprotocol/ext-apps |
| `@modelcontextprotocol/sdk` | MCP 客户端和服务端协议实现 | 1.32.2 | MIT | https://github.com/modelcontextprotocol/typescript-sdk |
| `markdown-it` | 将 Markdown 渲染为正文编辑视图 | 15.0.3 | MIT | https://github.com/markdown-it/markdown-it |
| `turndown` | 将编辑后的正文转回 Markdown | 7.2.4 | MIT | https://github.com/mixmark-io/turndown |
| `turndown-plugin-gfm` | 表格等 GitHub 风格 Markdown 转换 | 1.0.2 | MIT | https://github.com/mixmark-io/turndown-plugin-gfm |
| `zod` | 输入结构和长度校验 | 4.6.7 | MIT | https://github.com/colinhacks/zod |
| `jsdom`（仅开发依赖） | 在 Node.js 中运行真实 DOM 交互回归测试 | 26.1.0 | MIT | https://github.com/jsdom/jsdom |

2026-11-01 对 `package-lock.json` 中完整依赖树的许可证字段统计为：MIT 123 个、MIT-0 1 个、ISC 9 个、BSD-3-Clause 3 个、BSD-2-Clause 5 个、PSF-2.0 1 个、Apache-2.0 1 个，共 143 个包记录。这个统计包含根项目及开发依赖记录，具体包和版本应从锁文件及安装包自带许可证核对。

## 为什么采用这些依赖

MCP SDK 和 Ext Apps 提供协议和应用桥接实现，Zod 校验工具输入。Markdown-it、Turndown 及其 GFM 插件支持排版正文与 Markdown 的转换；jsdom 只用于开发测试。项目没有引入前端框架、数据库或 diff 库。

## 限制与客观评价

许可证字段统计不是法律审计，也不能证明每个发布包都完整携带声明。每次公开 Release 应生成并归档 SBOM（软件物料清单），同时运行签名、来源证明和漏洞审计。0.6.0 的检查结果见[验证记录](docs/evidence/inline-reply-0.6.0.md)。
