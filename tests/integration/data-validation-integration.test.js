import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Workbook } from '../../src/workbook/Workbook.js';
import { DataValidationPlugin } from '../../src/plugins/data-validation/DataValidationPlugin.js';

describe('DataValidationPlugin - 集成测试（真实 Workbook 环境）', () => {
    let workbook;
    let dv;
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        const canvas = document.createElement('canvas');
        container.appendChild(canvas);
        document.body.appendChild(container);

        workbook = new Workbook(container, {
            plugins: ['dataValidation'],
            pluginOptions: {
                dataValidation: {
                    conflictStrategy: 'short-circuit'
                }
            },
            sheets: [{
                name: 'Sheet1',
                data: [
                    [1, '张三', '北京', '技术部', 15000],
                    [2, '李四', '上海', '市场部', 18000],
                    [3, '王五', '广州', '技术部', 16000],
                    [4, '赵六', '深圳', '财务部', 14000],
                    [5, '钱七', '杭州', '人事部', 13000]
                ]
            }]
        });

        dv = workbook.getPlugin('dataValidation');
    });

    afterEach(() => {
        if (dv) {
            dv.destroy();
        }
        if (workbook) {
            workbook.destroy?.();
        }
        if (container && document.body.contains(container)) {
            document.body.removeChild(container);
        }
    });

    describe('插件初始化与生命周期', () => {
        test('应该正确初始化并与 Workbook 集成', () => {
            expect(dv).not.toBeNull();
            expect(dv.active).toBe(true);
            expect(dv.engine).not.toBeNull();
        });

        test('应该能够访问真实的 CellStore', () => {
            const sheet = workbook.activeSheet;
            expect(sheet).toBeDefined();
            expect(sheet.cellStore).toBeDefined();
        });

        test('启用/禁用功能正常', () => {
            dv.disable();
            expect(dv.active).toBe(false);

            dv.enable();
            expect(dv.active).toBe(true);
        });
    });

    describe('实际数据验证场景 - 员工信息表', () => {
        test('场景1：员工ID 必须是正整数', async () => {
            dv.setValidation({
                range: 'A1:A100',
                type: 'number',
                operator: 'greaterThan',
                value: 0,
                allowBlank: false,
                errorMessage: '员工ID必须是正整数'
            });

            const validResult = await dv.validateCell(0, 0, 6);
            expect(validResult.valid).toBe(true);

            const invalidResult = await dv.validateCell(0, 0, -1);
            expect(invalidResult.valid).toBe(false);
            expect(invalidResult.message).toContain('正整数');
        });

        test('场景2：姓名长度限制（2-10个字符）', async () => {
            dv.setValidation({
                range: 'B1:B100',
                type: 'text',
                operator: 'lengthBetween',
                value: [2, 10],
                errorMessage: '姓名长度必须在 2-10 个字符之间'
            });

            const validResult = await dv.validateCell(0, 1, '张三');
            expect(validResult.valid).toBe(true);

            const tooShortResult = await dv.validateCell(0, 1, '张');
            expect(tooShortResult.valid).toBe(false);

            const tooLongResult = await dv.validateCell(0, 1, '这是一个非常非常长的姓名');
            expect(tooLongResult.valid).toBe(false);
        });

        test('场景3：部门必须从下拉列表选择', async () => {
            dv.setValidation({
                range: 'D1:D100',
                type: 'list',
                source: ['技术部', '市场部', '财务部', '人事部', '运营部'],
                showDropdown: true,
                inputMessage: '请选择部门'
            });

            const validResult = await dv.validateCell(0, 3, '技术部');
            expect(validResult.valid).toBe(true);

            const invalidResult = await dv.validateCell(0, 3, '研发部');
            expect(invalidResult.valid).toBe(false);
            expect(invalidResult.message).toContain('不在允许的选项列表中');
        });

        test('场景4：薪资范围验证（5000-50000）', async () => {
            dv.setValidation({
                range: 'E1:E100',
                type: 'number',
                operator: 'between',
                value: [5000, 50000],
                allowBlank: false,
                errorMessage: '薪资必须在 5,000-50,000 之间',
                errorStyle: 'warning'
            });

            const validSalary = await dv.validateCell(0, 4, 20000);
            expect(validSalary.valid).toBe(true);

            const lowSalary = await dv.validateCell(0, 4, 3000);
            expect(lowSalary.valid).toBe(false);

            const highSalary = await dv.validateCell(0, 4, 60000);
            expect(highSalary.valid).toBe(false);
            expect(highSalary.errorStyle).toBe('warning');
        });

        test('场景5：员工ID 唯一性校验', async () => {
            dv.setValidation({
                range: 'A1:A100',
                type: 'unique',
                errorMessage: '该员工ID已存在，请检查后重新输入',
                errorStyle: 'stop'
            });

            // 第一次输入新 ID 应该通过
            const newIdResult = await dv.validateCell(5, 0, 6);
            expect(newIdResult.valid).toBe(true);

            // 输入已存在的 ID 应该失败
            const duplicateResult = await dv.validateCell(5, 0, 1); // A1 已有值 1
            expect(duplicateResult.valid).toBe(false);
            expect(duplicateResult.message).toContain('重复');
        });
    });

    describe('批量验证实际数据', () => {
        test('对整个员工表进行批量验证', async () => {
            dv.setValidation({ range: 'A:A', type: 'number', operator: 'greaterThan', value: 0 });
            dv.setValidation({ range: 'B:B', type: 'text', operator: 'lengthBetween', value: [2, 10] });
            dv.setValidation({ range: 'E:E', type: 'number', operator: 'between', value: [5000, 50000] });

            const report = await dv.validateRange('A1:E5');

            console.log('📊 批量验证报告:', report);
            expect(report.total).toBe(25); // 5行 × 5列
            expect(report.results.length).toBe(25);
            expect(typeof report.valid).toBe('number');
            expect(typeof report.invalid).toBe('number');
        });
    });

    describe('规则导入导出', () => {
        test('完整工作流：配置 → 导出 → 清空 → 导入 → 验证', () => {
            const originalRuleCount = 3;

            dv.setValidation({ range: 'A:A', type: 'number', operator: 'greaterThan', value: 0 });
            dv.setValidation({ range: 'B:B', type: 'list', source: ['选项1', '选项2'] });
            dv.setValidation({ range: 'C:C', type: 'unique' });

            expect(dv.getAllRules().length).toBe(originalRuleCount);

            const exported = dv.exportRules();
            expect(exported.length).toBe(originalRuleCount);

            for (let i = 0; i < originalRuleCount; i++) {
                dv.removeValidation(dv.getAllRules()[0].id);
            }
            expect(dv.getAllRules().length).toBe(0);

            const importedIds = dv.importRules(exported);
            expect(importedIds.length).toBe(originalRuleCount);
            expect(dv.getAllRules().length).toBe(originalRuleCount);
        });
    });

    describe('与其他插件的兼容性', () => {
        test('应该能够与 FreezePlugin 共存', () => {
            const freezePlugin = workbook.getPlugin('freeze');
            if (freezePlugin) {
                expect(freezePlugin.active).toBe(true);
                expect(dv.active).toBe(true);
            }
        });

        test('应该能够与 SortPlugin 共存', () => {
            const sortPlugin = workbook.getPlugin('sort');
            if (sortPlugin) {
                expect(sortPlugin.active).toBe(true);
                expect(dv.active).toBe(true);
            }
        });
    });
});

describe('DataValidationPlugin - 真实业务场景测试', () => {
    let workbook;
    let container2;

    beforeEach(() => {
        container2 = document.createElement('div');
        const canvas = document.createElement('canvas');
        container2.appendChild(canvas);
        document.body.appendChild(container2);

        workbook = new Workbook(container2, {
            plugins: ['dataValidation'],
            sheets: [{
                name: '订单管理',
                data: [
                    ['ORD-001', '产品A', 10, 99.9, '2024-01-15'],
                    ['ORD-002', '产品B', 5, 199.9, '2024-01-16'],
                    ['ORD-003', '产品C', 20, 49.9, '2024-01-17']
                ],
                colHeaders: ['订单号', '产品名称', '数量', '单价', '日期']
            }]
        });
    });

    afterEach(() => {
        workbook?.destroy?.();
        if (container2 && document.body.contains(container2)) {
            document.body.removeChild(container2);
        }
    });

    test('电商订单数据完整性校验', async () => {
        const dv = workbook.getPlugin('dataValidation');

        dv.setValidation({
            range: 'A2:A1000',
            type: 'unique',
            errorMessage: '订单号不能重复！'
        });

        dv.setValidation({
            range: 'C2:C1000',
            type: 'number',
            operator: 'between',
            value: [1, 999],
            allowBlank: false,
            errorMessage: '数量必须在 1-999 之间'
        });

        dv.setValidation({
            range: 'D2:D1000',
            type: 'number',
            operator: 'greaterThan',
            value: 0,
            errorMessage: '单价必须大于 0'
        });

        const orderUnique = await dv.validateCell(3, 0, 'ORD-001'); // 重复订单号
        expect(orderUnique.valid).toBe(false);

        const quantityValid = await dv.validateCell(0, 2, 50);
        expect(quantityValid.valid).toBe(true);

        const quantityInvalid = await dv.validateCell(0, 2, 0);
        expect(quantityInvalid.valid).toBe(false);

        const priceValid = await dv.validateCell(0, 3, 299.9);
        expect(priceValid.valid).toBe(true);

        const priceInvalid = await dv.validateCell(0, 3, -10);
        expect(priceInvalid.valid).toBe(false);
    });
});