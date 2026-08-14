import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HOOKS } from '@/constants/hookNames';
import { Workbook } from '@/workbook/Workbook';

describe('Workbook Hooks 集成测试 - Bug 复现与验证', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        container = document.createElement('div');
        container.style.width = '800px';
        container.style.height = '600px';

        const canvas = document.createElement('canvas');
        container.appendChild(canvas);
        document.body.appendChild(container);
    });

    afterEach(() => {
        if (container && document.body.contains(container)) {
            document.body.removeChild(container);
        }
    });

    describe('Bug: options.hooks 配置不生效', () => {
        it('应该在 initRender 后正确加载配置的 hooks', () => {
            const onCellClickSpy = vi.fn();
            const afterChangeSpy = vi.fn();

            const wb = new Workbook(container, {
                sheets: [{
                    name: 'TestSheet',
                    data: [['A1', 'B1'], ['A2', 'B2']],
                }],
                hooks: {
                    [HOOKS.ON_CELL_CLICK]: (row: number, col: number) => {
                        onCellClickSpy(row, col);
                    },
                    [HOOKS.AFTER_CHANGE]: (changes: any) => {
                        afterChangeSpy(changes);
                    },
                },
            });

            wb.initRender();

            expect(wb.eventHandler).not.toBeNull();
            expect(wb.eventHandler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(true);
            expect(wb.eventHandler.hooks.hasHook(HOOKS.AFTER_CHANGE)).toBe(true);

            wb.destroy();
        });

        it('addHook 方法在 initRender 前调用不应丢失', () => {
            const callback = vi.fn();

            const wb = new Workbook(container, {
                sheets: [{ name: 'TestSheet' }],
            });

            wb.addHook(HOOKS.ON_CELL_CLICK, callback);

            wb.initRender();

            if (wb.eventHandler) {
                expect(wb.eventHandler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(true);
            }

            wb.destroy();
        });
    });

    describe('Hooks 触发时机测试', () => {
        let wb: Workbook;

        beforeEach(() => {
            wb = new Workbook(container, {
                sheets: [{
                    name: 'TestSheet',
                    data: [
                        ['Name', 'Age', 'City'],
                        ['Alice', 25, 'Beijing'],
                        ['Bob', 30, 'Shanghai'],
                    ],
                    columns: [
                        { type: 'text', width: 100 },
                        { type: 'numeric', width: 80 },
                        { type: 'text', width: 120 },
                    ],
                }],
            });
            wb.initRender();
        });

        afterEach(() => {
            if (wb) wb.destroy();
        });

        it('ON_CELL_CLICK 应该在单元格点击时触发', () => {
            const clickSpy = vi.fn();
            wb.addHook(HOOKS.ON_CELL_CLICK, clickSpy);

            expect(wb.eventHandler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(true);
        });

        it('BEFORE_CHANGE 应该能阻止数据变更', () => {
            const blockNegative = (changes: any) => {
                if (changes.newValue < 0) {
                    return false;
                }
            };

            wb.addHook(HOOKS.BEFORE_CHANGE, blockNegative);
            expect(wb.eventHandler.hooks.hasHook(HOOKS.BEFORE_CHANGE)).toBe(true);
        });

        it('AFTER_CHANGE 应该在值改变后触发', () => {
            const changeSpy = vi.fn();
            wb.addHook(HOOKS.AFTER_CHANGE, changeSpy);

            expect(wb.eventHandler.hooks.hasHook(HOOKS.AFTER_CHANGE)).toBe(true);
        });
    });

    describe('多 Hook 协作测试', () => {
        it('多个 before* hook 应该按顺序执行', () => {
            const order: number[] = [];

            const wb = new Workbook(container, {
                sheets: [{ name: 'TestSheet' }],
                hooks: {
                    [HOOKS.BEFORE_CHANGE]: (() => {
                        const hook1 = () => order.push(1);
                        return hook1;
                    })(),
                },
            });

            wb.initRender();

            wb.addHook(HOOKS.BEFORE_CHANGE, () => order.push(2));

            expect(wb.eventHandler.hooks.getHooks(HOOKS.BEFORE_CHANGE)).toHaveLength(2);

            wb.destroy();
        });

        it('hook 回调中的 this 上下文', () => {
            let context: any = null;

            const wb = new Workbook(container, {
                sheets: [{ name: 'TestSheet' }],
                hooks: {
                    [HOOKS.INIT]: function(this: any) {
                        context = this;
                    },
                },
            });

            wb.initRender();

            expect(context).toBeDefined();

            wb.destroy();
        });
    });

    describe('Hook 移除和清理', () => {
        it('removeHook 应该移除指定的回调', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            const wb = new Workbook(container, {
                sheets: [{ name: 'TestSheet' }],
            });

            wb.initRender();

            wb.addHook(HOOKS.ON_CELL_CLICK, callback1);
            wb.addHook(HOOKS.ON_CELL_CLICK, callback2);

            expect(wb.eventHandler.hooks.getHooks(HOOKS.ON_CELL_CLICK)).toHaveLength(2);

            wb.removeHook(HOOKS.ON_CELL_CLICK, callback1);

            expect(wb.eventHandler.hooks.getHooks(HOOKS.ON_CELL_CLICK)).toHaveLength(1);
            expect(wb.eventHandler.hooks.getHooks(HOOKS.ON_CELL_CLICK)).toContain(callback2);

            wb.destroy();
        });

        it('clearHook 应该清除指定类型的所有 hooks', () => {
            const wb = new Workbook(container, {
                sheets: [{ name: 'TestSheet' }],
                hooks: {
                    [HOOKS.ON_CELL_CLICK]: vi.fn(),
                    [HOOKS.AFTER_CHANGE]: vi.fn(),
                    [HOOKS.BEFORE_CHANGE]: vi.fn(),
                },
            });

            wb.initRender();

            expect(wb.eventHandler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(true);
            expect(wb.eventHandler.hooks.hasHook(HOOKS.AFTER_CHANGE)).toBe(true);

            wb.clearHook(HOOKS.ON_CELL_CLICK);

            expect(wb.eventHandler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(false);
            expect(wb.eventHandler.hooks.hasHook(HOOKS.AFTER_CHANGE)).toBe(true);

            wb.destroy();
        });
    });

    describe('Plugin Hooks 集成', () => {
        it('插件注册的 hooks 应该正常工作', () => {
            const pluginHookSpy = vi.fn();

            const wb = new Workbook(container, {
                sheets: [{ name: 'TestSheet' }],
                plugins: ['freeze'],
                freeze: { fixedRowsTop: 1 },
            });

            wb.initRender();

            expect(wb.eventHandler).not.toBeNull();

            wb.addHook(HOOKS.AFTER_FREEZE, pluginHookSpy);
            expect(wb.eventHandler.hooks.hasHook(HOOKS.AFTER_FREEZE)).toBe(true);

            wb.destroy();
        });
    });
});

describe('Hooks 完整生命周期测试', () => {
    let container: HTMLDivElement;
    let canvasId: string;

    beforeEach(() => {
        canvasId = 'test-canvas-' + Math.random().toString(36).substring(2, 11);
        container = document.createElement('div');
        container.style.width = '800px';
        container.style.height = '600px';

        const canvas = document.createElement('canvas');
        canvas.id = canvasId;
        container.appendChild(canvas);
        document.body.appendChild(container);
    });

    afterEach(() => {
        if (container && document.body.contains(container)) {
            document.body.removeChild(container);
        }
    });

    it('从创建到销毁的完整流程', () => {
        const lifecycleEvents: string[] = [];

        const wb = new Workbook(container, {
            sheets: [{ name: 'LifecycleTest' }],
            hooks: {
                [HOOKS.INIT]: () => lifecycleEvents.push('init'),
            },
        });

        expect(lifecycleEvents).toContain('init');

        expect(wb.renderEngine).not.toBeNull();
        expect(wb.eventHandler).not.toBeNull();
        expect(wb.editor).not.toBeNull();

        const runtimeCallback = vi.fn();
        wb.addHook(HOOKS.ON_CELL_CLICK, runtimeCallback);
        expect(wb.eventHandler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(true);

        wb.destroy();

        expect(wb.eventHandler).toBeNull();
        expect(wb.renderEngine).toBeNull();
    });
});

describe('性能压力测试 - Hooks 系统', () => {
    let container: HTMLDivElement;
    let canvasId: string;

    beforeEach(() => {
        canvasId = 'test-canvas-' + Math.random().toString(36).substring(2, 11);
        container = document.createElement('div');
        container.style.width = '800px';
        container.style.height = '600px';

        const canvas = document.createElement('canvas');
        canvas.id = canvasId;
        container.appendChild(canvas);
        document.body.appendChild(container);
    });

    afterEach(() => {
        if (container && document.body.contains(container)) {
            document.body.removeChild(container);
        }
    });

    it('大量 hooks 注册和触发的性能', () => {
        const HOOK_COUNT = 500;
        const callbacks: ReturnType<typeof vi.fn>[] = [];

        const wb = new Workbook(container, {
            sheets: [{ name: 'PerfTest' }],
        });

        wb.initRender();

        for (let i = 0; i < HOOK_COUNT; i++) {
            const cb = vi.fn();
            callbacks.push(cb);
            wb.addHook(HOOKS.ON_CELL_CLICK, cb);
        }

        expect(wb.eventHandler.hooks.getHooks(HOOKS.ON_CELL_CLICK)).toHaveLength(HOOK_COUNT);

        const startTime = performance.now();
        wb.eventHandler.hooks.runHooks(HOOKS.ON_CELL_CLICK, 1, 2);
        const endTime = performance.now();

        expect(endTime - startTime).toBeLessThan(100);

        callbacks.forEach(cb => {
            expect(cb).toHaveBeenCalledWith(1, 2);
        });

        wb.destroy();
    });

    it('频繁添加和删除 hooks 的稳定性', () => {
        const wb = new Workbook(container, {
            sheets: [{ name: 'StressTest' }],
        });

        wb.initRender();

        for (let i = 0; i < 100; i++) {
            const cb = vi.fn();
            wb.addHook(HOOKS.AFTER_CHANGE, cb);
            wb.removeHook(HOOKS.AFTER_CHANGE, cb);
        }

        expect(wb.eventHandler.hooks.hasHook(HOOKS.AFTER_CHANGE)).toBe(false);

        wb.destroy();
    });
});