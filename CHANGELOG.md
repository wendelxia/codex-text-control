# 变更记录

本文件记录用户能感知的变化、修复、已知限制和回退方法。版本号遵循 Semantic Versioning（语义化版本）：`主版本.次版本.修订版本`。

## [0.5.11] - 2026-09-03

### Fixed

- Keep title, body, and render identity atomic when a reused Codex host delivers a partial widget payload. A title-only payload no longer advances the canvas to a mixed state, and the matching body can still arrive under the same render ID.
- Reject custom-title renders that do not include the matching candidate body, so a new answer title cannot be displayed above older authoritative text or a recovered draft.

### Verification

- Focused widget and MCP contract tests pass: `50/50`.
- The regression tests cover a partial new render followed by its complete body payload, and a custom-title render that omits the matching candidate body.

### Known limitation

- This patch fixes the verified client-side mixed-payload path. It does not provide a cross-platform real-host matrix or an external authoritative usability benchmark.

## [0.5.10] - 2026-09-02

### Changed

- Persist the in-progress canvas as a project-local draft after an editing pause, on page hide, and when switching conversations. Drafts remain separate from immutable revision history and can be restored in a later conversation.
- Make `get_authoritative_context` return the most recent 12,000 characters by default, while keeping the complete authoritative Markdown inside the project store and the canvas.
- Treat a draft based on an older authoritative revision as an explicit conflict. The canvas keeps the current authoritative text visible, and the user must choose to load and review the older draft before submitting it against the current base.

### Fixed

- Serialize overlapping draft writes so an older response cannot overwrite a newer edit.
- Keep Chinese IME composition text out of draft persistence, including when the page is hidden during composition.
- Ensure restoring the current authoritative version removes the persisted draft, while a new edit made during cleanup remains intact.
- Keep the existing confirmation boundary: only the user's final confirmation creates an immutable revision and advances the authoritative pointer.

### Verification

- `npm test`: `112/112` automated tests passed, including storage, MCP contracts, continuous-canvas interaction, draft recovery, conflict handling, IME composition, page-hide persistence, reset cleanup, and concurrent draft-write regressions.
- `npm run check` and `npm run probe:mcp`: passed.
- `npm run audit:prod` and `npm run audit:signatures`: required supply-chain checks pass after updating the vulnerable transitive `qs` dependency to `6.16.0`; `96` package signatures and `11` attestations remain verified.

### Known limitation

- The user has completed the `0.5.10` reinstall-and-click verification in the real Codex desktop host. This repository records that as a user-reported result without pretending to contain host screenshots or logs; the build remains a public pre-release because there is no cross-platform host matrix or external authoritative benchmark.

### Rollback

Reinstall the public `v0.5.9` pre-release to return to the previous canvas behavior. Keep the project `.codex-text-control/` directory; it contains user revisions and drafts and must not be deleted during rollback.

## [0.5.9] - 2026-09-02

### Changed

- Edit the entire authoritative Markdown document in one continuous text area, including paragraphs and tables. `Ctrl+A`, copy, paste, and whole-document replacement now work as expected.
- Remove line prefixes, block boundaries, table-cell inputs, and line-number-style presentation from the canvas. The source view remains available for checking complex Markdown.
- Keep the canvas, source view, and final review on the same unchanged string so switching views cannot reformat content that the user did not edit.

### Fixed

- Keep a visible left-edge focus indicator on the continuous editor without restoring the horizontal input-box appearance.
- Treat AI-provided full-document and extension-point candidates as pending changes when they differ from the current authoritative text, so users can review and confirm them without first changing an extra character.
- Preserve continuous-canvas drafts through save timeouts and allow a safe retry; extension-point retries also recover when revision creation succeeds but the authoritative commit initially fails.

### Verification

- `node --test tests/widget-interaction.test.mjs`: `25/25` passed, covering continuous text, Markdown tables, draft preservation, bidirectional view synchronization, final review, failure recovery, AI candidates, and extension-point regressions.
- `npm run quality`: `95/95` automated tests passed together with JavaScript syntax checks and the MCP probe.

### Known limitation

- The `0.5.9` build has not completed a reinstall-and-click verification inside the real Codex desktop host. It is classified as a pre-release and does not claim production readiness or cross-platform host compatibility.

### Rollback

Reinstall `0.5.8+codex.20260901204256` to restore the previous block-and-table canvas. Project data under `.codex-text-control/` uses the same revision format and must not be deleted during rollback.

## [0.5.8] - 2026-09-01

### Changes

- Add an English GitHub homepage entry and a product video with English visuals and narration plus human-reviewed Simplified Chinese subtitles. The story starts with repeated requirements, full rewrites caused by small edits, and unclear current versions, then introduces the tool, demonstrates the workflow, and reports the result. The media package includes a bilingual transcript, environment versions, public artifact hashes, and a reproducible renderer.

### 修复

- 增加项目级不可变状态转换；两个 MCP 进程从同一基准同时更新时最多一个后继转换成功，另一个明确收到版本变化错误。
- 权威读取从不可变锚点沿状态转换链计算；即使旧进程延迟写回兼容指针，也不会让权威内容倒退。历史恢复会生成新的修订编号，恢复后可以继续编辑。
- 相同正文的并发更新、旧基准重试和历史恢复重试按最终正文幂等成功，不再把并发赢家误判为新的历史恢复，也不会为未变化正文重复制造修订。
- 状态证明和兼容检查点同时绑定修订编号、提交时间和父状态；检查点元数据不一致时从权威链恢复，证明文件不一致时明确拒绝读取。
- 存储层本身也拒绝缺少项目目录，不再只依赖 MCP 输入结构阻止 `process.cwd()` 回退。
- 画布保留未编辑行的原始 `CRLF`/`LF` 行尾和 Markdown 表格排版；修改一个单元格时，只重排实际发生变化的那一行。
- 测试夹具改用平台无关的虚拟路径，不再硬编码 `C:\` 或 `D:\`。

### 当前验证状态

- 并发回归测试在修复前复现两个进程都报告成功；`proper-lockfile@4.1.2` 的过期恢复方案又在 10 次窗口第 4 次出现并发替换 `current.json` 的 `EPERM`，因此改用不可变状态转换。
- 第一版状态转换候选在单套件下通过，但 6 个并行完整套件为 `0/6`，暴露相同正文被误判为历史恢复；该结果已作废并保留为失败证据。最终候选同一压力为 `6/6`、`444/444` 项通过，顺序完整套件连续 10 次为 `740/740` 项通过。
- 行尾和非标准表格保真测试在修复前稳定失败，修改后逐字通过。
- `0.5.8` 的完整自动化、重复稳定性、供应链和干净克隆结果记录在 0.5.8 验证记录中；真实 Codex 宿主复验尚未执行，因此仍是源码候选版。

### 回退

重新安装 `0.5.7+codex.20260901154437` 可回到最后一个完成真实宿主闭环的构建。旧修订文件仍保留，但 0.5.7 不理解 `0.5.8` 的状态转换链；回退后不要继续提交，应先备份 `.codex-text-control/` 并重新升级。

## [0.5.7] - 2026-09-01

### 变更

- “完成编辑”现在先显示即将提交的完整原文；“返回修改”保留草稿且不写盘，只有“确认提交”才保存一个不可变修订、更新权威指针并回传版本号。
- 主画布保持 720 像素稳定高度，避免宿主初始分配过矮时正文和提交前检查难以阅读。

### 修复

- 所有 MCP 工具现在必须显式接收当前工作区根目录 `projectDir`；缺少时直接拒绝，不再退回插件安装缓存。
- 技能规则要求读取、打开画布和扩展点操作都传入同一个当前工作区根目录。

### 当前验证状态

- 0.5.6 重启后的建议正例成功打开 Widget，但第一次未传项目目录，真实返回把插件缓存识别成项目；该版本因此未晋升。
- 新增两个契约先在 0.5.6 上稳定失败，分别复现 MCP 的危险默认值和技能遗漏；修改后聚焦测试通过。
- 当前完整自动测试 `57/57` 通过；同一候选连续 10 次共 `570/570` 项通过，失败运行 `0`。
- 完全重启后的真实 Codex 已完成“修改 -> 完整原文检查 -> 返回修改 -> 再检查 -> 确认提交 -> 对话回传 -> 重新读取”闭环，最终版本为 `rev-1788249723947-c7d6a499`。
- 完整候选门槛、安装一致性、适用边界和真实宿主结果见 0.5.7 验证记录。

### 回退

重新安装 `0.5.6+codex.20260901104738` 会恢复可选项目目录，但存在误写插件缓存风险；仅用于诊断，不建议继续编辑或保存。

## [0.5.6] - 2026-09-01

### 变更

- 自动触发不再要求建议“很长”或“已经成体系”。只要完整最终回复的主要内容是用户可继续采用或修改的建议，就进入上下文画布。
- 随手附带的一句提醒、简短对话、进度和代码或文件交付仍不触发，避免画布过度介入。

### 当前验证状态

- 新触发契约先在 0.5.5 技能描述上稳定失败；修改后聚焦测试 1/1、路由测试 7/7 和官方技能结构校验通过。
- 完整候选门槛和真实 Codex 路由复验见 0.5.6 验证记录；在真实复验前仍是候选版。

### 回退

重新安装 `0.5.5+codex.20260901100013`。MCP 工具、修订文件和权威指针格式没有变化。

## [0.5.5] - 2026-09-01

### 修复

- 去掉普通正文块在悬停和聚焦时的横向矩形边框、下划线和整行阴影，让点击后的外观保持为直接改文字。
- 当前正文块只在左侧显示一条 2 像素短竖线；源码编辑器和表格单元格继续保留完整焦点边界。

### 当前验证状态

- 新增回归测试先在 0.5.4 样式上失败；最小修改后聚焦测试和正文交互测试通过。
- Chromium 在 1280 × 720 和 320 × 720 下确认正文四边框均为 0、轮廓样式为 `none`、整行阴影为 `none`，且没有横向溢出和控制台错误。
- 0.5.5 尚未完成重启后的真实 Codex 复验，因此仍是候选版，不能称为可发布。

### 回退

重新安装 `0.5.4+codex.20260901093654`。修订文件、权威指针和 MCP 工具协议没有变化；回退不会删除用户项目中的 `.codex-text-control/` 数据。

## [0.5.4] - 2026-09-01

### 修复

- 取消停顿后的实时保存。编辑过程只保留当前画布草稿，点击“完成编辑”后才保存一个不可变修订、更新权威指针并回传一次版本通知。
- 保存进行中锁定编辑控件，超时或失败后恢复操作并保留本地内容。
- 删除重复的“立即保存”入口，避免一轮普通编辑产生多个手动或输入法中间版本。
- 把长正文限制在 Widget 内部滚动，控制区不再依赖对 Codex 外层页面无效的 CSS 吸顶行为。

### 当前验证状态

- 0.5.3 真实宿主两轮编辑生成 28 个修订，并记录了 `yi`、`yi'j` 等输入法中间态；长文底部还记录控制内容“看不见”。
- 新契约先在旧实现上稳定失败；修改后聚焦交互测试 15/15、完整自动测试 47/47 通过。
- 0.5.4 尚未完成重启后的真实 Codex 复验，因此仍是候选版，不能称为可发布。

### 回退

重新安装 `0.5.3+codex.20260901012844`。修订文件和权威指针格式没有变化；回退不会删除用户项目中的 `.codex-text-control/` 数据。

## [0.5.3] - 2026-09-01

### 变更

- 自动触发从“出现 Markdown 表格或连续编号”改为“完整最终回复是否形成后续会采用或修改的结论稿”。
- 整理讨论结论，以及形成建议、方案、计划、规则、决策、需求或验收标准时自动打开画布；没有表格和编号也应触发。
- 生成、修改或交付代码、文件或文档时不触发；简短对话、普通解释、确认、进度、命令输出、日志和报错也不触发，表格与编号本身不再构成触发条件。

### 当前验证状态

- 修改前新增契约测试稳定出现 2 项失败，分别证明旧规则遗漏语义正例并保留格式误触发；修改后聚焦测试 7/7 通过。
- 技能创建器的 `quick_validate.py` 校验通过；真实 Codex 自然语言路由仍需完全重启后用正反例验证。

### 回退

重新安装 `0.5.2+codex.20260901010523`。画布、存储和权威指针格式没有变化。

## [0.5.2] - 2026-09-01

### 变更

- 按真实使用反馈移除“段落”“表格”“删除当前块”和表格增删行列工具，画布只保留直接正文编辑与版本闭环操作。
- 表格单元格仍可直接输入；需要改变 Markdown 结构时统一在源码视图编辑，避免把上下文画布做成复杂的块编辑器。

### 当前验证状态

- 修复前两项聚焦界面契约稳定失败，证明旧界面仍暴露结构增项；最小实现后聚焦测试通过。
- 源码与安装副本的完整质量链均为 46/46 通过；生产依赖为 0 个已知漏洞，96 个包签名和 11 个来源证明通过。
- Chromium 在 1280x720 和 320x720 下确认结构增项控件为 0、直接编辑可自动保存、滚动到底部仍可操作，且无按钮裁切、重叠、横向溢出和控制台错误。
- 真实 Codex 宿主闭环仍待完全重启后验证，因此当前只能标记为候选版。

### 回退

重新安装 `0.5.1+codex.20260831154223`。上下文修订和权威指针格式没有变化。

## [0.5.1] - 2026-08-31

### 修复

- 自动保存改为画布内静默完成；新增常驻的“完成编辑”按钮，只在用户完成整轮编辑时向对话回传一次最新版本，避免每次停顿都切回聊天。
- “画布/源码”和编辑工具控制条改为吸顶；320 像素宽度下工具按三列两行排列，长文不再需要滚回顶部操作。

### 当前验证状态

- 用户在真实 Codex 0.5.0 中复现“每次保存弹回对话”和“长文必须滚回顶部切换视图”。
- 修复前 3 项聚焦测试稳定失败，修复后完整质量链 47/47 通过。
- 真实 Chromium 滚动到页面底部后控制条顶部仍为 0；自动保存消息数为 0，点击“完成编辑”后为 1；320 像素视口裁切和按钮重叠均为 0。
- 0.5.1 仍需重启后的真实 Codex 复验，不能把普通浏览器结果冒充宿主结论。

### 回退

重新安装 `0.5.0+codex.20260831135938`。上下文修订和权威指针格式没有变化。

## [0.5.0] - 2026-08-31

### 新增

- 全文模式改为上下文画布，普通文字按块直接编辑，Markdown 表格显示为真实表格。
- 表格支持直接修改单元格，并可在选中位置增删行列；磁盘格式仍为 Markdown。
- 增加画布与源码双视图，复杂 Markdown 可以直接核对和修改原文。
- 增加 `update_authoritative_context`（更新权威上下文）应用工具，一次完成保存修订和更新权威指针。
- 自动保存使用防抖合并连续输入；保存中的新输入通过编辑版本号保护，不会被旧请求结果误标为已保存。
- 对话通知只包含版本号，模型收到后读取磁盘权威正文，不再把完整上下文复制进聊天。

### 变更

- 主界面删除“保存修订版本”和“提交权威上下文”两步按钮；旧工具继续保留兼容。
- 扩展点模式改为用户修改后自动保存并更新，块外后端重建不变量不变。
- `0.4.0` 的表格和编号自动触发现在打开画布，而不是 Markdown 大文本框。

### 当前验证状态

- 按测试驱动开发先出现缺画布模型、缺原子更新工具、缺真实表格界面和自动保存竞态等预期失败。
- 完整质量链通过：46/46 自动测试、JavaScript 语法检查和包含画布、表格、扩展点的 MCP 探测成功。
- 真实 Chromium 完成单元格修改、源码回写、增删行、键盘焦点和 320/768/1280 像素布局检查；控制台 0 错误。
- 生产依赖审计为 0 个已知漏洞，96 个包签名和 11 个来源证明通过；技能与插件格式校验通过。
- 最终候选安装副本的 42 个源码与文档文件缺失 0、哈希不一致 0，关键测试 33/33 通过。
- 完全重启后的真实 Codex 画布点击闭环仍待完成，因此保持候选版。

### 回退

重新安装 `0.4.0+codex.20260831123214` 可以回退画布界面。0.5.0 继续使用完整 Markdown 修订和相同权威指针格式，不需要迁移或删除 `.codex-text-control/` 数据。

## [0.4.0] - 2026-08-31

### 新增

- Codex 准备输出 Markdown 表格或至少两项连续编号分项时，自动把完整最终答复放入全文编辑器。
- 同时支持 `1.`、`2.`、`3.`、`4.` 这类阿拉伯数字序号和“一、二、三、四”这类中文数字序号。

### 边界

- 不把日期、版本号、行内数字、代码块、终端输出、日志或简短进度消息误判为结构化答复。
- 自动打开不会自动保存或提交；关闭编辑器不会生成修订，确认权仍由用户掌握。

### 验证状态

- 按测试驱动开发先增加触发契约测试；旧规则稳定出现 2 项失败，加入新规则后聚焦测试 5/5 通过。
- 完整质量链通过：39/39 自动测试、JavaScript 语法检查和 MCP 闭环探测均成功；生产依赖审计为 0 个已知漏洞，96 个签名和 11 个来源证明通过。
- 安装副本触发测试 5/5 通过，47 个候选文件与安装副本 SHA-256 全部一致。
- 自然语言技能路由由 Codex 宿主执行，完全重启后的真实自动触发仍待完成，因此保持候选版。

### 回退

重新安装 `0.3.0+codex.20260831193635` 可以回退自动触发行为。存储格式、扩展点格式和权威指针没有变化，不需要迁移或删除用户项目中的 `.codex-text-control/` 数据。

## [0.3.0] - 2026-08-31

### 新增

- 增加命名 AI 扩展点。用户在全文中插入 `【AI扩展点：名称】` 与 `【/AI扩展点】`，后续可以要求 AI 只补充该块。
- 增加仅 Widget 可调用的 `save_context_extension_revision`（保存扩展点修订）工具。它根据基准权威版本在后端重建完整正文，客户端不能借扩展模式提交一份任意改写的全文。
- 增加唯一名称、禁止嵌套、完整标记、过期权威版本和块内伪造标记检查。任何一项失败都会拒绝保存。

### 变更

- 从界面移除“本次修改说明”，全文和扩展点保存都不再发送说明。旧修订中的 `note`（说明）字段继续兼容读取，不迁移或删除历史数据。
- 扩展点模式只显示块内文字，并隐藏全文历史载入，避免用户为了改一小段再次接触和误改整篇正文。

### 验证状态

- 新能力按测试驱动开发实现；旧代码上出现缺模块、缺工具、缺界面模式和仍依赖说明字段等预期失败。
- 完整质量链通过：37/37 自动测试、JavaScript 语法检查和包含扩展点的 MCP 闭环探测均成功。
- 仍需完成最终安装副本核对和完全重启后的真实 Codex 扩展点闭环；在此之前保持候选版。

### 回退

重新安装 `0.2.2+codex.20260831185214` 可以回退扩展点功能。`0.3.0` 仍保存完整修订快照，旧版可以读取正文和权威指针；包含扩展点标记的正文会在旧版中作为普通纯文本显示。

## [0.2.2] - 2026-08-31

### 修复

- 当前文存在正在讨论的回复、文字、规则或上下文时，把“我来改下”“我自己改一下”“让我改”“我改改”识别为用户要亲自打开编辑器修改，而不是普通聊天。
- 在技能 YAML `description`（描述字段）和正文中同时写清触发条件。原因是 Codex 在决定是否加载技能时首先只能看到描述字段，只改加载后的正文无法可靠修复漏触发。
- 明确排除“我来改代码”“我改天再说”“我已经改完文件了”，避免只看到“改”字就错误弹出上下文编辑器。

### 验证状态

- 新回归测试在旧规则上稳定失败，加入触发条件后通过。
- 完整质量链通过：23/23 自动测试、JavaScript 语法检查和 MCP 闭环探测均成功；`0.2.1` 的存储、桥接、保存和提交能力没有出现已覆盖范围内的退步。
- 自然语言路由最终由 Codex 宿主执行；必须完全重启并真实输入“我来改下”后，才能把 `0.2.2` 从候选版晋升。

### 回退

重新安装 `0.2.1+codex.20260831101208` 可以回退触发规则。用户项目中的 `.codex-text-control/` 修订数据格式没有变化，不需要迁移或删除。

## [0.2.1] - 2026-08-31

### 修复

- 修复真实 Codex Widget 报“Codex 应用桥接未加载”的问题。原因是 HTML 注入使用字符串替换值，第三方 SDK 里的 `$&` 被 JavaScript 当成替换控制符，错误插入 `</head>` 并破坏脚本语法。
- 改用替换回调原样插入 SDK，并增加读取真实 MCP 资源、解析完整 SDK 脚本的回归测试。
- 修复插件升级后旧 MCP 进程读取已被清理的缓存文件并报 `ENOENT`（文件不存在）；Widget 资源改为进程启动时进入内存。
- 修复 Codex 复用同一个 Widget 时残留旧正文；每次打开增加唯一 `renderId`（渲染编号），新请求刷新正文，重复宿主事件不覆盖用户未保存的编辑。

### 验证状态

- 回归测试在旧实现上稳定失败，修复后通过。
- Chromium 中 `window.__CTC_APPS__.App` 已恢复为函数，页面无脚本语法错误。
- 完全重启后的真实用户验收已通过：正确权威版本可以恢复，无正文重开能读回当前版本，同一修订重复提交不会新增版本。

## [0.2.0] - 2026-08-31

### 新增

- 增加 Codex 原生 Widget（小组件）编辑器、不可变修订版本和权威版本指针。
- 增加 `app-only`（仅应用可调用）写权限，模型只能打开编辑器和读取状态，不能代替用户保存或提交。
- 增加桥接握手、双层超时、纯文本渲染、正文长度上限和重复保存去重。
- 增加 19 项自动测试、MCP（模型上下文协议）闭环探测和 npm 官方供应链审计命令。

### 修复

- 修复 Widget 桥接未连接时按钮永久等待的问题。
- 修复权威版本已经写入、但对话消息回传失败时状态混淆的问题。
- 修复插件清单把“载入历史版本”误写成“查看版本差异”的过度宣传。

### 已知限制

- 尚无真正的逐行 diff（差异对比）视图。
- 尚未完成两次由真实用户在当前 Codex 宿主里重复点击“保存”和“提交”的验收。
- 尚未建立公开仓库、公开 Release（发行版）和真实维护者联系渠道。

### 回退

重新安装上一份插件缓存副本即可回退插件代码。项目里的 `.codex-text-control/` 是用户数据，不应随插件一起删除；如需回退上下文，应在历史版本中载入旧修订后重新提交。

## 客观评价

`0.2.0` 的核心优势是确认权与写权限边界清楚，失败状态也比旧版诚实；但它仍是本地候选版，不应把自动测试通过写成“已经可发布”。
