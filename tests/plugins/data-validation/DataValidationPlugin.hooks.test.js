import { describe, test, expect, beforeEach } from 'vitest';
import { DataValidationPlugin, ValidationResult } from '@/plugins/dataValidation';
import { HOOKS } from '../../../src/constants/hookNames.js';

describe('DataValidationPlugin - Hooks 拦截功能测试', () => {
    let plugin;
    let mockWorkbook;
    let hooks;

    beforeEach(() => {
        hooks = {
            addHook: () => {},
            removeHook: () => {},
            runHooks: () => {},
            runHooksUntil: () => {},
            clearAllHooks: () => {}
        };

        mockWorkbook = createMockWorkbook(hooks);
        plugin = new DataValidationPlugin(mockWorkbook);
    });

    describe('BEFORE_VALIDATE 钩子拦截', () => {
        test('interceptBeforeSetValue 应该支持 BEFORE_VALIDATE 钩子拦截', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'between',
                value: [0, 100]
            });

            let hookCalled = false;
            hooks.runHooksUntil = (hookName, value, context) => {
                if (hookName === HOOKS.BEFORE_VALIDATE) {
                    hookCalled = true;
                    return false;
                }
                return undefined;
            };

            const result = plugin.interceptBeforeSetValue(0, 0, 50);

            expect(hookCalled).toBe(true);
            expect(result).toBe(false);
        });

        test('interceptBeforeSetValue 钩子不拦截时应继续执行验证', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'between',
                value: [0, 100]
            });

            let hookCalled = false;
            hooks.runHooksUntil = (hookName, value, context) => {
                if (hookName === HOOKS.BEFORE_VALIDATE) {
                    hookCalled = true;
                    return undefined;
                }
                return undefined;
            };

            const result = plugin.interceptBeforeSetValue(0, 0, 50);

            expect(hookCalled).toBe(true);
            expect(result).toBe(true);
        });

        test('interceptBeforeSetValue 钩子返回 true 时应允许操作', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'between',
                value: [0, 100]
            });

            hooks.runHooksUntil = (hookName, value, context) => {
                if (hookName === HOOKS.BEFORE_VALIDATE) {
                    return true;
                }
                return undefined;
            };

            const result = plugin.interceptBeforeSetValue(0, 0, 50);

            expect(result).toBe(true);
        });

        test('validateCell 异步方法应该支持 BEFORE_VALIDATE 钩子拦截', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'between',
                value: [0, 100]
            });

            hooks.runHooksUntil = (hookName, value, context) => {
                if (hookName === HOOKS.BEFORE_VALIDATE) {
                    return false;
                }
                return undefined;
            };

            const result = await plugin.validateCell(0, 0, 50);

            expect(result.cancelled).toBe(true);
            expect(result.valid).toBe(true);
            expect(result.message).toBe('验证被用户拦截');
        });

        test('validateCell 钩子不拦截时应正常验证', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'between',
                value: [0, 100]
            });

            hooks.runHooksUntil = (hookName, value, context) => {
                if (hookName === HOOKS.BEFORE_VALIDATE) {
                    return undefined;
                }
                return undefined;
            };

            const validResult = await plugin.validateCell(0, 0, 50);
            expect(validResult.cancelled).toBeUndefined();
            expect(validResult.valid).toBe(true);

            const invalidResult = await plugin.validateCell(0, 0, 150);
            expect(invalidResult.cancelled).toBeUndefined();
            expect(invalidResult.valid).toBe(false);
        });

        test('插件禁用时应该跳过钩子检查', async () => {
            await plugin.init();
            plugin.disable();

            let hookCalled = false;
            hooks.runHooksUntil = (hookName, value, context) => {
                hookCalled = true;
                return false;
            };

            const result = plugin.interceptBeforeSetValue(0, 0, 50);

            expect(hookCalled).toBe(false);
            expect(result).toBe(true);
        });
    });

    describe('BEFORE_VALIDATION_RULE_CHANGE 钩子拦截', () => {
        test('setValidation 应该支持 BEFORE_VALIDATION_RULE_CHANGE 钩子拦截', async () => {
            await plugin.init();

            hooks.runHooksUntil = (hookName, oldRule, newRule) => {
                if (hookName === HOOKS.BEFORE_VALIDATION_RULE_CHANGE) {
                    return false;
                }
                return undefined;
            };

            const ruleId = plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'greaterThan',
                value: 0
            });

            expect(ruleId).toBeNull();
            expect(plugin.getAllRules().length).toBe(0);
        });

        test('setValidation 钩子不拦截时应正常添加规则', async () => {
            await plugin.init();

            hooks.runHooksUntil = (hookName, oldRule, newRule) => {
                if (hookName === HOOKS.BEFORE_VALIDATION_RULE_CHANGE) {
                    return undefined;
                }
                return undefined;
            };

            const ruleId = plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'greaterThan',
                value: 0
            });

            expect(ruleId).not.toBeNull();
            expect(ruleId).toMatch(/^vr_/);
            expect(plugin.getAllRules().length).toBe(1);
        });

        test('setValidation 钩子返回 true 时应允许添加规则', async () => {
            await plugin.init();

            hooks.runHooksUntil = (hookName, oldRule, newRule) => {
                if (hookName === HOOKS.BEFORE_VALIDATION_RULE_CHANGE) {
                    return true;
                }
                return undefined;
            };

            const ruleId = plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'greaterThan',
                value: 0
            });

            expect(ruleId).not.toBeNull();
            expect(plugin.getAllRules().length).toBe(1);
        });

        test('removeValidation 应该支持 BEFORE_VALIDATION_RULE_CHANGE 钩子拦截', async () => {
            await plugin.init();

            const ruleId = plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'greaterThan',
                value: 0
            });

            expect(plugin.getAllRules().length).toBe(1);

            hooks.runHooksUntil = (hookName, oldRule, newRule) => {
                if (hookName === HOOKS.BEFORE_VALIDATION_RULE_CHANGE) {
                    return false;
                }
                return undefined;
            };

            const removed = plugin.removeValidation(ruleId);

            expect(removed).toBe(false);
            expect(plugin.getAllRules().length).toBe(1);
        });

        test('removeValidation 钩子不拦截时应正常删除规则', async () => {
            await plugin.init();

            const ruleId = plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'greaterThan',
                value: 0
            });

            expect(plugin.getAllRules().length).toBe(1);

            hooks.runHooksUntil = (hookName, oldRule, newRule) => {
                if (hookName === HOOKS.BEFORE_VALIDATION_RULE_CHANGE) {
                    return undefined;
                }
                return undefined;
            };

            const removed = plugin.removeValidation(ruleId);

            expect(removed).toBe(true);
            expect(plugin.getAllRules().length).toBe(0);
        });

        test('removeValidation 钩子返回 true 时应允许删除规则', async () => {
            await plugin.init();

            const ruleId = plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'greaterThan',
                value: 0
            });

            expect(plugin.getAllRules().length).toBe(1);

            hooks.runHooksUntil = (hookName, oldRule, newRule) => {
                if (hookName === HOOKS.BEFORE_VALIDATION_RULE_CHANGE) {
                    return true;
                }
                return undefined;
            };

            const removed = plugin.removeValidation(ruleId);

            expect(removed).toBe(true);
            expect(plugin.getAllRules().length).toBe(0);
        });
    });

    describe('ValidationResult.cancelled() 静态方法', () => {
        test('应该创建被取消状态的验证结果', () => {
            const result = ValidationResult.cancelled();

            expect(result.valid).toBe(true);
            expect(result.cancelled).toBe(true);
            expect(result.message).toBe('验证被用户拦截');
        });

        test('toJSON() 应该包含 cancelled 字段', () => {
            const result = ValidationResult.cancelled();
            const json = result.toJSON();

            expect(json.valid).toBe(true);
            expect(json.cancelled).toBe(true);
            expect(json.message).toBe('验证被用户拦截');
        });

        test('cancelled 结果应该不影响正常的 valid 状态判断', () => {
            const result = ValidationResult.cancelled();

            expect(result.valid).toBe(true);
            expect(result.cancelled).toBe(true);

            expect(result.valid === false).toBe(false);
            expect(result.cancelled === true).toBe(true);
        });
    });

    describe('AFTER_VALIDATE 和 VALIDATION_FAILED 钩子', () => {
        test('interceptBeforeSetValue 验证失败时应触发 VALIDATION_FAILED 钩子', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'between',
                value: [0, 100]
            });

            let failedHookCalled = false;
            let failedHookArgs = [];

            hooks.runHooks = (hookName, ...args) => {
                if (hookName === HOOKS.VALIDATION_FAILED) {
                    failedHookCalled = true;
                    failedHookArgs = args;
                }
            };

            hooks.runHooksUntil = (hookName, value, context) => {
                if (hookName === HOOKS.BEFORE_VALIDATE) {
                    return undefined;
                }
                return undefined;
            };

            const result = plugin.interceptBeforeSetValue(0, 0, 150);

            expect(result).toBe(false);
            expect(failedHookCalled).toBe(true);
            expect(failedHookArgs[0]).toBe(0);
            expect(failedHookArgs[1]).toBe(0);
            expect(failedHookArgs[2]).toBe(150);
        });

        test('interceptBeforeSetValue 验证成功时应触发 AFTER_VALIDATE 钩子', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'between',
                value: [0, 100]
            });

            let afterHookCalled = false;

            hooks.runHooks = (hookName, result) => {
                if (hookName === HOOKS.AFTER_VALIDATE) {
                    afterHookCalled = true;
                }
            };

            hooks.runHooksUntil = (hookName, value, context) => {
                if (hookName === HOOKS.BEFORE_VALIDATE) {
                    return undefined;
                }
                return undefined;
            };

            const result = plugin.interceptBeforeSetValue(0, 0, 50);

            expect(result).toBe(true);
            expect(afterHookCalled).toBe(true);
        });
    });

    describe('AFTER_BATCH_VALIDATION 钩子', () => {
        test('validateRange 应该触发 AFTER_BATCH_VALIDATION 钩子', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'A1:A5',
                type: 'number',
                operator: 'between',
                value: [0, 100]
            });

            let batchHookCalled = false;
            let batchHookArgs = [];

            hooks.runHooks = (hookName, report) => {
                if (hookName === HOOKS.AFTER_BATCH_VALIDATION) {
                    batchHookCalled = true;
                    batchHookArgs = [report];
                }
            };

            const report = await plugin.validateRange('A1:A5');

            expect(batchHookCalled).toBe(true);
            expect(batchHookArgs[0]).toEqual(report);
            expect(report.total).toBe(5);
        });
    });
});

function createMockWorkbook(hooks) {
    const mockCellStore = {
        get: (row, col) => ({
            value: row * 10 + col
        }),
        sheetName: 'Sheet1'
    };

    return {
        activeSheet: {
            cellStore: mockCellStore
        },
        renderEngine: {
            invalidateAll: () => {},
            addAfterRenderCallback: () => {},
            removeAfterRenderCallback: () => {}
        },
        eventHandler: {
            hooks: hooks,
            addStrategy: () => {},
            strategies: new Map()
        },
        addHook: (hook, callback) => {},
        render: () => {}
    };
}