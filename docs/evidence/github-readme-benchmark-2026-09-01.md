# GitHub README（仓库首页说明）对照记录（2026-09-01）

## 用途、输入和输出

本文件记录 Codex Text Control 首页重排前对公开 GitHub 项目 README 的只读调查。输入是 2026-09-01 获取的公开 README 原文和本项目已有功能、截图与验证证据；输出是可复核的页面结构观察、采用项和拒绝项。

依赖公开网络和 GitHub 原始文件服务。限制是 GitHub 公共 API（应用程序编程接口）当时返回限流错误，Jina Reader（网页转 Markdown 服务）又因出口 IP（网络地址）信誉返回 `401`，因此本次没有引用实时星数、下载量或仓库元数据。最终改用 `raw.githubusercontent.com` 读取 README 原文。该调查只用于学习介绍结构，不能证明这些项目的功能更强，也不能替代本项目的真实验收。

## 公开来源

| 项目 | 读取来源 | 首屏和导航观察 |
| --- | --- | --- |
| Model Context Protocol servers | [README](https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md) | 标题后快速进入参考服务器、开始使用、创建服务器、学习、贡献、安全和许可证 |
| MCP Inspector | [README](https://raw.githubusercontent.com/modelcontextprotocol/inspector/main/README.md) | 先给可运行命令，再分项目结构、开发、构建、质量门槛、发布和贡献 |
| Playwright MCP | [README](https://raw.githubusercontent.com/microsoft/playwright-mcp/main/README.md) | 先讲定位对比、核心功能和要求，再给各宿主安装、配置、安全边界和工具参考 |
| Context7 | [README](https://raw.githubusercontent.com/upstash/context7/master/README.md) | 首屏使用真实封面和状态徽章，用“使用前/使用后”解释价值，再进入安装、技巧和工具 |
| Browser Use | [README](https://raw.githubusercontent.com/browser-use/browser-use/main/README.md) | 品牌和真实演示优先，随后给 Quickstart（快速开始）、开源与云边界、文档和 FAQ（常见问题） |
| OpenAI Agents SDK | [README](https://raw.githubusercontent.com/openai/openai-agents-python/main/README.md) | 标题带真实包版本入口，先解释核心概念，再给最短安装和多个可运行示例 |

## 共同规格

这些 README 的具体风格不同，但信息顺序有稳定共性：

1. 首屏先回答“这是什么、解决什么”，不是先堆实现细节。
2. 有真实视觉资产时在首屏展示，让用户先看到实际产品或结果。
3. 安装或最短使用路径靠前，完整配置和工具参考向后分层。
4. 功能描述同时写适用边界；成熟项目把安全、贡献、许可证和发布入口独立出来。
5. 徽章只链接真实存在的包、构建、许可证或文档，不用装饰性数字代替证据。
6. README 负责导航，架构、验证和维护细节进入专门文档。

## 本项目采用项

| 采用项 | 在本项目中的实现 | 原因 |
| --- | --- | --- |
| 一句话价值 | 首屏说明“直接修改权威上下文，检查原文后再提交” | 新用户不用先理解 MCP、修订指针或宿主桥接 |
| 克制的状态徽章 | 只标本地候选、版本、Node.js 和 MIT 许可证 | 都能由仓库文件或当前证据核对 |
| 真实界面截图 | 使用仓库内已有画布截图，并注明界面基线和后续确认步骤 | 展示真实文字和表格编辑，不用概念图代替产品 |
| 快速开始前置 | 先给 Codex 触发语和五步点击闭环，再给源码验证 | 用户先知道怎么完成任务，维护者再看命令 |
| 能力与边界同表 | 每项能力旁边写明确限制 | 防止把局部能力包装成通用编辑器 |
| 证据分层 | 自动化、重复稳定性、真实宿主、供应链和公开发布分开 | 避免用测试数量替代真实使用或发布状态 |
| 文档导航 | README 链接架构、证据、变更、安全和贡献说明 | 让代码、设计、测试证据和发布信息各归其位 |

## 明确拒绝项

- 不添加不存在的线上持续集成、发行版、下载量、星数或一键安装徽章。
- 不复制其他项目的品牌、宣传语、云服务入口或与本项目无关的多宿主安装矩阵。
- 不把 GitHub 关注度当成权威评测，也不声称本项目已经达到同类项目的维护成熟度。
- 不把所有设计和验证原文塞进 README；首页只保留做判断所需的摘要和入口。
- 不创建空的模型、数据或论文目录。本项目没有训练模型，这些资产明确记为“无”。

## 客观评价

这次调整能把首页的信息规格提升到成熟公开项目常见的层级：价值、实物、开始路径、能力边界、证据和维护入口都能在合理位置找到。它不能补齐公开仓库、持续集成、发行版、跨平台复现和外部权威基准；这些仍必须用真实工程与公开证据完成，不能靠 README 排版代替。
