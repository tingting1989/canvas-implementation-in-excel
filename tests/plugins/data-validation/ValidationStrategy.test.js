import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ValidationStrategy } from '../../../src/editor/strategies/ValidationStrategy.js';
import { DataValidationPlugin } from '../../../src/plugins/data-validation/DataValidationPlugin.js';
import { HOOKS } from '../../../src/constants/hookNames.js';

describe('ValidationStrategy - 策略模式重构测试', () => {
    let strategy;
    let mockPlugin;
    let mockHandler;

    beforeEach(() => {
        mockHandler = {
            strategies: new Map(),
            addStrategy: jest.fn(),
            removeStrategy: jest.fn()
        };

        mockPlugin = {
            active: true,
            interceptBeforeSetValue: jest.fn(() => true),
            handleAfterSetValue: jest.fn(),
            interceptBeforePaste: jest.fn(() => true),
            uiController: {
                onCellSelected: jest.fn()
            }
        };

        strategy = new ValidationStrategy(mockHandler, mockPlugin);
    });

    describe('策略基础属性', () => {
        test('策略名称应为 validation', () => {
            expect(strategy.name).toBe('validation');
        });

        test('优先级应为 DATA_VALIDATION (950)', () => {
            const { STRATEGY_PRIORITY } = require('../../../src/constants/strategyPriority.js');
            expect(strategy.priority).toBe(STRATEGY_PRIORITY.DATA_VALIDATION);
        });

        test('初始状态应启用', () => {
            expect(strategy.enabled).toBe(true);
        });
    });

    describe('事件处理器注册', () => {
        test('getEventHandlers 应返回空对象', () => {
            const handlers = strategy.getEventHandlers();
            expect(handlers).toEqual({});
        });
    });

    describe('interceptBeforeSetValue - 拦截单元格赋值', () => {
        test('插件禁用时应返回 true（允许赋值）', () => {
            strategy.enabled = false;
            const result = strategy.interceptBeforeSetValue(0, 0, 'test');
            expect(result).toBe(true);
            expect(mockPlugin.interceptBeforeSetValue).not.toHaveBeenCalled();
        });

        test('插件未激活时应返回 true', () => {
            mockPlugin.active = false;
            const result = strategy.interceptBeforeSetValue(0, 0, 'test');
            expect(result).toBe(true);
        });

        test('正常情况应调用插件的拦截方法', () => {
            mockPlugin.interceptBeforeSetValue.mockReturnValue(true);
            const result = strategy.interceptBeforeSetValue(1, 2, 'value');

            expect(mockPlugin.interceptBeforeSetValue).toHaveBeenCalledWith(1, 2, 'value');
            expect(result).toBe(true);
        });

        test('插件返回 false 时应阻止赋值', () => {
            mockPlugin.interceptBeforeSetValue.mockReturnValue(false);
            const result = strategy.interceptBeforeSetValue(0, 0, 'invalid');

            expect(result).toBe(false);
        });
    });

    describe('handleAfterSetValue - 赋值后处理', () => {
        test('插件禁用时不执行任何操作', () => {
            strategy.enabled = false;
            strategy.handleAfterSetValue(0, 0, 'value');
            expect(mockPlugin.handleAfterSetValue).not.toHaveBeenCalled();
        });

        test('正常情况应调用插件的后处理方法', () => {
            strategy.handleAfterSetValue(1, 2, 'newValue');
            expect(mockPlugin.handleAfterSetValue).toHaveBeenCalledWith(1, 2, 'newValue');
        });
    });

    describe('interceptBeforePaste - 拦截粘贴操作', () => {
        test('应调用插件的粘贴拦截方法', () => {
            const pasteData = [{ row: 0, col: 0, value: 'pasted' }];
            mockPlugin.interceptBeforePaste.mockReturnValue(true);

            const result = strategy.interceptBeforePaste(pasteData);

            expect(mockPlugin.interceptBeforePaste).toHaveBeenCalledWith(pasteData);
            expect(result).toBe(true);
        });
    });

    describe('handleCellSelected - 单元格选中处理', () => {
        test('有 uiController 时应调用 onCellSelected', () => {
            strategy.handleCellSelected(5, 3);
            expect(mockPlugin.uiController.onCellSelected).toHaveBeenCalledWith(5, 3);
        });

        test('uiController 为空时不报错', () => {
            mockPlugin.uiController = null;
            expect(() => strategy.handleCellSelected(0, 0)).not.toThrow();
        });
    });

    describe('destroy - 销毁清理', () => {
        test('销毁后应清理插件引用', () => {
            strategy.destroy();
            expect(strategy.plugin).toBeUndefined();
        });
    });
});

describe('DataValidationPlugin - Hooks 执行完整性测试', () => {
    let plugin;
    let mockWorkbook;
    let hookCallLog;

    beforeEach(() => {
        hookCallLog = [];
        mockWorkbook = createMockWorkbookWithHooks(hookCallLog);
        plugin = new DataValidationPlugin(mockWorkbook);
    });

    describe('BEFORE_VALIDATE hook 执行', () => {
        test('validateCell() 应触发 BEFORE_VALIDATE 并传递正确的上下文', async () => {
            await plugin.init({
                rules: [{
                    range: 'A1:A10',
                    type: 'number',
                    operator: 'between',
                    value: [0, 100]
                }]
            });

            await plugin.validateCell(0, 0, 50);

            const beforeValidateCall = hookCallLog.find(log => log.hook === HOOKS.BEFORE_VALIDATE);
            expect(beforeValidateCall).toBeDefined();
            expect(beforeValidateCall.args[0]).toBe(50); // value
            expect(beforeValidateCall.args[1]).toEqual({ row: 0, col: 0 }); // context
        });
    });

    describe('AFTER_VALIDATE hook 执行 - 统一参数格式', () => {
        test('handleAfterSetValue() 触发的 AFTER_VALIDATE 应包含 source 字段', async () => {
            await plugin.init();

            plugin.handleAfterSetValue(0, 0, 'testValue');

            const afterValidateCall = hookCallLog.find(log => log.hook === HOOKS.AFTER_VALIDATE);
            expect(afterValidateCall).toBeDefined();
            expect(afterValidateCall.args[0].source).toBe('after_set_value');
            expect(afterValidateCall.args[0].row).toBe(0);
            expect(afterValidateCall.args[0].col).toBe(0);
            expect(afterValidateCall.args[0].value).toBe('testValue');
        });

        test('validateCell() 触发的 AFTER_VALIDATE 应包含 source 字段', async () => {
            await plugin.init({
                rules: [{
                    range: 'A1:A10',
                    type: 'number',
                    operator: 'between',
                    value: [0, 100]
                }]
            });

            await plugin.validateCell(0, 0, 50);

            const afterValidateCall = hookCallLog.find(log => log.hook === HOOKS.AFTER_VALIDATE);
            expect(afterValidateCall).toBeDefined();
            expect(afterValidateCall.args[0].source).toBe('manual_validation');
            expect(afterValidateCall.args[0].row).toBe(0);
            expect(afterValidateCall.args[0].col).toBe(0);
        });
    });

    describe('VALIDATION_FAILED hook 执行', () => {
        test('验证失败时应触发完整的 hook 链：BEFORE_VALIDATE → VALIDATION_FAILED', async () => {
            await plugin.init({
                rules: [{
                    range: 'A1:A10',
                    type: 'number',
                    operator: 'between',
                    value: [0, 100]
                }],
                highlightInvalidCells: true
            });

            const canProceed = plugin.interceptBeforeSetValue(0, 0, 999);

            // 1. BEFORE_VALIDATE 应该先触发
            const beforeValidateCall = hookCallLog.find(log => log.hook === HOOKS.BEFORE_VALIDATE);
            expect(beforeValidateCall).toBeDefined();
            expect(beforeValidateCall.args[0]).toBe(999); // value
            expect(beforeValidateCall.args[1]).toEqual({ row: 0, col: 0 }); // context

            // 2. VALIDATION_FAILED 应该触发
            const failedCall = hookCallLog.find(log => log.hook === HOOKS.VALIDATION_FAILED);
            expect(failedCall).toBeDefined();
            expect(failedCall.args[0]).toBe(0); // row
            expect(failedCall.args[1]).toBe(0); // col
            expect(failedCall.args[2]).toBe(999); // value
            expect(failedCall.args[3].valid).toBe(false); // result

            // 3. 验证执行顺序：BEFORE_VALIDATE 应在 VALIDATION_FAILED 之前
            const beforeIndex = hookCallLog.findIndex(log => log.hook === HOOKS.BEFORE_VALIDATE);
            const failedIndex = hookCallLog.findIndex(log => log.hook === HOOKS.VALIDATION_FAILED);
            expect(beforeIndex).toBeLessThan(failedIndex);
        });

        test('验证成功时应触发完整的 hook 链：BEFORE_VALIDATE → AFTER_VALIDATE', async () => {
            await plugin.init({
                rules: [{
                    range: 'A1:A10',
                    type: 'number',
                    operator: 'between',
                    value: [0, 100]
                }],
                highlightInvalidCells: true
            });

            plugin.interceptBeforeSetValue(0, 0, 50);

            // 1. BEFORE_VALIDATE 应该触发
            const beforeValidateCall = hookCallLog.find(log => log.hook === HOOKS.BEFORE_VALIDATE);
            expect(beforeValidateCall).toBeDefined();

            // 2. AFTER_VALIDATE 应该触发（不是 VALIDATION_FAILED）
            const afterValidateCall = hookCallLog.find(log => log.hook === HOOKS.AFTER_VALIDATE);
            expect(afterValidateCall).toBeDefined();
            expect(afterValidateCall.args[0].source).toBe('before_set_value');
            expect(afterValidateCall.args[0].valid).toBe(true);

            // 3. 不应该触发 VALIDATION_FAILED
            const failedCall = hookCallLog.find(log => log.hook === HOOKS.VALIDATION_FAILED);
            expect(failedCall).toBeUndefined();
        });
    });

    describe('BEFORE/AFTER_VALIDATION_RULE_CHANGE hooks 执行', () => {
        test('setValidation() 应触发规则变更前后 hooks', async () => {
            await plugin.init();

            const ruleId = plugin.setValidation({
                range: 'B2:B100',
                type: 'list',
                source: ['选项1', '选项2']
            });

            expect(ruleId).toBeDefined();

            const beforeChangeCalls = hookCallLog.filter(log => log.hook === HOOKS.BEFORE_VALIDATION_RULE_CHANGE);
            const afterChangeCalls = hookCallLog.filter(log => log.hook === HOOKS.AFTER_VALIDATION_RULE_CHANGE);

            expect(beforeChangeCalls.length).toBeGreaterThanOrEqual(1);
            expect(afterChangeCalls.length).toBeGreaterThanOrEqual(1);
        });

        test('removeValidation() 应触发规则移除前后 hooks', async () => {
            await plugin.init();

            const ruleId = plugin.setValidation({
                range: 'A1:A10',
                type: 'number'
            });

            hookCallLog.length = 0; // 清空日志

            plugin.removeValidation(ruleId);

            const beforeChangeCalls = hookCallLog.filter(log => log.hook === HOOKS.BEFORE_VALIDATION_RULE_CHANGE);
            const afterChangeCalls = hookCallLog.filter(log => log.hook === HOOKS.AFTER_VALIDATION_RULE_CHANGE);

            expect(beforeChangeCalls.length).toBeGreaterThanOrEqual(1);
            expect(afterChangeCalls.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('AFTER_BATCH_VALIDATION hook 执行', () => {
        test('validateRange() 完成后应触发批量验证完成 hook', async () => {
            await plugin.init({
                rules: [{
                    range: 'A1:C10',
                    type: 'number',
                    operator: 'greaterThan',
                    value: 0
                }]
            });

            const report = await plugin.validateRange({
                startRow: 0,
                startCol: 0,
                endRow: 9,
                endCol: 2
            });

            const batchCall = hookCallLog.find(log => log.hook === HOOKS.AFTER_BATCH_VALIDATION);
            expect(batchCall).toBeDefined();
            expect(batchCall.args[0]).toBe(report); // 应该是完整的报告对象
            expect(batchCall.args[0].total).toBe(report.total);
        });
    });
});

describe('EventHandler 集成测试 - ValidationStrategy 调用链', () => {
    let eventHandler;
    let validationStrategy;
    let mockSheet;

    beforeEach(() => {
        mockSheet = createMockSheetForIntegration();
        eventHandler = createMockEventHandler(mockSheet);

        const mockPlugin = {
            active: true,
            interceptBeforeSetValue: jest.fn((row, col, value) => {
                if (value === 'BLOCKED') return false;
                return true;
            }),
            handleAfterSetValue: jest.fn()
        };

        validationStrategy = new ValidationStrategy(eventHandler, mockPlugin);
        eventHandler.strategies.set('validation', validationStrategy);
    });

    describe('BEFORE_CHANGE 事件处理流程', () => {
        test('ValidationStrategy 应在用户 hooks 之前执行', () => {
            const changes = [
                { row: 0, col: 0, newValue: 'valid' }
            ];

            const result = simulateBeforeChangeEvent(eventHandler, changes);

            expect(validationStrategy.plugin.interceptBeforeSetValue).toHaveBeenCalled();
            expect(validationStrategy.plugin.interceptBeforeSetValue).toHaveBeenCalledWith(0, 0, 'valid');
        });

        test('ValidationStrategy 返回 false 应阻止后续处理', () => {
            const changes = [
                { row: 0, col: 0, newValue: 'BLOCKED' }
            ];

            const result = simulateBeforeChangeEvent(eventHandler, changes);

            expect(result).toBe(false);
        });
    });

    describe('AFTER_CHANGE 事件处理流程', () => {
        test('ValidationStrategy.handleAfterSetValue 应被调用', () => {
            const changes = [
                { row: 1, col: 2, oldValue: 'old', newValue: 'new' }
            ];

            simulateAfterChangeEvent(eventHandler, changes);

            expect(validationStrategy.plugin.handleAfterSetValue).toHaveBeenCalledWith(1, 2, 'new');
        });
    });
});

// ==================== Mock 工厂函数 ====================

function createMockWorkbookWithHooks(hookCallLog) {
    return {
        activeSheet: {
            rowCount: 20,
            colCount: 10,
            bus: {
                on: jest.fn(),
                off: jest.fn(),
                emit: jest.fn()
            },
            cellStore: {
                get: jest.fn(() => ({ value: 'old_value' }))
            },
            selection: {
                setActive: jest.fn()
            }
        },
        hooks: {
            addHook: jest.fn((hookName, callback) => {}),
            removeHook: jest.fn(),
            runHooks: jest.fn((hookName, ...args) => {
                hookCallLog.push({ hook: hookName, args, timestamp: Date.now() });
            }),
            runHooksUntil: jest.fn((hookName, ...args) => true)
        },
        eventHandler: {
            addStrategy: jest.fn(),
            viewport: {
                scrollToCell: jest.fn()
            }
        },
        renderEngine: {
            invalidateAll: jest.fn(),
            render: jest.fn()
        }
    };
}

function createMockSheetForIntegration() {
    return {
        bus: {
            on: jest.fn(),
            off: jest.fn(),
            emit: jest.fn()
        },
        cellStore: {
            get: jest.fn((row, col) => ({
                value: `cell_${row}_${col}`,
                style: {}
            }))
        }
    };
}

function createMockEventHandler(sheet) {
    return {
        sheet,
        strategies: new Map(),
        runHooksUntil: jest.fn(() => true),
        runHooks: jest.fn(),
        viewport: {
            scrollToCell: jest.fn()
        }
    };
}

function simulateBeforeChangeEvent(handler, changes) {
    const validationStrategy = handler.strategies.get('validation');
    if (!validationStrategy) return true;

    for (const change of changes) {
        const canProceed = validationStrategy.interceptBeforeSetValue(change.row, change.col, change.newValue);
        if (!canProceed) return false;
    }

    return handler.runHooksUntil('before_change', changes);
}

function simulateAfterChangeEvent(handler, changes) {
    const validationStrategy = handler.strategies.get('validation');
    if (validationStrategy) {
        for (const change of changes) {
            validationStrategy.handleAfterSetValue(change.row, change.col, change.newValue);
        }
    }

    handler.runHooks('after_change', changes);
}