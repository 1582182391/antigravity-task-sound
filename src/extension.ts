import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import * as os from 'os';
import { CdpMonitor } from './cdpMonitor';

declare const console: any;

let statusBarItem: vscode.StatusBarItem;
let isEnabled = true;
let cdpMonitor: CdpMonitor | null = null;

// 防抖：避免短时间内重复触发
let lastPlayTime = 0;
const DEBOUNCE_MS = 3000;

export function activate(context: vscode.ExtensionContext) {
    console.log('Antigravity Task Sound v2.0 is now active!');

    // 读取初始设置
    const config = vscode.workspace.getConfiguration('antigravityTaskSound');
    isEnabled = config.get<boolean>('enabled', true);
    const cdpPort = config.get<number>('cdpPort', 9000);
    const cdpEnabled = config.get<boolean>('cdpEnabled', true);

    // 创建状态栏按钮
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'antigravityTaskSound.showMenu';
    updateStatusBar();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // ======== 命令注册 ========

    // 快捷设置菜单（点击状态栏按钮触发）
    context.subscriptions.push(
        vscode.commands.registerCommand('antigravityTaskSound.showMenu', async () => {
            const currentConfig = vscode.workspace.getConfiguration('antigravityTaskSound');
            const currentVolume = currentConfig.get<number>('volume', 50);
            const currentSound = currentConfig.get<string>('soundFile', '');
            const cdpStatus = cdpMonitor?.isConnected() ? '✅ 已连接' : '❌ 未连接';

            const items: vscode.QuickPickItem[] = [
                {
                    label: isEnabled ? '$(bell-slash) 关闭声音通知' : '$(bell) 开启声音通知',
                    description: `当前：${isEnabled ? '已开启' : '已关闭'}`,
                },
                {
                    label: '$(play) 测试播放',
                    description: '播放当前设置的提示音',
                },
                {
                    label: '$(file-media) 切换音效',
                    description: currentSound ? path.basename(currentSound) : '默认音效',
                },
                {
                    label: '$(settings) 调整音量',
                    description: `当前：${currentVolume}%`,
                },
                {
                    label: '$(plug) CDP 连接',
                    description: cdpStatus,
                },
            ];

            const selected = await vscode.window.showQuickPick(items, {
                title: '🔔 Antigravity Task Sound 设置',
                placeHolder: '选择一个操作...',
            });

            if (!selected) { return; }

            const label = selected.label;

            if (label.includes('关闭声音') || label.includes('开启声音')) {
                isEnabled = !isEnabled;
                currentConfig.update('enabled', isEnabled, vscode.ConfigurationTarget.Global);
                updateStatusBar();
                vscode.window.showInformationMessage(
                    isEnabled ? '🔔 声音通知已开启' : '🔕 声音通知已关闭'
                );
            } else if (label.includes('测试播放')) {
                playSound(context);
            } else if (label.includes('切换音效')) {
                await showSoundPicker(context);
            } else if (label.includes('调整音量')) {
                await showVolumePicker();
            } else if (label.includes('CDP')) {
                if (cdpMonitor?.isConnected()) {
                    cdpMonitor.disconnect();
                    updateStatusBar();
                    vscode.window.showInformationMessage('CDP 已断开');
                } else {
                    const port = currentConfig.get<number>('cdpPort', 9000);
                    if (!cdpMonitor) {
                        cdpMonitor = new CdpMonitor(port, () => {
                            if (isEnabled) { playSound(context); }
                        });
                        cdpMonitor.setStatusBar(statusBarItem);
                    }
                    const connected = await cdpMonitor.connect();
                    if (connected) {
                        vscode.window.showInformationMessage('✅ CDP 连接成功！');
                    } else {
                        vscode.window.showWarningMessage(`❌ CDP 连接失败。请确保启动参数含 --remote-debugging-port=${port}`);
                    }
                }
            }
        })
    );

    // 测试声音（命令面板也可用）
    context.subscriptions.push(
        vscode.commands.registerCommand('antigravityTaskSound.testSound', () => {
            playSound(context);
            vscode.window.showInformationMessage('🔔 正在播放测试声音...');
        })
    );

    // 切换开关（命令面板也可用）
    context.subscriptions.push(
        vscode.commands.registerCommand('antigravityTaskSound.toggle', () => {
            isEnabled = !isEnabled;
            vscode.workspace.getConfiguration('antigravityTaskSound')
                .update('enabled', isEnabled, vscode.ConfigurationTarget.Global);
            updateStatusBar();
            vscode.window.showInformationMessage(
                isEnabled ? '🔔 任务声音通知已开启' : '🔕 任务声音通知已关闭'
            );
        })
    );

    // 手动连接 CDP（命令面板也可用）
    context.subscriptions.push(
        vscode.commands.registerCommand('antigravityTaskSound.connectCdp', async () => {
            if (cdpMonitor) { cdpMonitor.disconnect(); }
            const port = vscode.workspace.getConfiguration('antigravityTaskSound').get<number>('cdpPort', 9000);
            cdpMonitor = new CdpMonitor(port, () => {
                if (isEnabled) { playSound(context); }
            });
            cdpMonitor.setStatusBar(statusBarItem);
            const connected = await cdpMonitor.connect();
            if (connected) {
                vscode.window.showInformationMessage('✅ CDP 连接成功！');
            } else {
                vscode.window.showWarningMessage(`❌ CDP 连接失败。请确保 Antigravity 以 --remote-debugging-port=${port} 启动`);
            }
        })
    );

    // 监听设置变化  
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
            if (e.affectsConfiguration('antigravityTaskSound.enabled')) {
                isEnabled = vscode.workspace.getConfiguration('antigravityTaskSound')
                    .get<boolean>('enabled', true);
                updateStatusBar();
            }
            if (e.affectsConfiguration('antigravityTaskSound.cdpPort')) {
                const newPort = vscode.workspace.getConfiguration('antigravityTaskSound')
                    .get<number>('cdpPort', 9000);
                if (cdpMonitor) {
                    cdpMonitor.updatePort(newPort);
                }
            }
        })
    );

    // ======== 事件监听（CDP 未连接时的降级方案）========

    context.subscriptions.push(
        vscode.window.onDidCloseTerminal((_t: vscode.Terminal) => {
            if (isEnabled && !cdpMonitor?.isConnected()) { playSound(context); }
        })
    );

    context.subscriptions.push(
        vscode.tasks.onDidEndTaskProcess((_e: vscode.TaskProcessEndEvent) => {
            if (isEnabled && !cdpMonitor?.isConnected()) { playSound(context); }
        })
    );

    // ======== 自动连接 CDP ========
    if (cdpEnabled) {
        setTimeout(async () => {
            cdpMonitor = new CdpMonitor(cdpPort, () => {
                if (isEnabled) { playSound(context); }
            });
            cdpMonitor.setStatusBar(statusBarItem);
            const connected = await cdpMonitor.connect();
            if (connected) {
                console.log('[TaskSound] CDP auto-connected');
            } else {
                console.log('[TaskSound] CDP auto-connect failed, falling back to terminal events');
                updateStatusBar();
            }
        }, 3000);
    }
}

// ======== 音效选择器 ========
async function showSoundPicker(context: vscode.ExtensionContext) {
    const soundsDir = path.join(context.extensionPath, 'sounds');
    const files: string[] = [];

    try {
        const entries = fs.readdirSync(soundsDir);
        for (const entry of entries) {
            if (entry.endsWith('.wav')) {
                files.push(entry);
            }
        }
    } catch { /* ignore */ }

    const items: vscode.QuickPickItem[] = files.map(f => ({
        label: `$(file-media) ${f.replace('.wav', '')}`,
        description: f,
        detail: path.join(soundsDir, f),
    }));

    items.push({
        label: '$(folder-opened) 选择自定义文件...',
        description: '从电脑中选择 .wav 文件',
    });

    const selected = await vscode.window.showQuickPick(items, {
        title: '🎵 选择提示音效',
        placeHolder: '选择一个内置音效或自定义文件',
    });

    if (!selected) { return; }

    if (selected.label.includes('自定义文件')) {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            filters: { '音效文件': ['wav'] },
            title: '选择 WAV 音效文件',
        });
        if (uris && uris.length > 0) {
            const filePath = uris[0].fsPath;
            await vscode.workspace.getConfiguration('antigravityTaskSound')
                .update('soundFile', filePath, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`🎵 音效已更换为：${path.basename(filePath)}`);
        }
    } else if (selected.detail) {
        await vscode.workspace.getConfiguration('antigravityTaskSound')
            .update('soundFile', selected.detail, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`🎵 音效已更换为：${selected.description}`);
    }
}

// ======== 音量选择器 ========
async function showVolumePicker() {
    const items: vscode.QuickPickItem[] = [
        { label: '🔈 20%', description: '很安静' },
        { label: '🔉 40%', description: '较安静' },
        { label: '🔊 50%', description: '适中（默认）' },
        { label: '🔊 70%', description: '较大声' },
        { label: '🔊 100%', description: '最大声' },
    ];

    const selected = await vscode.window.showQuickPick(items, {
        title: '🔊 调整音量',
        placeHolder: '选择音量等级',
    });

    if (selected) {
        const match = selected.label.match(/(\d+)%/);
        if (match) {
            const vol = parseInt(match[1], 10);
            await vscode.workspace.getConfiguration('antigravityTaskSound')
                .update('volume', vol, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`🔊 音量已设为 ${vol}%`);
        }
    }
}

// ======== 状态栏 ========
function updateStatusBar() {
    if (cdpMonitor?.isConnected()) {
        statusBarItem.text = isEnabled ? '$(bell) CDP 已连接' : '$(bell-slash) CDP 已连接';
    } else {
        statusBarItem.text = isEnabled ? '$(bell) 声音通知' : '$(bell-slash) 声音通知';
    }
    statusBarItem.tooltip = [
        `声音通知：${isEnabled ? '已开启' : '已关闭'}`,
        `CDP：${cdpMonitor?.isConnected() ? '已连接' : '未连接'}`,
        '点击打开设置菜单',
    ].join('\n');
}

// ======== 播放声音 ========
function playSound(context: vscode.ExtensionContext) {
    const now = Date.now();
    if (now - lastPlayTime < DEBOUNCE_MS) { return; }
    lastPlayTime = now;

    const config = vscode.workspace.getConfiguration('antigravityTaskSound');
    const customSoundFile = config.get<string>('soundFile', '');
    const volume = config.get<number>('volume', 50);

    let soundPath: string;
    if (customSoundFile && customSoundFile.trim() !== '') {
        soundPath = customSoundFile;
    } else {
        soundPath = path.join(context.extensionPath, 'sounds', 'task-complete.wav');
    }

    const platform = os.platform();
    let command: string;

    if (platform === 'win32') {
        const vol = volume / 100;
        command = `powershell -NoProfile -Command "Add-Type -AssemblyName PresentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open([uri]'${soundPath.replace(/'/g, "''")}'); $player.Volume = ${vol}; $player.Play(); Start-Sleep -Milliseconds 10000"`;
    } else if (platform === 'darwin') {
        const vol = Math.round(volume * 2.55);
        command = `afplay -v ${vol / 255} "${soundPath}"`;
    } else {
        const vol = Math.round(volume * 655.35);
        command = `paplay --volume=${vol} "${soundPath}"`;
    }

    exec(command, (error: Error | null) => {
        if (error) {
            console.error('[TaskSound] Failed to play sound:', error.message);
            if (platform === 'win32') {
                exec('powershell -NoProfile -Command "[System.Media.SystemSounds]::Asterisk.Play()"');
            }
        }
    });
}

export function deactivate() {
    if (cdpMonitor) {
        cdpMonitor.disconnect();
        cdpMonitor = null;
    }
}
