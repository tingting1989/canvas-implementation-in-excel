import { describe, test, expect, beforeEach } from 'vitest';
import {
    FormulaValidator,
    DateValidator,
    TimeValidator,
    RegexValidator,
    ValidationRule,
    ValidationResult
} from '../../../src/plugins/data-validation/index.js';

describe('Phase 2 验证器 - 完整功能测试', () => {

    describe('FormulaValidator（自定义公式验证）', () => {
        let validator;
        let mockFormulaEngine;


        beforeEach(() => {
            mockFormulaEngine = {
                evaluateForValidation: async (formula, context) => {
                    if (formula === '=A1>0') return context.value > 0;
                    if (formula === '=AND(A1>0,B1<>"")') return context.value > 0 && context.value !== '';
                    if (formula === '=LEN(A1)>=5') return String(context.value).length >= 5;
                    return false;
                }
            };
            validator = new FormulaValidator(mockFormulaEngine);
        });

        test('应该验证简单公式', async () => {
            const rule = new ValidationRule({
                type: 'custom',
                formula: '=A1>0'
            });

            const validResult = await validator.validate(50, rule, { row: 0, col: 0 });
            expect(validResult.valid).toBe(true);

            const invalidResult = await validator.validate(-5, rule, { row: 0, col: 0 });
            expect(invalidResult.valid).toBe(false);
            expect(invalidResult.message).toContain('FALSE');
        });

        test('应该验证复合公式', async () => {
            const rule = new ValidationRule({
                type: 'custom',
                formula: '=AND(A1>0,B1<>"")',
                errorMessage: '值必须大于 0 且不为空'
            });

            const validResult = await validator.validate(100, rule, { row: 0, col: 0 });
            expect(validResult.valid).toBe(true);

            const invalidResult = await validator.validate(0, rule, { row: 0, col: 0 });
            expect(invalidResult.valid).toBe(false);
        });

        test('空值处理', async () => {
            const rule = new ValidationRule({
                type: 'custom',
                formula: '=A1>0',
                allowBlank: true
            });

            const result = await validator.validate(null, rule);
            expect(result.valid).toBe(true);

            rule.allowBlank = false;
            const result2 = await validator.validate(null, rule);
            expect(result2.valid).toBe(false);
        });

        test('FormulaEngine 未初始化时应该返回错误', async () => {
            const validatorNoEngine = new FormulaValidator(null);
            const rule = new ValidationRule({ type: 'custom', formula: '=A1>0' });

            const result = await validatorNoEngine.validate(50, rule);
            expect(result.valid).toBe(false);
            expect(result.message).toContain('未初始化');
        });
    });

    describe('DateValidator（日期范围验证）', () => {
        let validator;

        beforeEach(() => {
            validator = new DateValidator();
        });

        test('between 运算符', async () => {
            const rule = new ValidationRule({
                type: 'date',
                operator: 'between',
                value: ['2024-01-01', '2024-12-31']
            });

            expect((await validator.validate(new Date('2024-06-25'), rule)).valid).toBe(true);
            expect((await validator.validate(new Date('2023-12-31'), rule)).valid).toBe(false);
            expect((await validator.validate(new Date('2025-01-01'), rule)).valid).toBe(false);
        });

        test('before/after 运算符', async () => {
            const beforeRule = new ValidationRule({
                type: 'date',
                operator: 'before',
                value: '2024-07-01'
            });

            expect((await validator.validate(new Date('2024-06-01'), beforeRule)).valid).toBe(true);
            expect((await validator.validate(new Date('2024-08-01'), beforeRule)).valid).toBe(false);

            const afterRule = new ValidationRule({
                type: 'date',
                operator: 'after',
                value: '2024-01-01'
            });

            expect((await validator.validate(new Date('2024-06-25'), afterRule)).valid).toBe(true);
            expect((await validator.validate(new Date('2023-12-31'), afterRule)).valid).toBe(false);
        });

        test('字符串日期解析', async () => {
            const rule = new ValidationRule({
                type: 'date',
                operator: 'between',
                value: ['2024-01-01', '2024-12-31']
            });

            expect((await validator.validate('2024-06-15', rule)).valid).toBe(true);
            expect((await validator.validate('2025-01-01', rule)).valid).toBe(false);
        });

        test('无效日期格式', async () => {
            const rule = new ValidationRule({
                type: 'date',
                operator: 'after',
                value: '2024-01-01'
            });

            const result = await validator.validate('不是日期', rule);
            expect(result.valid).toBe(false);
            expect(result.message).toContain('有效的日期');
        });
    });

    describe('TimeValidator（时间范围验证）', () => {
        let validator;

        beforeEach(() => {
            validator = new TimeValidator();
        });

        test('between 运算符', async () => {
            const rule = new ValidationRule({
                type: 'time',
                operator: 'between',
                value: ['09:00', '18:00']
            });

            expect((await validator.validate('14:30', rule)).valid).toBe(true);
            expect((await validator.validate('08:59', rule)).valid).toBe(false);
            expect((await validator.validate('18:01', rule)).valid).toBe(false);
        });

        test('before/after 运算符', async () => {
            const beforeRule = new ValidationRule({
                type: 'time',
                operator: 'before',
                value: '12:00'
            });

            expect((await validator.validate('11:59', beforeRule)).valid).toBe(true);
            expect((await validator.validate('12:00', beforeRule)).valid).toBe(false);

            const afterRule = new ValidationRule({
                type: 'time',
                operator: 'after',
                value: '09:00'
            });

            expect((await validator.validate('09:01', afterRule)).valid).toBe(true);
            expect((await validator.validate('08:59', afterRule)).valid).toBe(false);
        });

        test('支持秒数格式 HH:mm:ss', async () => {
            const rule = new ValidationRule({
                type: 'time',
                operator: 'between',
                value: ['09:00:00', '17:30:00']
            });

            expect((await validator.validate('14:30:45', rule)).valid).toBe(true);
            expect((await validator.validate('17:30:01', rule)).valid).toBe(false);
        });

        test('无效时间格式', async () => {
            const rule = new ValidationRule({
                type: 'time',
                operator: 'between',
                value: ['09:00', '18:00']
            });

            expect((await validator.validate('25:00', rule)).valid).toBe(false);
            expect((await validator.validate('abc', rule)).valid).toBe(false);
        });
    });

    describe('RegexValidator（正则表达式验证）', () => {
        let validator;

        beforeEach(() => {
            validator = new RegexValidator();
        });

        test('邮箱验证', async () => {
            const rule = new ValidationRule({
                type: 'regex',
                pattern: 'email',
                errorMessage: '请输入有效的邮箱地址'
            });

            expect((await validator.validate('user@example.com', rule)).valid).toBe(true);
            expect((await validator.validate('invalid-email', rule)).valid).toBe(false);
        });

        test('中国手机号验证', async () => {
            const rule = new ValidationRule({
                type: 'regex',
                pattern: 'phoneCN',
                errorMessage: '请输入有效的手机号码'
            });

            expect((await validator.validate('13812345678', rule)).valid).toBe(true);
            expect((await validator.validate('12345678901', rule)).valid).toBe(false); // 第二位不是 3-9
            expect((await validator.validate('1381234567', rule)).valid).toBe(false); // 只有10位
        });

        test('自定义正则表达式', async () => {
            const rule = new ValidationRule({
                type: 'regex',
                pattern: '^\\d{4}-\\d{4}-\\d{4}-\\d{4}$',
                errorMessage: '请输入正确的银行卡号格式（16位数字，每4位一组）'
            });

            expect((await validator.validate('1234-5678-9012-3456', rule)).valid).toBe(true);
            expect((await validator.validate('1234-5678-9012-345', rule)).valid).toBe(false);
        });

        test('预设模式：用户名、密码强度', async () => {
            const usernameRule = new ValidationRule({ type: 'regex', pattern: 'username' });
            expect((await validator.validate('john_doe123', usernameRule)).valid).toBe(true);
            expect((await validator.validate('ab', usernameRule)).valid).toBe(false); // 太短
            expect((await validator.validate('a@b', usernameRule)).valid).toBe(false); // 包含特殊字符

            const passwordRule = new ValidationRule({ type: 'regex', pattern: 'passwordStrong' });
            expect((await validator.validate('Abc123!@x', passwordRule)).valid).toBe(true);
            expect((await validator.validate('weak', passwordRule)).valid).toBe(false);
        });

        test('空值处理', async () => {
            const rule = new ValidationRule({
                type: 'regex',
                pattern: 'email',
                allowBlank: true
            });

            expect((await validator.validate(null, rule)).valid).toBe(true);

            rule.allowBlank = false;
            expect((await validator.validate('', rule)).valid).toBe(false);
        });

        test('非文本类型输入', async () => {
            const rule = new ValidationRule({ type: 'regex', pattern: '^\\d+$' });
            const result = await validator.validate(12345, rule);
            expect(result.valid).toBe(false);
            expect(result.message).toContain('只能用于文本类型');
        });
    });
});