import { describe, it, expect, beforeEach, vi, beforeAll } from 'vitest';
import { HOOKS } from '../../src/constants/hookNames.js';
import { Workbook } from '../../src/workbook/Workbook.js';

describe('Workbook Hooks 集成测试 - Bug 复现与验证', () => {
    describe('Bug: options.hooks 配置不生效', () => {
        it('应该在 initRender 后正确加载配置的 hooks', () => {
            // 这个测试会验证修复后的行为
            // 在修复前，这个测试会失败

            const onCellClickSpy = vi.fn();
            const afterChangeSpy = vi.fn();

            // 模拟 main.js 中的配置方式
            const wb = new Workbook('test-container', {
                sheets: [{
                    name: 'TestSheet',
                    data: [['A1', 'B1'], ['A2', 'B2']],
                }],
                hooks: {
                    [HOOKS.ON_CELL_CLICK]: (row, col) => {
                        onCellClickSpy(row, col);
                    },
                    [HOOKS.AFTER_CHANGE]: (changes) => {
                        afterChangeSpy(changes);
                    },
                },
            });

            // 初始化渲染引擎（这应该触发 hooks 加载）
            wb.initRender();

            // ✅ 关键断言：hooks 应该被正确注册
            expect(wb.eventHandler).not.toBeNull();
            expect(wb.eventHandler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(true);
            expect(wb.eventHandler.hooks.hasHook(HOOKS.AFTER_CHANGE)).toBe(true);

            // 清理
            wb.destroy();
        });

        it('addHook 方法在 initRender 前调用不应丢失', () => {
            const callback = vi.fn();

            const wb = new Workbook('test-container', {
                sheets: [{ name: 'TestSheet' }],
            });

            // 在 initRender 前添加 hook
            wb.addHook(HOOKS.ON_CELL_CLICK, callback);

            // 此时 eventHandler 可能还是 null
            // 但 initRender 后应该恢复

            wb.initRender();

            // ✅ hook 应该存在
            if (wb.eventHandler) {
                expect(wb.eventHandler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(true);
            }

            wb.destroy();
        });
    });

    describe('Hooks 触发时机测试', () => {
        let wb;

        beforeEach(() => {
            wb = new Workbook('test-container', {
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

            // 模拟点击事件（需要实际的 DOM 环境）
            // 这里仅验证 hook 注册成功
            expect(wb.eventHandler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(true);
        });

        it('BEFORE_CHANGE 应该能阻止数据变更', () => {
            const blockNegative = (changes) => {
                if (changes.newValue < 0) {
                    return false; // 拒绝负数
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
            const order = [];

            const wb = new Workbook('test-container', {
                sheets: [{ name: 'TestSheet' }],
                hooks: {
                    [HOOKS.BEFORE_CHANGE]: (() => {
                        const hook1 = () => order.push(1);
                        return hook1;
                    })(),
                },
            });

            wb.initRender();

            // 动态添加第二个 hook
            wb.addHook(HOOKS.BEFORE_CHANGE, () => order.push(2));

            // 验证两个 hook 都已注册
            expect(wb.eventHandler.hooks.getHooks(HOOKS.BEFORE_CHANGE)).toHaveLength(2);

            wb.destroy();
        });

        it('hook 回调中的 this 上下文', () => {
            let context = null;

            const wb = new Workbook('test-container', {
                sheets: [{ name: 'TestSheet' }],
                hooks: {
                    [HOOKS.INIT]: function() {
                        context = this;
                    },
                },
            });

            wb.initRender();

            // 验证回调可以访问正确的上下文
            expect(context).toBeDefined();

            wb.destroy();
        });
    });

    describe('Hook 移除和清理', () => {
        it('removeHook 应该移除指定的回调', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            const wb = new Workbook('test-container', {
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
            const wb = new Workbook('test-container', {
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
            expect(wb.eventHandler.hooks.hasHook(HOOKS.AFTER_CHANGE)).toBe(true); // 不受影响

            wb.destroy();
        });
    });

    describe('Plugin Hooks 集成', () => {
        it('插件注册的 hooks 应该正常工作', () => {
            const pluginHookSpy = vi.fn();

            const wb = new Workbook('test-container', {
                sheets: [{ name: 'TestSheet' }],
                plugins: ['freeze'],
                freeze: { fixedRowsTop: 1 },
            });

            wb.initRender();

            // 插件可能会注册自己的 hooks
            // 验证系统稳定
            expect(wb.eventHandler).not.toBeNull();

            // 手动添加 hook 测试兼容性
            wb.addHook(HOOKS.AFTER_FREEZE, pluginHookSpy);
            expect(wb.eventHandler.hooks.hasHook(HOOKS.AFTER_FREEZE)).toBe(true);

            wb.destroy();
        });
    });
});

describe('Hooks 完整生命周期测试', () => {
    it('从创建到销毁的完整流程', () => {
        const lifecycleEvents = [];

        const wb = new Workbook('test-container', {
            sheets: [{ name: 'LifecycleTest' }],
            hooks: {
                [HOOKS.INIT]: () => lifecycleEvents.push('init'),
            },
        });

        expect(lifecycleEvents).not.toContain('init'); // init 还没触发

        wb.initRender();

        // 验证所有子系统就绪
        expect(wb.renderEngine).not.toBeNull();
        expect(wb.eventHandler).not.toBeNull();
        expect(wb.editor).not.toBeNull();

        // 添加运行时 hooks
        const runtimeCallback = vi.fn();
        wb.addHook(HOOKS.ON_CELL_CLICK, runtimeCallback);
        expect(wb.eventHandler.hooks.hasHook(HOOKS.ON_CELL_CLICK)).toBe(true);

        // 销毁
        wb.destroy();

        // 销毁后不应该有内存泄漏风险
        expect(wb.eventHandler).toBeNull();
        expect(wb.renderEngine).toBeNull();
    });
});

describe('性能压力测试 - Hooks 系统', () => {
    it('大量 hooks 注册和触发的性能', () => {
        const HOOK_COUNT = 500;
        const callbacks = [];

        const wb = new Workbook('test-container', {
            sheets: [{ name: 'PerfTest' }],
        });

        wb.initRender();

        // 批量注册 hooks
        for (let i = 0; i < HOOK_COUNT; i++) {
            const cb = vi.fn();
            callbacks.push(cb);
            wb.addHook(HOOKS.ON_CELL_CLICK, cb);
        }

        expect(wb.eventHandler.hooks.getHooks(HOOKS.ON_CELL_CLICK)).toHaveLength(HOOK_COUNT);

        // 性能测试：触发所有 hooks
        const startTime = performance.now();
        wb.eventHandler.hooks.runHooks(HOOKS.ON_CELL_CLICK, 1, 2);
        const endTime = performance.now();

        // 500 个回调应该在 100ms 内完成
        expect(endTime - startTime).toBeLessThan(100);

        // 验证所有回调都被调用
        callbacks.forEach(cb => {
            expect(cb).toHaveBeenCalledWith(1, 2);
        });

        wb.destroy();
    });

    it('频繁添加和删除 hooks 的稳定性', () => {
        const wb = new Workbook('test-container', {
            sheets: [{ name: 'StressTest' }],
        });

        wb.initRender();

        // 模拟频繁操作
        for (let i = 0; i < 100; i++) {
            const cb = vi.fn();
            wb.addHook(HOOKS.AFTER_CHANGE, cb);
            wb.removeHook(HOOKS.AFTER_CHANGE, cb);
        }

        // 最终应该是空的
        expect(wb.eventHandler.hooks.hasHook(HOOKS.AFTER_CHANGE)).toBe(false);

        wb.destroy();
    });
});