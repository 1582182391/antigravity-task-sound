# Antigravity Task Sound 🔔

> Play sound notifications when Antigravity AI Agent completes a response.
> 在 Antigravity AI Agent 完成回复时自动播放声音通知。

Supports **English** and **Chinese (中文)** — switch anytime in settings.

When using AI Agent in [Antigravity IDE](https://antigravity.google), this extension detects AI response completion via **Chrome DevTools Protocol (CDP)** and plays a notification sound.

当你在 [Antigravity IDE](https://antigravity.google) 中使用 AI Agent 时，扩展会通过 **CDP 协议** 实时检测 AI 回复状态，完成后自动播放提示音。

## ✨ Features / 功能

- 🎯 **Precise Detection** — CDP-based monitoring of `workbench.html` page state
- 🔔 **Auto Notification** — Plays sound when AI completes a response
- 🎵 **Custom Sounds** — Support for custom `.wav` files and volume control
- 🌐 **Bilingual UI** — English / 中文, switchable in settings
- 📈 **Output Logging** — Built-in "Antigravity Task Sound" output panel
- 🔄 **Auto Reconnect** — Automatic reconnection with IPv4 support
- 🖥️ **Cross Platform** — Windows / macOS / Linux

## 📦 Installation / 安装

### 1. Configure Antigravity Launch Arguments / 配置启动参数

Add to your Antigravity shortcut target:
在 Antigravity 快捷方式的目标末尾添加：

```
--remote-debugging-port=9000
```

### 2. Install Extension / 安装扩展

Download the latest `.vsix` file, then in Antigravity:
下载最新的 `.vsix` 文件，然后：

1. `Ctrl+Shift+P` → `Install from VSIX`
2. Select the `.vsix` file / 选择 `.vsix` 文件
3. `Ctrl+Shift+P` → `Reload Window`

### 3. Start Using / 开始使用

The extension auto-connects to CDP on startup. Status bar shows `CDP Connected` / `CDP 已连接` when ready.

## 🌐 Language / 语言切换

Switch language via:
- Click status bar button → `Language / 切换语言`
- Or: Settings → `antigravityTaskSound.language` → `zh-CN` / `en`

## 🛠️ Commands / 命令

| Command | Description |
|---------|------------|
| `Antigravity Task Sound: Settings Menu` | Open settings menu / 打开设置菜单 |
| `Antigravuation Task Sound: Test Sound` | Play test sound / 播放测试声音 |
| `Antigravity Task Sound: Toggle` | Toggle notification / 切换通知 |
| `Antigravity Task Sound: Connect CDP f| Manual CDP connect / 手动连接 CDP |

## ⚙️ Settings / 设置

| Setting | Default | Description |
|---------|---------|-------------|
| `enabled` | `true` | Enable/disable notification / 启用/禁用通知 |
| `cdpEnabled` | `true` | Enable CDP detection / 启用 CDP 检测 |
| `cdpPort` | `9000` | Remote debugging port / 远程调试端口 |
| `soundFile` | `""` | Custom .wav path / 自定义音效路径 |
| `volume` | `50` | Volume (0-100) / 音量 |
| `language` | `zh-CN` | UI language: `zh-CN` or `en` / 界面语言 |

## 🔧 How It Works / 工作原理

```
Antigravity (Electron)          Extension
       │                          │
       │  --remote-debugging-port │
       │◄─────────────────────────┤  CDP WebSocket
       │                          │
       │   Poll DOM every 2s      │
       │   Detect "Stop" button   │
       │                          │
       │   Button visible = AI generating
       │   Button gone ×3 = Done! │
       │                     🔔 Play sound
```

## 📝 Build from Source / 从源码构建

```bash
git clone https://github.com/1582182391/antigravity-task-sound.git
cd antigravity-task-sound
npm install
npm run compile
npx @vscode/vsce package --allow    -missing-repository
```

## License

MIT
