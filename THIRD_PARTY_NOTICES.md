# 第三方依赖声明

本项目直接依赖以下开源软件。实际安装版本以 `package-lock.json` 为准。

| 英文包名 | 中文用途 | 当前锁定版本 | 许可证 | 来源 |
|---|---|---:|---|---|
| `@modelcontextprotocol/ext-apps` | MCP 应用和 Widget 桥接 | 1.7.5 | MIT | https://github.com/modelcontextprotocol/ext-apps |
| `@modelcontextprotocol/sdk` | MCP 客户端和服务端协议实现 | 1.30.0 | MIT | https://github.com/modelcontextprotocol/typescript-sdk |
| `zod` | 输入结构和长度校验 | 4.5.2 | MIT | https://github.com/colinhacks/zod |

2026-08-31 对本机完整安装树的许可证字段统计为：MIT 86 个、ISC 8 个、BSD-3-Clause 2 个、BSD-2-Clause 1 个，共 97 个包记录。这个统计包含根项目记录，具体包和版本应从锁文件及安装包自带许可证核对。

## 为什么采用这些依赖

MCP SDK 和 Ext Apps 是当前协议的正式实现，复用它们比手写握手和消息格式更可靠。Zod 让工具输入上限在协议边界可验证。项目没有引入前端框架、数据库或 diff 库，因为当前核心闭环不需要它们。

## 限制与客观评价

许可证字段统计不是法律审计，也不能证明每个发布包都完整携带声明。首次公开 Release 前应生成并归档 SBOM（软件物料清单），同时再次运行签名、来源证明和漏洞审计。
