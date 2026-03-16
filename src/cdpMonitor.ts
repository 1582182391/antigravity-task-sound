import * as http from 'http';
import * as vscode from 'vscode';

declare const console: any;

/**
 * CDP (Chrome DevTools Protocol) 监控器
 * 通过 WebSocket 连接 Antigravity 的调试端口，监听 AI 回复状态
 */

// 停止按钮检测脚本（借鉴 Remoat 的方案）
const STOP_BUTTON_SCRIPT = `(() => {
    const panel = document.querySelector('.antigravity-agent-side-panel');
    const scopes = [panel, document].filter(Boolean);

    const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };

    // 方法1: tooltip-id 检测（需可见）
    for (const scope of scopes) {
        const el = scope.querySelector('[data-tooltip-id="input-send-button-cancel-tooltip"]');
        if (el && isVisible(el)) return { isGenerating: true };
    }

    // 方法2: 按钮文本检测（需可见）
    const normalize = (value) => (value || '').toLowerCase().replace(/\\\\s+/g, ' ').trim();
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
            const labels = [
                btn.textContent || '',
                btn.getAttribute('aria-label') || '',
                btn.getAttribute('title') || '',
            ];
            if (labels.some(isStopLabel)) return { isGenerating: true };
        }
    }

    return { isGenerating: false };
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
    private port: number;
    private onComplete: (() => void) | null = null;
    private statusBarItem: vscode.StatusBarItem | null = null;
    private connectionAttempts = 0;
    private readonly maxReconnectAttempts = 5;

    constructor(port: number, onComplete: () => void) {
        this.port = port;
        this.onComplete = onComplete;
    }

    setStatusBar(item: vscode.StatusBarItem) {
        this.statusBarItem = item;
    }

    updatePort(port: number) {
        this.port = port;
        if (this.isRunning) {
            this.disconnect();
            this.connect();
        }
    }

    async connect(): Promise<boolean> {
        try {
            const targets = await this.getTargets();
            if (!targets || targets.length === 0) {
                console.log('[TaskSound:CDP] No debug targets found');
                return false;
            }

            const target = targets.find(
                (t: CdpTarget) => t.type === 'page' && (
                    (t.url?.includes('workbench.html') && !t.url?.includes('jetski'))
                )
            ) || targets.find(
                (t: CdpTarget) => t.type === 'page' && (
                    t.title.includes('Antigravity') &&
                    !t.title.includes('Launchpad')
                )
            ) || targets.find((t: CdpTarget) => t.type === 'page') || targets[0];

            if (!target?.webSocketDebuggerUrl) {
                console.log('[TaskSound:CDP] No WebSocket URL found');
                return false;
            }

            const WebSocket = require('ws');
            this.ws = new WebSocket(target.webSocketDebuggerUrl);

            return new Promise<boolean>((resolve) => {
                const timeout = setTimeout(() => {
                    resolve(false);
                }, 5000);

                this.ws.on('open', () => {
                    clearTimeout(timeout);
                    console.log('[TaskSound:CDP] Connected!');
                    this.isRunning = true;
                    this.connectionAttempts = 0;
                    this.updateStatusText('$(bell) CDP 已连接');
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
                    console.log('[TaskSound:CDP] Disconnected');
                    this.isRunning = false;
                    this.updateStatusText('$(bell-slash) CDP 断开');
                    this.scheduleReconnect();
                });

                this.ws.on('error', (err: Error) => {
                    console.error('[TaskSound:CDP] Error:', err.message);
                    clearTimeout(timeout);
                    resolve(false);
                });
            });
        } catch (err) {
            console.error('[TaskSound:CDP] Connect failed:', err);
            return false;
        }
    }

    disconnect() {
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
            console.log('[TaskSound:CDP] Max reconnect attempts reached');
            this.updateStatusText('$(bell-slash) CDP 连接失败');
            return;
        }
        const delay = Math.min(5000 * this.connectionAttempts, 30000);
        console.log(`[TaskSound:CDP] Reconnecting in ${delay}ms (attempt ${this.connectionAttempts})`);
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            await this.connect();
        }, delay);
    }

    private getTargets(): Promise<CdpTarget[] | null> {
        return new Promise((resolve) => {
            const req = http.get(`http://127.0.0.1:${this.port}/json/list`, (res) => {
                let data = '';
                res.on('data', (chunk: string) => { data += chunk; });
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve(null);
                    }
                });
            });
            req.on('error', () => resolve(null));
            req.setTimeout(3000, () => { req.destroy(); resolve(null); });
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
            const result = await this.sendCommand('Runtime.evaluate', {
                expression: STOP_BUTTON_SCRIPT,
                returnByValue: true,
            });

            const value = result?.result?.value;
            const isGenerating = value?.isGenerating === true;

            if (isGenerating) {
                // AI 正在生成
                if (!this.generationStarted) {
                    this.generationStarted = true;
                    console.log('[TaskSound:CDP] AI generation started');
                    this.updateStatusText('$(loading~spin) AI 生成中...');
                }
                this.stopGoneCount = 0;
            } else if (this.generationStarted) {
                // 停止按钮消失了
                this.stopGoneCount++;
                if (this.stopGoneCount >= this.stopGoneConfirmCount) {
                    // 确认：AI 回复完成！
                    console.log('[TaskSound:CDP] AI response complete!');
                    this.generationStarted = false;
                    this.stopGoneCount = 0;
                    this.updateStatusText('$(bell) CDP 已连接');

                    // 触发回调
                    if (this.onComplete) {
                        this.onComplete();
                    }
                }
            }
        } catch (err) {
            console.error('[TaskSound:CDP] Poll error:', err);
        }
    }
}
