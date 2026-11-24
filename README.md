# dsh-plugin-eleckoi-st-tools

把酒馆（SillyTavern）里最实用的两件事搬进 ElecKoi：**快捷指令**与**聊天记录导出**。

## 功能

### 快捷指令

- 输入框上方出现一排胶囊，点一下写进输入框，双击直接发送
- 「全部指令」面板可按分类浏览、搜索，共 140 条；数据来自酒馆 QR「快捷指令大全」
- 支持新建自己的指令，保存在本机
- 入口同时出现在底部三横线菜单里

### 聊天记录导出

ElecKoi 原生只有归档 JSON，没有导出入口。本插件补上：

- 纯文本（`.txt`）
- Markdown（`.md`）
- 归档 JSON（官方格式，可跨设备导入）
- 范围可选「全部」或「最近 10 条」

## 安装

```bash
dsh plugin --profile web add dsh-plugin-eleckoi-st-tools
```

或在 ElecKoi 侧边栏 → 插件 → 添加插件，填入包名 `dsh-plugin-eleckoi-st-tools`。

## 接口

全部走 ElecKoi 公开接口，没有修改任何内部实现：

| 能力 | 接口 |
| --- | --- |
| 读写输入框 | `ctx.eleckoiConversations.readInputDraft / writeInputDraft` |
| 发送 | `ctx.eleckoiConversations.submitInput` |
| 导出归档 | `ctx.eleckoiConversations.exportArchive` |
| 界面挂载 | `shell.overlay`、`eleckoi.roleplay.conversation.input.dock`、`eleckoi.roleplay.conversation.input.menu.actions` |

## 数据

`data/quick-replies.json` 为快捷指令数据，140 条，分 11 类。可自行替换。
用户自定义指令保存在浏览器 `localStorage` 的 `eleckoi.stTools.v1`。

## 许可

AGPL-3.0-or-later
