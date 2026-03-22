import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import * as os from 'os';
import { CdpMonitor } from './cdpMonitor';
import { t, initLanguage, setLanguage, getLanguage } from './i18n';




let statusBarItem: vscode.StatusBarItem;
let isEnabled = true;
let isPersistentAlertEnabled = false;
let cdpMonitor: CdpMonitor | null = null;
let outputChannel: vscode.OutputChannel;

// 获取当前窗口标识，用于多窗口 CDP target 匹配
function getWindowTitle(): string {
    // VS Code 的 CDP target title 通常包含工作区名称
    return vscode.workspace.name || '';
}

function log(msg: string) {
    if (outputChannel) {
        outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${msg}`);
    }
}

// 防抖：避免短时间内重复触发
let lastPlayTime = 0;
const DEBOUNCE_MS = 3000;

// 持续提醒
let alertIntervalId: NodeJS.Timeout | null = null;
let isAlertActive = false;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Antigravity Task Sound');
    context.subscriptions.push(outputChannel);

    // 初始化语言
    initLanguage();

    log('Antigravity Task Sound v4.0.0 is now active!');

    // 读取初始设置
    const config = vscode.workspace.getConfiguration('antigravityTaskSound');
    isEnabled = config.get<boolean>('enabled', true);
    isPersistentAlertEnabled = config.get<boolean>('persistentAlert', false);
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
            const cdpStatus = cdpMonitor?.isConnected() ? t('cdp.statusConnected') : t('cdp.statusDisconnected');
            const lang = getLanguage();

            const items: vscode.QuickPickItem[] = [
                {
                    label: isEnabled ? `$(bell-slash) ${t('menu.soundOff')}` : `$(bell) ${t('menu.soundOn')}`,
                    description: `${isEnabled ? t('menu.currentOn') : t('menu.currentOff')}`,
                },
                {
                    label: isPersistentAlertEnabled ? `$(close) ${t('menu.persistentOff')}` : `$(megaphone) ${t('menu.persistentOn')}`,
                    description: `${isPersistentAlertEnabled ? t('menu.persistentDesc.on') : t('menu.persistentDesc.off')}`,
                },
                {
                    label: `$(play) ${t('menu.testPlay')}`,
                    description: t('menu.testPlayDesc'),
                },
                {
                    label: `$(file-media) ${t('menu.switchSound')}`,
                    description: currentSound ? path.basename(currentSound) : t('menu.defaultSound'),
                },
                {
                    label: `$(settings) ${t('menu.adjustVolume')}`,
                    description: `${currentVolume}%`,
                },
                {
                    label: `$(sync) ${t('menu.loopInterval')}`,
                    description: t('menu.loopIntervalDesc'),
                },
                {
                    label: `$(plug) ${t('menu.cdpConnect')}`,
                    description: cdpStatus,
                },
                {
                    label: `$(globe) ${t('menu.language')}`,
                    description: lang === 'zh-CN' ? t('menu.languageDesc.zh') : t('menu.languageDesc.en'),
                },
            ];

            const selected = await vscode.window.showQuickPick(items, {
                title: t('menu.title'),
                placeHolder: t('menu.placeholder'),
            });

            if (!selected) { return; }

            const label = selected.label;

            if (label.includes('bell-slash') || label.includes('bell)')) {
                isEnabled = !isEnabled;
                currentConfig.update('enabled', isEnabled, vscode.ConfigurationTarget.Global);
                updateStatusBar();
                vscode.window.showInformationMessage(
                    isEnabled ? t('msg.soundEnabled') : t('msg.soundDisabled')
                );
            } else if (label.includes('close') || label.includes('megaphone')) {
                isPersistentAlertEnabled = !isPersistentAlertEnabled;
                currentConfig.update('persistentAlert', isPersistentAlertEnabled, vscode.ConfigurationTarget.Global);
                updateStatusBar();
                vscode.window.showInformationMessage(
                    isPersistentAlertEnabled ? t('msg.persistentEnabled') : t('msg.persistentDisabled')
                );
            } else if (label.includes('play')) {
                triggerAlert(context);
            } else if (label.includes('file-media')) {
                await showSoundPicker(context);
            } else if (label.includes('settings')) {
                await showVolumePicker();
            } else if (label.includes('sync')) {
                await showLoopIntervalPicker();
            } else if (label.includes('globe')) {
                await showLanguagePicker();
            } else if (label.includes('plug')) {
                if (cdpMonitor?.isConnected()) {
                    cdpMonitor.disconnect();
                    updateStatusBar();
                    vscode.window.showInformationMessage(t('msg.cdpDisconnected'));
                } else {
                    const port = currentConfig.get<number>('cdpPort', 9000);
                    if (!cdpMonitor) {
                        cdpMonitor = new CdpMonitor(port, () => {
                            if (isEnabled) { triggerAlert(context); }
                        }, outputChannel, getWindowTitle());
                        cdpMonitor.setStatusBar(statusBarItem);
                    }
                    outputChannel.show(true);
                    const connected = await cdpMonitor.connect();
                    if (connected) {
                        vscode.window.showInformationMessage(t('msg.cdpConnected'));
                    } else {
                        vscode.window.showWarningMessage(t('msg.cdpFailed'));
                    }
                }
            }
        })
    );

    // 测试声音（命令面板也可用）
    context.subscriptions.push(
        vscode.commands.registerCommand('antigravityTaskSound.testSound', () => {
            triggerAlert(context);
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
                isEnabled ? t('msg.soundEnabled') : t('msg.soundDisabled')
            );
        })
    );

    // 手动连接 CDP（命令面板也可用）
    context.subscriptions.push(
        vscode.commands.registerCommand('antigravityTaskSound.connectCdp', async () => {
            if (cdpMonitor) { cdpMonitor.disconnect(); }
            const port = vscode.workspace.getConfiguration('antigravityTaskSound').get<number>('cdpPort', 9000);
            cdpMonitor = new CdpMonitor(port, () => {
                if (isEnabled) { triggerAlert(context); }
            }, outputChannel, getWindowTitle());
            cdpMonitor.setStatusBar(statusBarItem);

            outputChannel.show(true);
            const connected = await cdpMonitor.connect();
            if (connected) {
                vscode.window.showInformationMessage(t('msg.cdpConnected'));
            } else {
                vscode.window.showWarningMessage(t('msg.cdpFailed'));
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
            if (e.affectsConfiguration('antigravityTaskSound.persistentAlert')) {
                isPersistentAlertEnabled = vscode.workspace.getConfiguration('antigravityTaskSound')
                    .get<boolean>('persistentAlert', false);
                updateStatusBar();
            }
            if (e.affectsConfiguration('antigravityTaskSound.cdpPort')) {
                const newPort = vscode.workspace.getConfiguration('antigravityTaskSound')
                    .get<number>('cdpPort', 9000);
                if (cdpMonitor) {
                    cdpMonitor.updatePort(newPort);
                }
            }
            if (e.affectsConfiguration('antigravityTaskSound.language')) {
                const newLang = vscode.workspace.getConfiguration('antigravityTaskSound')
                    .get<string>('language', 'zh-CN') as 'zh-CN' | 'en';
                setLanguage(newLang);
                updateStatusBar();
                vscode.window.showInformationMessage(t('msg.languageChanged'));
            }
        })
    );

    // ======== 事件监听（CDP 未连接时的降级方案）========

    context.subscriptions.push(
        vscode.window.onDidCloseTerminal((_t: vscode.Terminal) => {
            if (isEnabled && !cdpMonitor?.isConnected()) { triggerAlert(context); }
        })
    );

    context.subscriptions.push(
        vscode.tasks.onDidEndTaskProcess((_e: vscode.TaskProcessEndEvent) => {
            if (isEnabled && !cdpMonitor?.isConnected()) { triggerAlert(context); }
        })
    );

    // ======== 自动连接 CDP ========
    if (cdpEnabled) {
        log('Will auto-connect CDP in 3 seconds...');
        setTimeout(async () => {
            cdpMonitor = new CdpMonitor(cdpPort, () => {
                if (isEnabled) { triggerAlert(context); }
            }, outputChannel, getWindowTitle());
            cdpMonitor.setStatusBar(statusBarItem);
            const connected = await cdpMonitor.connect();
            if (connected) {
                log('CDP auto-connected successfully.');
            } else {
                log('CDP auto-connect failed, falling back to terminal events.');
                updateStatusBar();
            }
        }, 3000);
    }
}

// ======== 语言选择器 ========
async function showLanguagePicker() {
    const currentLang = getLanguage();
    const items: vscode.QuickPickItem[] = [
        {
            label: currentLang === 'zh-CN' ? '$(check) 中文 (简体)' : '中文 (简体)',
            description: 'Chinese Simplified',
            detail: 'zh-CN',
        },
        {
            label: currentLang === 'en' ? '$(check) English' : 'English',
            description: 'English',
            detail: 'en',
        },
    ];

    const selected = await vscode.window.showQuickPick(items, {
        title: '🌐 Language / 语言',
        placeHolder: 'Select language / 选择语言',
    });

    if (selected && selected.detail) {
        const newLang = selected.detail as 'zh-CN' | 'en';
        if (newLang !== currentLang) {
            setLanguage(newLang);
            await vscode.workspace.getConfiguration('antigravityTaskSound')
                .update('language', newLang, vscode.ConfigurationTarget.Global);
            updateStatusBar();
            vscode.window.showInformationMessage(t('msg.languageChanged'));
        }
    }
}

// ======== 音效选择器 ========
async function showSoundPicker(context: vscode.ExtensionContext) {
    const currentSound = vscode.workspace.getConfiguration('antigravityTaskSound').get<string>('soundFile', '');
    const isDefault = !currentSound || currentSound.trim() === '';

    const items: vscode.QuickPickItem[] = [
        {
            label: isDefault ? `$(check) $(music) ${t('soundPicker.default')}` : `$(music) ${t('soundPicker.default')}`,
            description: t('soundPicker.defaultDesc'),
            detail: '__DEFAULT__',
        },
        {
            label: `$(folder-opened) ${t('soundPicker.customFile')}`,
            description: t('soundPicker.customFileDesc'),
        },
    ];

    const selected = await vscode.window.showQuickPick(items, {
        title: t('soundPicker.title'),
        placeHolder: t('soundPicker.placeholder'),
    });

    if (!selected) { return; }

    if (selected.detail === '__DEFAULT__') {
        await vscode.workspace.getConfiguration('antigravityTaskSound')
            .update('soundFile', '', vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(t('msg.soundDefault'));
    } else if (selected.label.includes('folder-opened')) {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectMany: false,
            filters: { [t('soundPicker.filter')]: ['wav'] },
            title: t('soundPicker.dialogTitle'),
        });
        if (uris && uris.length > 0) {
            const filePath = uris[0].fsPath;
            await vscode.workspace.getConfiguration('antigravityTaskSound')
                .update('soundFile', filePath, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`${t('msg.soundChanged')}${path.basename(filePath)}`);
        }
    }
}

// ======== 音量选择器 ========
async function showVolumePicker() {
    const items: vscode.QuickPickItem[] = [
        { label: '🔈 20%', description: t('volume.20') },
        { label: '🔉 40%', description: t('volume.40') },
        { label: '🔊 50%', description: t('volume.50') },
        { label: '🔊 70%', description: t('volume.70') },
        { label: '🔊 100%', description: t('volume.100') },
    ];

    const selected = await vscode.window.showQuickPick(items, {
        title: t('volume.title'),
        placeHolder: t('volume.placeholder'),
    });

    if (selected) {
        const match = selected.label.match(/(\d+)%/);
        if (match) {
            const vol = parseInt(match[1], 10);
            await vscode.workspace.getConfiguration('antigravityTaskSound')
                .update('volume', vol, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`${t('msg.volumeSet')}${vol}%`);
        }
    }
}

// ======== 循环时长选择器 ========
async function showLoopIntervalPicker() {
    const currentConfig = vscode.workspace.getConfiguration('antigravityTaskSound');
    const currentInterval = currentConfig.get<number>('persistentAlertInterval', 0);

    const items: vscode.QuickPickItem[] = [
        {
            label: currentInterval === 0 ? `$(check) ${t('loopInterval.auto')}` : t('loopInterval.auto'),
            description: t('loopInterval.autoDesc'),
            detail: '0',
        },
        { label: `5${t('loopInterval.seconds')}`, detail: '5' },
        { label: `10${t('loopInterval.seconds')}`, detail: '10' },
        { label: `15${t('loopInterval.seconds')}`, detail: '15' },
        { label: `20${t('loopInterval.seconds')}`, detail: '20' },
        { label: `30${t('loopInterval.seconds')}`, detail: '30' },
        { label: `45${t('loopInterval.seconds')}`, detail: '45' },
        { label: `60${t('loopInterval.seconds')}`, detail: '60' },
    ];

    // 标记当前选中的
    for (const item of items) {
        if (item.detail && parseInt(item.detail) === currentInterval && currentInterval !== 0) {
            item.label = `$(check) ${item.label}`;
        }
    }

    const selected = await vscode.window.showQuickPick(items, {
        title: t('loopInterval.title'),
        placeHolder: t('loopInterval.placeholder'),
    });

    if (selected && selected.detail !== undefined) {
        const seconds = parseInt(selected.detail);
        await currentConfig.update('persistentAlertInterval', seconds, vscode.ConfigurationTarget.Global);
        if (seconds === 0) {
            vscode.window.showInformationMessage(t('msg.loopIntervalAuto'));
        } else {
            vscode.window.showInformationMessage(`${t('msg.loopIntervalSet')}${seconds}${t('loopInterval.seconds')}`);
        }
    }
}

// ======== 获取 WAV 文件时长（秒） ========
function getWavDuration(filePath: string): number {
    try {
        const buf = fs.readFileSync(filePath);
        if (buf.length < 44) { return 6; } // 默认 6 秒
        const sampleRate = buf.readUInt32LE(24);
        const numChannels = buf.readUInt16LE(22);
        const bitsPerSample = buf.readUInt16LE(34);
        const bytesPerSample = numChannels * (bitsPerSample / 8);
        const dataSize = buf.length - 44;
        return dataSize / (sampleRate * bytesPerSample);
    } catch {
        return 6; // 默认 6 秒
    }
}

// ======== 触发提醒（根据模式选择单次或持续）========
function triggerAlert(context: vscode.ExtensionContext) {
    log(`triggerAlert called (persistent=${isPersistentAlertEnabled})`);
    if (isPersistentAlertEnabled) {
        playPersistentAlert(context);
    } else {
        playSound(context);
    }
}

// ======== 持续提醒（循环播放 + 模态弹窗）========
async function playPersistentAlert(context: vscode.ExtensionContext) {
    if (isAlertActive) { return; } // 防止重复触发
    isAlertActive = true;

    const config = vscode.workspace.getConfiguration('antigravityTaskSound');
    const intervalSetting = config.get<number>('persistentAlertInterval', 0);

    // 确定循环间隔
    let intervalMs: number;
    if (intervalSetting === 0) {
        // 自动模式：跟随音效时长
        const customSound = config.get<string>('soundFile', '');
        const soundPath = (customSound && customSound.trim() !== '')
            ? customSound
            : path.join(context.extensionPath, 'sounds', 'gentle-chime.wav');
        const duration = getWavDuration(soundPath);
        intervalMs = Math.max(Math.ceil(duration * 1000) + 500, 1000); // 音效时长 + 0.5秒缓冲
        log(`Persistent alert: auto interval = ${intervalMs}ms (sound duration: ${duration.toFixed(1)}s)`);
    } else {
        intervalMs = intervalSetting * 1000;
        log(`Persistent alert: fixed interval = ${intervalMs}ms`);
    }

    // 立即播放一次
    playSound(context);

    // 启动循环播放
    alertIntervalId = setInterval(() => {
        lastPlayTime = 0; // 重置防抖，确保每次都播放
        playSound(context);
    }, intervalMs);

    // 弹出模态对话框（会阻塞直到用户点击）
    await vscode.window.showInformationMessage(
        t('msg.taskComplete'),
        { modal: true, detail: t('msg.taskCompleteDetail') },
        t('msg.confirm')
    );

    // 用户点击后停止循环
    stopPersistentAlert();
}

function stopPersistentAlert() {
    if (alertIntervalId) {
        clearInterval(alertIntervalId);
        alertIntervalId = null;
    }
    isAlertActive = false;
}

// ======== 状态栏 ========
function updateStatusBar() {
    let text = '';
    if (cdpMonitor?.isConnected()) {
        text = isEnabled ? '$(bell) CDP' : '$(bell-slash) CDP';
    } else {
        text = isEnabled ? `$(bell) ${t('statusBar.sound')}` : `$(bell-slash) ${t('statusBar.sound')}`;
    }
    if (isPersistentAlertEnabled) {
        text += ' 🔁';
    }

    text += ' v4.0.0';

    statusBarItem.text = text;
    statusBarItem.tooltip = [
        `${t('statusBar.tooltip.sound')}：${isEnabled ? t('statusBar.tooltip.enabled') : t('statusBar.tooltip.disabled')}`,
        `${t('statusBar.tooltip.persistent')}：${isPersistentAlertEnabled ? t('statusBar.tooltip.enabled') : t('statusBar.tooltip.disabled')}`,
        t('statusBar.tooltip.clickToOpen')
    ].join('\n');
}

// ======== 播放声音 ========
function playSound(context: vscode.ExtensionContext) {
    const now = Date.now();
    if (now - lastPlayTime < DEBOUNCE_MS) {
        log(`playSound skipped: debounce (${now - lastPlayTime}ms < ${DEBOUNCE_MS}ms)`);
        return;
    }
    lastPlayTime = now;

    const config = vscode.workspace.getConfiguration('antigravityTaskSound');
    const customSoundFile = config.get<string>('soundFile', '');
    const volume = config.get<number>('volume', 50);

    let soundPath: string;
    if (customSoundFile && customSoundFile.trim() !== '') {
        soundPath = customSoundFile;
        log(`playSound: using custom sound: ${soundPath}`);
    } else {
        soundPath = path.join(context.extensionPath, 'sounds', 'gentle-chime.wav');
        log(`playSound: using default sound: ${soundPath}`);
    }

    // 检查文件是否存在
    if (!fs.existsSync(soundPath)) {
        log(`playSound ERROR: sound file not found: ${soundPath}`);
        return;
    }

    const platform = os.platform();
    let command: string;

    if (platform === 'win32') {
        const vol = volume / 100;
        // Open() 是异步的，需等待文件加载完成再 Play()
        command = `powershell -NoProfile -Command "Add-Type -AssemblyName PresentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Volume = ${vol}; $player.Open([uri]'${soundPath.replace(/'/g, "''")}'); Start-Sleep -Milliseconds 500; $player.Play(); Start-Sleep -Milliseconds 5000"`;
    } else if (platform === 'darwin') {
        const vol = Math.round(volume * 2.55);
        command = `afplay -v ${vol / 255} "${soundPath}"`;
    } else {
        const vol = Math.round(volume * 655.35);
        command = `paplay --volume=${vol} "${soundPath}"`;
    }

    log(`playSound: executing command (volume=${volume}%, platform=${platform})`);

    exec(command, (error: Error | null) => {
        if (error) {
            log(`playSound ERROR: ${error.message}`);
            if (platform === 'win32') {
                exec('powershell -NoProfile -Command "[System.Media.SystemSounds]::Asterisk.Play()"');
            }
        } else {
            log('playSound: command completed successfully');
        }
    });
}

export function deactivate() {
    stopPersistentAlert();
    if (cdpMonitor) {
        cdpMonitor.disconnect();
        cdpMonitor = null;
    }
}
