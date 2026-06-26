import { describe, test, expect, beforeEach } from 'vitest';
import { DataValidationPlugin, ValidationRule, ValidationResult, ValidationEngine, NumberValidator, TextLengthValidator, ListValidator, UniqueValidatorV3 } from '../../../src/plugins/data-validation/index.js';

describe('DataValidationPlugin - 基础框架测试', () => {
    let plugin;
    let mockWorkbook;

    beforeEach(() => {
        mockWorkbook = createMockWorkbook();
        plugin = new DataValidationPlugin(mockWorkbook);
    });

    describe('插件生命周期', () => {
        test('应该正确初始化', async () => {
            await plugin.init({
                rules: [
                    {
                        range: 'A1:A10',
                        type: 'number',
                        operator: 'between',
                        value: [0, 100]
                    }
                ]
            });

            expect(plugin.active).toBe(true);
            expect(plugin.engine).not.toBeNull();
            expect(plugin.engine.rules.size).toBe(1);
        });

        test('应该支持启用/禁用', async () => {
            await plugin.init();

            plugin.disable();
            expect(plugin.active).toBe(false);

            plugin.enable();
            expect(plugin.active).toBe(true);
        });

        test('销毁后应清理所有资源', async () => {
            await plugin.init();
            plugin.destroy();

            expect(plugin.active).toBe(false);
            expect(plugin.engine).toBeNull();
        });
    });

    describe('规则管理', () => {
        test('应该能够添加验证规则', async () => {
            await plugin.init();

            const ruleId = plugin.setValidation({
                range: 'B2:B100',
                type: 'number',
                operator: 'greaterThan',
                value: 0,
                errorMessage: '必须输入正数'
            });

            expect(ruleId).toMatch(/^vr_/);
            expect(plugin.getAllRules().length).toBe(1);

            const rule = plugin.getRuleById(ruleId);
            expect(rule.range).toBe('B2:B100');
            expect(rule.type).toBe('number');
            expect(rule.errorMessage).toBe('必须输入正数');
        });

        test('应该能够移除验证规则', async () => {
            await plugin.init();

            const ruleId = plugin.setValidation({
                range: 'A1:A10',
                type: 'list',
                source: ['选项1', '选项2']
            });

            expect(plugin.getAllRules().length).toBe(1);

            const removed = plugin.removeValidation(ruleId);
            expect(removed).toBe(true);
            expect(plugin.getAllRules().length).toBe(0);
        });

        test('无效规则应该抛出错误', async () => {
            await plugin.init();

            expect(() => {
                plugin.setValidation({
                    range: 'A1:A10',
                    type: 'invalid_type'
                });
            }).toThrow();
        });
    });

    describe('单元格验证', () => {
        test('数值范围验证 - between', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'between',
                value: [0, 100]
            });

            const validResult = await plugin.validateCell(0, 0, 50);
            expect(validResult.valid).toBe(true);

            const invalidResult = await plugin.validateCell(0, 0, 150);
            expect(invalidResult.valid).toBe(false);
        });

        test('文本长度验证', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'B1:B10',
                type: 'text',
                operator: 'lengthBetween',
                value: [5, 10]
            });

            const validResult = await plugin.validateCell(0, 1, 'hello');
            expect(validResult.valid).toBe(true);

            const invalidResult = await plugin.validateCell(0, 1, 'hi');
            expect(invalidResult.valid).toBe(false);
        });

        test('下拉列表验证', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'C1:C10',
                type: 'list',
                source: ['男', '女', '其他']
            });

            const validResult = await plugin.validateCell(0, 2, '男');
            expect(validResult.valid).toBe(true);

            const invalidResult = await plugin.validateCell(0, 2, '未知');
            expect(invalidResult.valid).toBe(false);
        });

        test('空值处理 - allowBlank=true', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'greaterThan',
                value: 0,
                allowBlank: true
            });

            const result = await plugin.validateCell(0, 0, null);
            expect(result.valid).toBe(true);
        });

        test('空值处理 - allowBlank=false', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'greaterThan',
                value: 0,
                allowBlank: false
            });

            const result = await plugin.validateCell(0, 0, null);
            expect(result.valid).toBe(false);
        });
    });

    describe('批量验证', () => {
        test('应该能够验证整个区域', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'A1:A5',
                type: 'number',
                operator: 'between',
                value: [0, 100]
            });

            const report = await plugin.validateRange('A1:A5');

            expect(report.total).toBe(5);
            expect(report.results.length).toBe(5);
            expect(typeof report.valid).toBe('number');
            expect(typeof report.invalid).toBe('number');
        });
    });

    describe('规则导入/导出', () => {
        test('应该能够导出规则为 JSON', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                operator: 'between',
                value: [0, 100]
            });

            const exported = plugin.exportRules();

            expect(Array.isArray(exported)).toBe(true);
            expect(exported.length).toBe(1);
            expect(exported[0].range).toBe('A1:A10');
            expect(exported[0].id).toBeDefined();
        });

        test('应该能够从 JSON 导入规则', async () => {
            await plugin.init();

            const rulesJSON = [
                {
                    range: 'B1:B10',
                    type: 'text',
                    operator: 'lengthBetween',
                    value: [3, 20],
                    errorMessage: '长度必须在 3-20 个字符之间'
                },
                {
                    range: 'C1:C10',
                    type: 'list',
                    source: ['A', 'B', 'C'],
                    errorMessage: '请选择 A、B 或 C'
                }
            ];

            const importedIds = plugin.importRules(rulesJSON);

            expect(importedIds.length).toBe(2);
            expect(plugin.getAllRules().length).toBe(2);
        });
    });
});

describe('ValidationRule 数据模型测试', () => {
    test('应该自动生成唯一 ID', () => {
        const rule1 = new ValidationRule({ range: 'A1' });
        const rule2 = new ValidationRule({ range: 'A2' });

        expect(rule1.id).toMatch(/^vr_/);
        expect(rule2.id).toMatch(/^vr_/);
        expect(rule1.id).not.toBe(rule2.id);
    });

    test('应该支持序列化和反序列化', () => {
        const originalRule = new ValidationRule({
            range: 'A1:A100',
            type: 'number',
            operator: 'between',
            value: [0, 100],
            errorMessage: '测试错误消息'
        });

        const json = originalRule.toJSON();
        const restoredRule = ValidationRule.fromJSON(json);

        expect(restoredRule.id).toBe(originalRule.id);
        expect(restoredRule.range).toBe(originalRule.range);
        expect(restoredRule.type).toBe(originalRule.type);
        expect(restoredRule.errorMessage).toBe(originalRule.errorMessage);
    });

    test('validate() 应该检测无效规则', () => {
        const invalidRule1 = new ValidationRule({});
        const result1 = invalidRule1.validate();
        expect(result1.valid).toBe(false);
        expect(result1.errors.length).toBeGreaterThan(0);

        const validRule = new ValidationRule({
            range: 'A1:A10',
            type: 'number',
            operator: 'between',
            value: [0, 100]
        });
        const result2 = validRule.validate();
        expect(result2.valid).toBe(true);
    });
});

describe('NumberValidator 测试', () => {
    let validator;

    beforeEach(() => {
        validator = new NumberValidator();
    });

    test('between 运算符', async () => {
        const rule = new ValidationRule({
            type: 'number',
            operator: 'between',
            value: [0, 100]
        });

        expect((await validator.validate(50, rule)).valid).toBe(true);
        expect((await validator.validate(0, rule)).valid).toBe(true);
        expect((await validator.validate(100, rule)).valid).toBe(true);
        expect((await validator.validate(-1, rule)).valid).toBe(false);
        expect((await validator.validate(101, rule)).valid).toBe(false);
    });

    test('greaterThan 运算符', async () => {
        const rule = new ValidationRule({
            type: 'number',
            operator: 'greaterThan',
            value: 0
        });

        expect((await validator.validate(1, rule)).valid).toBe(true);
        expect((await validator.validate(0, rule)).valid).toBe(false);
        expect((await validator.validate(-1, rule)).valid).toBe(false);
    });

    test('非数值类型应该失败', async () => {
        const rule = new ValidationRule({
            type: 'number',
            operator: 'between',
            value: [0, 100]
        });

        expect((await validator.validate('abc', rule)).valid).toBe(false);
        expect((await validator.validate(null, rule)).valid).toBe(true); // allowBlank 默认为 true
    });
});

describe('TextLengthValidator 测试', () => {
    let validator;

    beforeEach(() => {
        validator = new TextLengthValidator();
    });

    test('lengthBetween 运算符', async () => {
        const rule = new ValidationRule({
            type: 'text',
            operator: 'lengthBetween',
            value: [3, 10]
        });

        expect((await validator.validate('hello', rule)).valid).toBe(true); // 5个字符
        expect((await validator.validate('hi', rule)).valid).toBe(false); // 2个字符
        expect((await validator.validate('helloworld', rule)).valid).toBe(true); // 10个字符（边界值）
        expect((await validator.validate('helloworld!', rule)).valid).toBe(false); // 11个字符
    });
});

describe('ListValidator 测试', () => {
    let validator;

    beforeEach(() => {
        validator = new ListValidator();
    });

    test('静态数组验证', async () => {
        const rule = new ValidationRule({
            type: 'list',
            source: ['男', '女', '其他']
        });

        expect((await validator.validate('男', rule)).valid).toBe(true);
        expect((await validator.validate('女', rule)).valid).toBe(true);
        expect((await validator.validate('未知', rule)).valid).toBe(false);
    });
});

describe('ValidationResult 测试', () => {
    test('success() 工厂方法', () => {
        const result = ValidationResult.success();
        expect(result.valid).toBe(true);
        expect(result.message).toBeNull();
    });

    test('failure() 工厂方法', () => {
        const result = ValidationResult.failure('值超出范围', 'stop', {
            value: 150,
            ruleId: 'vr_123'
        });

        expect(result.valid).toBe(false);
        expect(result.message).toBe('值超出范围');
        expect(result.errorStyle).toBe('stop');
        expect(result.failedValue).toBe(150);
        expect(result.ruleId).toBe('vr_123');
    });

    test('toJSON() 序列化', () => {
        const result = ValidationResult.failure('测试错误');
        const json = result.toJSON();

        expect(json.valid).toBe(false);
        expect(json.message).toBe('测试错误');
        expect(json.timestamp).toBeDefined();
    });
});

function createMockWorkbook() {
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
            invalidateAll: () => {}
        },
        eventHandler: {
            hooks: {
                addHook: () => {},
                removeHook: () => {},
                call: () => {}
            }
        },
        addHook: (hook, callback) => {},
        render: () => {}
    };
}