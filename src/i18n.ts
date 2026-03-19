import * as vscode from 'vscode';

type Language = 'zh-CN' | 'en';

interface Translations {
    [key: string]: string;
}

const zhCN: Translations = {
    // Status bar
    'statusBar.sound': '声音',
    'statusBar.tooltip.sound': '声音通知',
    'statusBar.tooltip.persistent': '持续提醒',
    'statusBar.tooltip.enabled': '已开启',
    'statusBar.tooltip.disabled': '已关闭',
    'statusBar.tooltip.clickToOpen': '点击打开设置菜单',

    // Settings menu
    'menu.title': '🔔 Antigravity Task Sound 设置',
    'menu.placeholder': '选择一个操作...',
    'menu.soundOff': '关闭声音通知',
    'menu.soundOn': '开启声音通知',
    'menu.currentOn': '已开启',
    'menu.currentOff': '已关闭',
    'menu.persistentOff': '关闭持续提醒',
    'menu.persistentOn': '开启持续提醒',
    'menu.persistentDesc.on': '已开启（循环播放直到确认）',
    'menu.persistentDesc.off': '已关闭（播放一次）',
    'menu.testPlay': '测试播放',
    'menu.testPlayDesc': '播放当前设置的提示音',
    'menu.switchSound': '切换音效',
    'menu.defaultSound': '默认音效',
    'menu.adjustVolume': '调整音量',
    'menu.cdpConnect': 'CDP 连接',

    // Messages
    'msg.soundEnabled': '🔔 声音通知已开启',
    'msg.soundDisabled': '🔕 声音通知已关闭',
    'msg.persistentEnabled': '🔁 持续提醒已开启（完成后循环播放直到确认）',
    'msg.persistentDisabled': '🔔 持续提醒已关闭（恢复单次播放）',
    'msg.cdpDisconnected': 'CDP 已断开',
    'msg.cdpConnected': '✅ CDP 连接成功！',
    'msg.cdpFailed': '❌ CDP 连接失败，详情请看 Output 面板',
    'msg.soundChanged': '🎵 音效已更换为：',
    'msg.volumeSet': '🔊 音量已设为 ',
    'msg.taskComplete': '🔔 AI 任务已完成！',
    'msg.taskCompleteDetail': '点击确定停止提示音',
    'msg.confirm': '确定',

    // Sound picker
    'soundPicker.title': '🎵 选择提示音效',
    'soundPicker.placeholder': '选择一个内置音效或自定义文件',
    'soundPicker.default': '恢复默认音效',
    'soundPicker.defaultDesc': 'Gentle Chime（内置默认）',
    'soundPicker.customFile': '选择自定义文件...',
    'soundPicker.customFileDesc': '从电脑中选择 .wav 文件',
    'soundPicker.filter': '音效文件',
    'soundPicker.dialogTitle': '选择 WAV 音效文件',

    // Loop interval
    'menu.loopInterval': '循环时长',
    'menu.loopIntervalDesc': '持续提醒的播放间隔',
    'loopInterval.title': '🔁 设置循环时长',
    'loopInterval.placeholder': '选择循环播放的间隔时长',
    'loopInterval.auto': '自动（跟随音效时长）',
    'loopInterval.autoDesc': '播放完一遍后再循环',
    'loopInterval.seconds': '秒',
    'msg.loopIntervalSet': '🔁 循环时长已设为 ',
    'msg.loopIntervalAuto': '🔁 循环时长已设为自动（跟随音效时长）',
    'msg.soundDefault': '🎵 已恢复默认音效',

    // Volume picker
    'volume.title': '🔊 调整音量',
    'volume.placeholder': '选择音量等级',
    'volume.20': '很安静',
    'volume.40': '较安静',
    'volume.50': '适中（默认）',
    'volume.70': '较大声',
    'volume.100': '最大声',

    // CDP status
    'cdp.connected': 'CDP 已连接',
    'cdp.disconnected': 'CDP 断开',
    'cdp.connectFailed': 'CDP 连接失败',
    'cdp.generating': 'AI 生成中...',
    'cdp.statusConnected': '✅ 已连接',
    'cdp.statusDisconnected': '❌ 未连接',

    // Language
    'menu.language': '切换语言 / Language',
    'menu.languageDesc.zh': '当前：中文',
    'menu.languageDesc.en': '当前：English',
    'msg.languageChanged': '🌐 语言已切换，部分界面将在下次操作时生效',
};

const en: Translations = {
    // Status bar
    'statusBar.sound': 'Sound',
    'statusBar.tooltip.sound': 'Sound Notification',
    'statusBar.tooltip.persistent': 'Persistent Alert',
    'statusBar.tooltip.enabled': 'Enabled',
    'statusBar.tooltip.disabled': 'Disabled',
    'statusBar.tooltip.clickToOpen': 'Click to open settings menu',

    // Settings menu
    'menu.title': '🔔 Antigravity Task Sound Settings',
    'menu.placeholder': 'Select an action...',
    'menu.soundOff': 'Disable Sound Notification',
    'menu.soundOn': 'Enable Sound Notification',
    'menu.currentOn': 'Enabled',
    'menu.currentOff': 'Disabled',
    'menu.persistentOff': 'Disable Persistent Alert',
    'menu.persistentOn': 'Enable Persistent Alert',
    'menu.persistentDesc.on': 'Enabled (loops until confirmed)',
    'menu.persistentDesc.off': 'Disabled (plays once)',
    'menu.testPlay': 'Test Sound',
    'menu.testPlayDesc': 'Play current notification sound',
    'menu.switchSound': 'Change Sound',
    'menu.defaultSound': 'Default sound',
    'menu.adjustVolume': 'Adjust Volume',
    'menu.cdpConnect': 'CDP Connection',

    // Messages
    'msg.soundEnabled': '🔔 Sound notification enabled',
    'msg.soundDisabled': '🔕 Sound notification disabled',
    'msg.persistentEnabled': '🔁 Persistent alert enabled (loops until confirmed)',
    'msg.persistentDisabled': '🔔 Persistent alert disabled (plays once)',
    'msg.cdpDisconnected': 'CDP disconnected',
    'msg.cdpConnected': '✅ CDP connected!',
    'msg.cdpFailed': '❌ CDP connection failed, see Output panel for details',
    'msg.soundChanged': '🎵 Sound changed to: ',
    'msg.volumeSet': '🔊 Volume set to ',
    'msg.taskComplete': '🔔 AI task completed!',
    'msg.taskCompleteDetail': 'Click OK to stop the alert sound',
    'msg.confirm': 'OK',

    // Sound picker
    'soundPicker.title': '🎵 Choose Notification Sound',
    'soundPicker.placeholder': 'Select a built-in sound or custom file',
    'soundPicker.default': 'Restore default sound',
    'soundPicker.defaultDesc': 'Gentle Chime (built-in default)',
    'soundPicker.customFile': 'Choose custom file...',
    'soundPicker.customFileDesc': 'Select a .wav file from your computer',
    'soundPicker.filter': 'Sound files',
    'soundPicker.dialogTitle': 'Select WAV Sound File',

    // Loop interval
    'menu.loopInterval': 'Loop Interval',
    'menu.loopIntervalDesc': 'Playback interval for persistent alert',
    'loopInterval.title': '🔁 Set Loop Interval',
    'loopInterval.placeholder': 'Select loop playback interval',
    'loopInterval.auto': 'Auto (match sound duration)',
    'loopInterval.autoDesc': 'Loop after sound finishes playing',
    'loopInterval.seconds': 's',
    'msg.loopIntervalSet': '🔁 Loop interval set to ',
    'msg.loopIntervalAuto': '🔁 Loop interval set to auto (matches sound duration)',
    'msg.soundDefault': '🎵 Default sound restored',

    // Volume picker
    'volume.title': '🔊 Adjust Volume',
    'volume.placeholder': 'Select volume level',
    'volume.20': 'Very quiet',
    'volume.40': 'Quiet',
    'volume.50': 'Medium (default)',
    'volume.70': 'Loud',
    'volume.100': 'Maximum',

    // CDP status
    'cdp.connected': 'CDP Connected',
    'cdp.disconnected': 'CDP Disconnected',
    'cdp.connectFailed': 'CDP Connection Failed',
    'cdp.generating': 'AI Generating...',
    'cdp.statusConnected': '✅ Connected',
    'cdp.statusDisconnected': '❌ Disconnected',

    // Language
    'menu.language': 'Language / 切换语言',
    'menu.languageDesc.zh': 'Current: 中文',
    'menu.languageDesc.en': 'Current: English',
    'msg.languageChanged': '🌐 Language changed. Some UI will update on next action.',
};

const translations: Record<Language, Translations> = {
    'zh-CN': zhCN,
    'en': en,
};

let currentLanguage: Language = 'zh-CN';

export function initLanguage(): void {
    const config = vscode.workspace.getConfiguration('antigravityTaskSound');
    currentLanguage = config.get<string>('language', 'zh-CN') as Language;
    if (!translations[currentLanguage]) {
        currentLanguage = 'zh-CN';
    }
}

export function setLanguage(lang: Language): void {
    currentLanguage = lang;
}

export function getLanguage(): Language {
    return currentLanguage;
}

export function t(key: string): string {
    return translations[currentLanguage]?.[key] || translations['zh-CN']?.[key] || key;
}
