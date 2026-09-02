# Codex Text Control Bilingual Transcript

- Narration language: English (United States)
- Subtitle language: Simplified Chinese (China)
- Source status: 0.5.8 source candidate
- Screen label: UI demonstration · current source

## 0:00:00.00 · You keep explaining the same requirement

**English narration**

A normal project chat starts simply. Then the same requirement gets corrected, clarified, and repeated across ten different messages.

**Simplified Chinese subtitles**

项目聊天一长，同一条要求就会被反复说明。
修改、补充和提醒散落在很多条消息里。

## 0:00:09.90 · One table cell changes, but the whole document comes back

**English narration**

Now imagine changing one table cell. The model often rewrites the whole document, so text you never touched can change too.

**Simplified Chinese subtitles**

明明只想改一个表格单元格，
模型却常常把整篇文档重新写一遍。

## 0:00:19.60 · Which version will the next answer follow?

**English narration**

After a few rounds, the real question is no longer what was discussed. It is which version the next answer should actually follow.

**Simplified Chinese subtitles**

讨论几轮以后，真正的问题变成了：
下一次回答到底应该听哪一版？

## 0:00:29.20 · Move the accepted version out of chat

**English narration**

Codex Text Control separates those jobs. Chat stays open for discussion. A separate canvas holds the version you have reviewed and accepted.

**Simplified Chinese subtitles**

这个工具把讨论和最终版本分开：
聊天负责讨论，画布保存确认版本。

## 0:00:40.40 · Open the current context

**English narration**

Start in the project and ask Codex to open the current authoritative context canvas.

**Simplified Chinese subtitles**

在项目里，让 Codex 打开
当前权威上下文画布。

## 0:00:47.00 · Edit the sentence itself

**English narration**

Edit the sentence directly. The draft stays in the canvas while you type, so partial input never becomes a saved revision.

**Simplified Chinese subtitles**

直接修改需要调整的那句话。
输入过程只留在草稿里，不会保存半成品。

## 0:00:56.60 · Edit a Markdown table cell in place

**English narration**

For a Markdown table, edit the exact cell. Here, only the review status changes from Needs review to Confirmed.

**Simplified Chinese subtitles**

表格也能直接改单元格。
这里只改状态，周围内容保持不变。

## 0:01:06.10 · Switch to Markdown source when needed

**English narration**

When the visual canvas is not enough, switch to Markdown source and edit the same draft without leaving the workflow.

**Simplified Chinese subtitles**

复杂格式可切换到源码视图。
仍然编辑同一份源码草稿。

## 0:01:14.30 · Review the complete text before anything is saved

**English narration**

Finish editing opens a final check with the complete original text. Nothing is committed merely because this review opened.

**Simplified Chinese subtitles**

点击“完成编辑”后先检查完整原文。
此时还没有保存，也没有更新当前版本。

## 0:01:23.20 · Return to the draft without losing it

**English narration**

If something is wrong, return to editing. The draft is retained, and the previously accepted revision still remains authoritative.

**Simplified Chinese subtitles**

发现问题就返回修改。
草稿不会丢，之前确认的版本仍然有效。

## 0:01:33.30 · Confirm once, then publish one revision

**English narration**

Only Confirm commit writes the snapshot, advances the authoritative pointer, and sends the new revision ID back to the conversation.

**Simplified Chinese subtitles**

只有点击“确认提交”，系统才保存快照，
并更新当前权威版本。

## 0:01:43.00 · Return only the revision ID to the conversation

**English narration**

The simulated host message shows what returns to the conversation: the new revision ID, not another copy of the full context.

**Simplified Chinese subtitles**

聊天里只返回新的版本号，
不再重复粘贴整篇正文。

## 0:01:52.40 · Load an earlier revision without rewriting history

**English narration**

Revision history remains available. Loading an older snapshot creates a draft, and restoring it still requires a new confirmation.

**Simplified Chinese subtitles**

历史版本可以查看和载入。
要恢复旧版，仍然需要再次确认提交。

## 0:02:02.30 · Read the accepted revision before the next answer

**English narration**

Before the next answer, Codex reads the authoritative context again. Revision rev demo zero forty three is now the accepted source.

**Simplified Chinese subtitles**

回答前，Codex 会重新读取确认版本。
之后继续遵循你刚刚确认的内容。

## 0:02:12.80 · Fewer repeats. Smaller edits. One accepted version.

**English narration**

That is the change: less repeated instruction, safer small edits, and one reviewed version for the next answer to follow.

**Simplified Chinese subtitles**

结果是：少重复，小改动更准确，
下一次回答也有明确依据。

## Evidence boundary

The interface screens are generated from the current product source with a simulated Codex bridge. They are not a recording of the Codex host. The repository evidence supports 74/74 automated tests, 5/5 GitHub Actions jobs, and an MIT license. It does not establish production readiness, cross-platform host support, or an external capability benchmark.
