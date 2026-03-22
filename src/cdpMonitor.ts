import * as http from 'http';
import * as vscode from 'vscode';
import WebSocket from 'ws';
import { t } from './i18n';

/**
 * CDP (Chrome DevTools Protocol) 监控器
 * 通过 WebSocket 连接 Antigravity 的调试端口，监听 AI 回复状态
 */

// ============================================================
// 综合检测脚本：停止按钮 + 交互式提示框（如 "Run command?"）
// Combined detection script: Stop button + interactive prompt boxes
// 借鉴 Remoat 的方案，并扩展为多类型提示框识别
// ============================================================
const DETECTION_SCRIPT = `(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    const scopes = [panel, document].filter(Boolean);

    // ---- 工具函数：判断元素是否可见 ----
    // Utility: check if an element is visible on screen
    const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };

    // ---- 文本规范化函数 ----
    // Normalize text: lowercase, collapse whitespace, trim
    const normalize = (value) => (value || '').toLowerCase().replace(/\\\\s+/g, ' ').trim();

    // ---- 提取按钮的所有可识别标签文本 ----
    // Extract all recognizable label texts from a button element
    const getLabels = (btn) => [
        btn.textContent || '',
        btn.getAttribute('aria-label') || '',
        btn.getAttribute('title') || '',
    ];

    // ============================================================
    // 第一部分：停止按钮检测（isGenerating）
    // Part 1: Stop button detection
    // ============================================================
    let isGenerating = false;

    // 方法1: tooltip-id 精确检测（需可见）
    for (const scope of scopes) {
        const el = scope.querySelector('[data-tooltip-id="input-send-button-cancel-tooltip"]');
        if (el && isVisible(el)) { isGenerating = true; break; }
    }

    // 方法2: 按钮文本模式匹配（需可见）
    if (!isGenerating) {
        const STOP_PATTERNS = [/^stop$/, /^stop generating$/, /^stop response$/, /^停止$/];
        const isStopLabel = (value) => {
            const n = normalize(value);
            return n ? STOP_PATTERNS.some((re) => re.test(n)) : false;
        };
        for (const scope of scopes) {
            const buttons = scope.querySelectorAll('button, [role="button"]');
            for (let i = 0; i < buttons.length; i++) {
                const btn = buttons[i];
                if (!isVisible(btn)) continue;
                if (getLabels(btn).some(isStopLabel)) { isGenerating = true; break; }
            }
            if (isGenerating) break;
        }
    }

    // ============================================================
    // 第二部分：交互式提示框检测（hasPrompt）
    // Part 2: Interactive prompt/dialog detection
    // 提示框的内容可能会变化，因此不依赖固定的文本，
    // 而是通过按钮上的操作性关键词进行启发式匹配。
    // ============================================================
    let hasPrompt = false;

    // 提示框动作按钮的特征正则（覆盖中英文常见操作词）
    // Heuristic patterns for action buttons typically found in prompt dialogs
    const PROMPT_ACTION_PATTERNS = [
        /^reject$/,                  // "Reject" 按钮
        /^run\\b/,                    // "Run" / "Run Alt+↵" 等
        /^allow/,                    // "Allow" 按钮
        /^deny/,                     // "Deny" 按钮
        /^cancel$/,                  // "Cancel" 按钮（独立出现时）
        /^拒绝$/,                    // 中文 "拒绝"
        /^运行/,                     // 中文 "运行"
        /^允许/,                     // 中文 "允许"
        /^执行/,                     // 中文 "执行"
    ];

    // 辅助文本特征：这些文本通常伴随提示框一起出现
    // Auxiliary text patterns that accompany prompt dialogs
    const PROMPT_CONTEXT_PATTERNS = [
        /ask every time/i,           // "Ask every time" 复选框/链接
        /每次询问/i,                 // 中文对应
        /run command/i,              // "Run command?" 提示文本
        /执行命令/i,                 // 中文对应
        /waiting/i,                  // "Waiting.." 状态文本
    ];

    const isPromptAction = (value) => {
        const n = normalize(value);
        return n ? PROMPT_ACTION_PATTERNS.some((re) => re.test(n)) : false;
    };

    // 在每个作用域中扫描可见的按钮，检查是否存在提示框特征
    // Scan visible buttons in each scope for prompt-like action labels
    for (const scope of scopes) {
        if (hasPrompt) break;
        const buttons = scope.querySelectorAll('button, [role="button"]');
        let rejectFound = false;
        let runFound = false;
        for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            if (!isVisible(btn)) continue;
            const labels = getLabels(btn);
            for (const label of labels) {
                const n = normalize(label);
                if (!n) continue;
                // 同时存在 Reject 和 Run 类按钮 → 高置信度判定为提示框
                if (/^reject$/.test(n) || /^拒绝$/.test(n)) rejectFound = true;
                if (/^run\\b/.test(n) || /^运行/.test(n) || /^执行/.test(n) || /^allow/.test(n) || /^允许/.test(n)) runFound = true;
            }
        }
        // 同时存在拒绝和执行按钮 → 确认为提示框
        // Both reject and action buttons present → confirmed prompt dialog
        if (rejectFound && runFound) { hasPrompt = true; }
    }

    // 降级检测：如果按钮组合未命中，检查是否存在辅助文本特征
    // Fallback: check for auxiliary context text if button combo didn't match
    if (!hasPrompt) {
        for (const scope of scopes) {
            if (hasPrompt) break;
            // 查找所有文本节点中是否包含提示框的上下文关键词
            const allText = scope.innerText || scope.textContent || '';
            const hasContextText = PROMPT_CONTEXT_PATTERNS.some((re) => re.test(allText));
            if (hasContextText) {
                // 再确认是否同时存在至少一个提示框动作按钮
                const buttons = scope.querySelectorAll('button, [role="button"]');
                for (let i = 0; i < buttons.length; i++) {
                    const btn = buttons[i];
                    if (!isVisible(btn)) continue;
                    if (getLabels(btn).some(isPromptAction)) {
                        hasPrompt = true;
                        break;
                    }
                }
            }
        }
    }

    // ============================================================
    // 第三检测路径：检测 "Waiting." / "Waiting.." / "Waiting..." 动画文本
    // Path 3: Detect animated "Waiting." text (dots cycle: '.', '..', '...')
    // 这是一个独立的强信号，出现即代表 AI 正在等待用户操作
    // ============================================================
    if (!hasPrompt) {
        // 匹配 "Waiting" 后跟 1~3 个点（    覆盖动画的所有帧）
        // Match "Waiting" followed by 1-3 dots (covers all animation frames)
        const WAITING_PATTERN = /\\bwaiting\\.{1,3}$/i;
        // 中文对应："等待中." / "等待中.." / "等待中..."
        const WAITING_PATTERN_ZH = /等待中\\.{1,3}$/;
        for (const scope of scopes) {
            if (hasPrompt) break;
            // 遍历所有可能包含 "Waiting." 文本的元素
            // Scan elements that might contain the "Waiting." text
            const candidates = scope.querySelectorAll('span, p, div, label, [class*="status"], [class*="waiting"]');
            for (let i = 0; i < candidates.length; i++) {
                const el = candidates[i];
                if (!isVisible(el)) continue;
                const txt = (el.textContent || '').trim();
                if (txt.length > 30) continue; // 排除长文本，"Waiting." 通常很短
                if (WAITING_PATTERN.test(txt) || WAITING_PATTERN_ZH.test(txt)) {
                    hasPrompt = true;
                    break;
                }
            }
        }
    }

    return { isGenerating: isGenerating, hasPrompt: hasPrompt };
})()`;

interface CdpTarget {
    id: string;
    title: string;
    type: string;
    url?: string;
    webSocketDebuggerUrl: string;
}

export class CdpMonitor {
    private ws: any = null;
    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private isRunning = false;
    private messageId = 1;
    private pendingCallbacks = new Map<number, (result: any) => void>();
    private generationStarted = false;
    private stopGoneCount = 0;
    private readonly stopGoneConfirmCount = 3;
    private readonly pollIntervalMs = 2000;
    // 提示框状态标志：用于边缘触发，仅在提示框首次出现时通知
    // Prompt state flag: edge-triggered, fires only on rising edge
    private promptActive = false;
    private port: number;
    private onComplete: (() => void) | null = null;
    private statusBarItem: vscode.StatusBarItem | null = null;
    private outputChannel: vscode.OutputChannel;
    private connectionAttempts = 0;
    private readonly maxReconnectAttempts = 5;
    private windowTitle: string;

    constructor(port: number, onComplete: () => void, outputChannel: vscode.OutputChannel, windowTitle: string = '') {
        this.port = port;
        this.onComplete = onComplete;
        this.outputChannel = outputChannel;
        this.windowTitle = windowTitle;
    }

 


    setStatusBar(item: vscode.StatusBarItem) {
        this.statusBarItem = item;
    }

    private log(message: string) {
        console.log(`[TaskSound:CDP] ${message}`);
        this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
    }

    private error(message: string, err?: any) {
        console.error(`[TaskSound:CDP] ${message}`, err || '');
        this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ERROR: ${message} ${err ? (err.message || err.toString()) : ''}`);
    }

    updatePort(port: number) {
        this.log(`Updating port from ${this.port} to ${port}`);
        this.port = port;
        if (this.isRunning) {
            this.disconnect();
            this.connect();
        }
    }

    async connect(): Promise<boolean> {
        try {
            this.log(`Connecting to CDP on port ${this.port}...`);
            const targets = await this.getTargets();
            if (!targets || targets.length === 0) {
                this.error('No debug targets found.');
                return false;
            }

            this.log(`Found ${targets.length} targets.`);
            targets.forEach((t: CdpTarget, i: number) => {
                this.log(`  [${i}] ${t.type} | title: ${t.title || 'N/A'} | url: ${t.url || 'N/A'}`);
            });

            // 多窗口支持：优先匹配当前窗口标题对应的 target
            const isValidTarget = (t: CdpTarget) =>
                t.type === 'page' &&
                !t.url?.includes('jetski') &&
                !t.title.includes('Launchpad');

            let target: CdpTarget | undefined;

            // 第一优先：匹配当前窗口标题的 workbench.html target
            if (this.windowTitle) {
                this.log(`Searching for target matching window title: "${this.windowTitle}"`);
                target = targets.find(
                    (t: CdpTarget) => isValidTarget(t) &&
                        t.url?.includes('workbench.html') &&
                        t.title.includes(this.windowTitle)
                );
                // 备选：匹配标题但不限 workbench.html
                if (!target) {
                    target = targets.find(
                        (t: CdpTarget) => isValidTarget(t) &&
                            t.title.includes(this.windowTitle)
                    );
                }
                if (target) {
                    this.log(`Matched target by window title: "${target.title}"`);
                }
            }

            // 降级：原先逻辑（单窗口场景）
            if (!target) {
                this.log('No window-specific target found, using fallback selection.');
                target = targets.find(
                    (t: CdpTarget) => isValidTarget(t) && t.url?.includes('workbench.html')
                ) || targets.find(
                    (t: CdpTarget) => isValidTarget(t)
                ) || targets.find((t: CdpTarget) => t.type === 'page') || targets[0];
            }

            if (!target?.webSocketDebuggerUrl) {
                this.error('No WebSocket URL found in selected target.');
                return false;
            }

            this.log(`Selected target: ${target.url || target.id}`);
            this.log(`WebSocket URL: ${target.webSocketDebuggerUrl}`);

            this.ws = new WebSocket(target.webSocketDebuggerUrl);

            return new Promise<boolean>((resolve) => {
                const timeout = setTimeout(() => {
                    this.error('WebSocket connection timeout');
                    resolve(false);
                }, 5000);

                this.ws.on('open', () => {
                    clearTimeout(timeout);
                    this.log('WebSocket Connected successfully!');
                    this.isRunning = true;
                    this.connectionAttempts = 0;
                    this.updateStatusText(`$(bell) ${t('cdp.connected')}`);
                    this.startPolling();
                    resolve(true);
                });

                this.ws.on('message', (data: string) => {
                    try {
                        const msg = JSON.parse(data.toString());
                        if (msg.id && this.pendingCallbacks.has(msg.id)) {
                            const cb = this.pendingCallbacks.get(msg.id)!;
                            this.pendingCallbacks.delete(msg.id);
                            cb(msg.result);
                        }
                    } catch { /* ignore parse errors */ }
                });

                this.ws.on('close', () => {
                    this.log('WebSocket Disconnected');
                    this.isRunning = false;
                    this.updateStatusText(`$(bell-slash) ${t('cdp.disconnected')}`);
                    this.scheduleReconnect();
                });

                this.ws.on('error', (err: Error) => {
                    this.error('WebSocket Error', err);
                    clearTimeout(timeout);
                    resolve(false);
                });
            });
        } catch (err) {
            this.error('Connect failed', err);
            return false;
        }
    }

    disconnect() {
        this.log('Disconnecting from CDP...');
        this.isRunning = false;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            try { this.ws.close(); } catch { /* ignore */ }
            this.ws = null;
        }
        this.pendingCallbacks.clear();
    }

    isConnected(): boolean {
        return this.isRunning && this.ws?.readyState === 1;
    }

    private updateStatusText(text: string) {
        if (this.statusBarItem) {
            this.statusBarItem.text = text;
        }
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.connectionAttempts++;
        if (this.connectionAttempts > this.maxReconnectAttempts) {
            this.log('Max reconnect attempts reached. Will stop retrying automatically.');
            this.updateStatusText(`$(bell-slash) ${t('cdp.connectFailed')}`);
            return;
        }
        const delay = Math.min(5000 * this.connectionAttempts, 30000);
        this.log(`Reconnecting in ${delay}ms (attempt ${this.connectionAttempts})...`);
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            await this.connect();
        }, delay);
    }

    private getTargets(): Promise<CdpTarget[] | null> {
        return new Promise((resolve) => {
            const options = {
                hostname: '127.0.0.1',
                port: this.port,
                path: '/json/list',
                method: 'GET',
                family: 4 // Force IPv4
            };

            this.log(`Fetching targets from ${options.hostname}:${options.port}...`);
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk: string) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        this.log(`HTTP status ${res.statusCode} from CDP endpoint`);
                        resolve(null);
                        return;
                    }
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        this.error('Failed to parse CDP targets JSON', e);
                        resolve(null);
                    }
                });
            });
            req.on('error', (e) => {
                this.error('HTTP request to CDP failed', e);
                resolve(null);
            });
            req.setTimeout(3000, () => {
                this.error('HTTP request to CDP timed out');
                req.destroy();
                resolve(null);
            });
            req.end();
        });
    }

    private sendCommand(method: string, params: Record<string, any> = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== 1) {
                reject(new Error('WebSocket not connected'));
                return;
            }
            const id = this.messageId++;
            const timeout = setTimeout(() => {
                this.pendingCallbacks.delete(id);
                // Do not log routine timeouts to avoid spam
                reject(new Error('CDP command timeout'));
            }, 5000);

            this.pendingCallbacks.set(id, (result) => {
                clearTimeout(timeout);
                resolve(result);
            });

            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    private startPolling() {
        if (!this.isRunning) return;
        this.pollTimer = setTimeout(async () => {
            await this.poll();
            if (this.isRunning) {
                this.startPolling();
            }
        }, this.pollIntervalMs);
    }

    private async poll() {
        try {
            // 使用综合检测脚本，同时获取 isGenerating 和 hasPrompt 状态
            // Execute combined detection script to get both states
            const result = await this.sendCommand('Runtime.evaluate', {
                expression: DETECTION_SCRIPT,
                returnByValue: true,
            });

            const value = result?.result?.value;
            const isGenerating = value?.isGenerating === true;
            const hasPrompt = value?.hasPrompt === true;

            // ---- 处理停止按钮状态（AI 正在生成 → 生成完毕）----
            // Handle stop button state transitions (generating → complete)
            if (isGenerating) {
                if (!this.generationStarted) {
                    this.generationStarted = true;
                    this.log('AI generation started');
                    this.updateStatusText(`$(loading~spin) ${t('cdp.generating')}`);
                }
                this.stopGoneCount = 0;
            } else if (this.generationStarted) {
                this.stopGoneCount++;
                if (this.stopGoneCount >= this.stopGoneConfirmCount) {
                    this.log('AI response complete!');
                    this.generationStarted = false;
                    this.stopGoneCount = 0;
                    this.updateStatusText(`$(bell) ${t('cdp.connected')}`);

                    if (this.onComplete) {
                        this.onComplete();
                    }
                }
            }

            // ---- 处理提示框状态（边缘触发：仅在首次出现时通知）----
            // Handle prompt state with edge detection: notify only on rising edge
            if (hasPrompt && !this.promptActive) {
                // 提示框首次出现 → 触发通知
                // Prompt just appeared → fire notification
                this.promptActive = true;
                this.log('Interactive prompt detected! (e.g. Run command / Allow / etc.)');
                this.updateStatusText(`$(bell-dot) ${t('cdp.promptDetected')}`);
                if (this.onComplete) {
                    this.onComplete();
                }
            } else if (!hasPrompt && this.promptActive) {
                // 提示框已消失 → 重置状态，为下次检测做好准备
                // Prompt dismissed → reset state for next detection
                this.promptActive = false;
                this.log('Prompt dismissed, state reset.');
                if (this.isRunning) {
                    if (isGenerating) {
                        // 用户处理完提示框后 AI 仍在生成 → 恢复为 "AI 生成中" 状态
                        // AI is still generating after prompt dismissed → restore generating status
                        this.updateStatusText(`$(loading~spin) ${t('cdp.generating')}`);
                    } else {
                        // AI 未在生成 → 恢复为空闲已连接状态
                        // AI is idle → restore to connected status
                        this.updateStatusText(`$(bell) ${t('cdp.connected')}`);
                    }
                }
            }
        } catch (err) {
            // CDP 偶尔命令超时是正常的，不输出大段错误
            // Occasional CDP command timeouts are normal, suppress verbose logs
        }
    }
}

