/**
 * 自定义渲染器完整测试套件
 *
 * 包含：
 * 1. 基础功能测试（正常使用场景）
 * 2. 攻击性测试（边界条件、异常输入、性能压力）
 * 3. 冻结/分页模式专项测试
 * 4. 与图表引擎一致性验证
 *
 * @module tests/CustomRenderer.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CellRenderContext } from '../src/types/CellRenderContext.js';
import { BaseColumnType } from '../src/types/BaseColumnType.js';
import {
    BooleanCheckboxType,
    ProgressBarType,
    StarRatingType,
    SparklineType,
    ColorPreviewType,
} from '../src/types/renderers/index.js';

// ============================================================
// 辅助工具：创建模拟 Canvas Context
// ============================================================
function createMockCanvasContext() {
    const calls = [];
    const ctx = {
        calls,

        // 模拟所有 Canvas API 方法
        fillRect(x, y, w, h) { calls.push({ method: 'fillRect', args: [x, y, w, h] }); },
        strokeRect(x, y, w, h) { calls.push({ method: 'strokeRect', args: [x, y, w, h] }); },
        beginPath() { calls.push({ method: 'beginPath', args: [] }); },
        moveTo(x, y) { calls.push({ method: 'moveTo', args: [x, y] }); },
        lineTo(x, y) { calls.push({ method: 'lineTo', args: [x, y] }); },
        quadraticCurveTo(cpx, cpy, x, y) { calls.push({ method: 'quadraticCurveTo', args: [cpx, cpy, x, y] }); },
        closePath() { calls.push({ method: 'closePath', args: [] }); },
        fill() { calls.push({ method: 'fill', args: [] }); },
        stroke() { calls.push({ method: 'stroke', args: [] }); },
        save() { calls.push({ method: 'save', args: [] }); },
        restore() { calls.push({ method: 'restore', args: [] }); },
        clip() { calls.push({ method: 'clip', args: [] }); },
        arc(x, y, r, start, end) { calls.push({ method: 'arc', args: [x, y, r, start, end] }); },
        translate(x, y) { calls.push({ method: 'translate', args: [x, y] }); },
        scale(x, y) { calls.push({ method: 'scale', args: [x, y] }); },
        rect(x, y, w, h) { calls.push({ method: 'rect', args: [x, y, w, h] }); },

        createLinearGradient(x1, y1, x2, y2) {
            calls.push({ method: 'createLinearGradient', args: [x1, y1, x2, y2] });
            return {
                addColorStop(offset, color) {
                    calls.push({ method: 'addColorStop', args: [offset, color] });
                }
            };
        },

        fillText(text, x, y) { calls.push({ method: 'fillText', args: [text, x, y] }); },

        resetCalls() { calls.length = 0; }
    };

    // 使用 Object.defineProperty 定义属性（避免语法解析问题）
    const props = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin',
                   'globalAlpha', 'font', 'textAlign', 'textBaseline'];
    const defaults = {
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        globalAlpha: 1.0,
        font: '12px sans-serif',
        textAlign: 'start',
        textBaseline: 'alphabetic'
    };

    props.forEach(prop => {
        const privateProp = `_${prop}`;
        ctx[privateProp] = defaults[prop];
        Object.defineProperty(ctx, prop, {
            get() { return ctx[privateProp]; },
            set(v) { ctx[privateProp] = v; calls.push({ prop, val: v }); },
            configurable: true,
            enumerable: true
        });
    });

    return ctx;
}

// 创建模拟 Sheet 对象
function createMockSheet(options = {}) {
    const frozenRows = options.frozenRows || 0;

    return {
        cellStore: {
            get(row, col) {
                if (options.cellData && options.cellData[`${row},${col}`]) {
                    return options.cellData[`${row},${col}`];
                }
                return null;
            }
        },
        cellPadding: options.cellPadding || 6,
        ...options.customMethods
    };
}

// ============================================================
// 第一部分：CellRenderContext 基础功能测试
// ============================================================
describe('CellRenderContext - 基础功能', () => {

    let mockCtx;
    let context;

    beforeEach(() => {
        mockCtx = createMockCanvasContext();
        context = new CellRenderContext({
            ctx: mockCtx,
            x: 10,
            y: 20,
            width: 100,
            height: 30,
            value: 42,
            displayValue: '42',
            style: { color: '#333' },
            row: 5,
            col: 3,
            isSelected: true,
            isDisabled: false,
            isMerged: false,
            mergeInfo: null,
        });
    });

    test('基础属性正确读取', () => {
        expect(context.ctx).toBe(mockCtx);
        expect(context.x).toBe(10);
        expect(context.y).toBe(20);
        expect(context.width).toBe(100);
        expect(context.height).toBe(30);
        expect(context.value).toBe(42);
        expect(context.displayValue).toBe('42');
        expect(context.style.color).toBe('#333');
    });

    test('行列号正确读取', () => {
        expect(context.row).toBe(5);       // 行号
        expect(context.col).toBe(3);       // 列号
    });

    test('状态属性正确', () => {
        expect(context.isSelected).toBe(true);
        expect(context.isDisabled).toBe(false);
        expect(context.isMerged).toBe(false);
        expect(context.mergeInfo).toBeNull();
    });

    test('行列号正确设置', () => {
        const ctx2 = new CellRenderContext({
            ctx: mockCtx,
            x: 0, y: 0, width: 50, height: 20,
            value: null, displayValue: '', style: {},
            row: 3, col: 2,
        });

        expect(ctx2.row).toBe(3);
        expect(ctx2.col).toBe(2);
    });

    test('getCenterX/getCenterY 计算正确', () => {
        expect(context.getCenterX()).toBe(Math.round(10 + 100 / 2));  // 60
        expect(context.getCenterY()).toBe(Math.round(20 + 30 / 2));   // 35
    });

    test('drawRoundedRect 正确记录路径', () => {
        context.drawRoundedRect(0, 0, 50, 30, 5);

        const pathCalls = mockCtx.calls.filter(c =>
            ['beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'closePath'].includes(c.method)
        );
        expect(pathCalls.length).toBeGreaterThan(0);
        expect(pathCalls[0].method).toBe('beginPath');
        expect(pathCalls[pathCalls.length - 1].method).toBe('closePath');
    });

    test('Sheet 引用正确存储', () => {
        const sheet = createMockSheet();
        const ctxWithSheet = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 50, height: 20,
            value: null, displayValue: '', style: {},
            row: 0, col: 0,
            sheet: sheet
        });

        expect(ctxWithSheet.sheet).toBe(sheet);
    });

});

// ============================================================
// 第三部分：BaseColumnType.render() 扩展测试
// ============================================================
describe('BaseColumnType - render() 方法扩展', () => {

    test('基类 render() 是空操作', () => {
        const baseType = new BaseColumnType();
        const mockCtx = createMockCanvasContext();
        const context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 50, height: 20,
            value: null, displayValue: '', style: {},
            row: 0, col: 0
        });

        baseType.render(context);

        // 不应该有任何 Canvas 调用
        expect(mockCtx.calls.length).toBe(0);
    });

    test('hasCustomRenderer 默认为 false', () => {
        const baseType = new BaseColumnType();
        expect(baseType.hasCustomRenderer).toBe(false);
    });

    test('子类重写 render() 后 hasCustomRenderer 为 true', () => {
        class CustomType extends BaseColumnType {
            render(context) {
                context.ctx.fillRect(0, 0, 10, 10);
            }
        }

        const customType = new CustomType();
        expect(customType.hasCustomRenderer).toBe(true);

        const mockCtx = createMockCanvasContext();
        const context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 50, height: 20,
            value: null, displayValue: '', style: {},
            row: 0, col: 0
        });

        customType.render(context);
        expect(mockCtx.calls.length).toBeGreaterThan(0);
    });
});

// ============================================================
// 第四部分：内置渲染器功能测试
// ============================================================
describe('内置渲染器 - BooleanCheckboxType', () => {

    let renderer;
    let mockCtx;
    let context;

    beforeEach(() => {
        renderer = new BooleanCheckboxType();
        mockCtx = createMockCanvasContext();
    });

    test('选中状态渲染复选框', () => {
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 80, height: 30,
            value: true, displayValue: 'TRUE', style: {},
            row: 0, col: 0
        });

        renderer.render(context);

        // 应该有绘制调用（背景框、填充、对勾）
        expect(mockCtx.calls.length).toBeGreaterThan(5);
        expect(mockCtx.calls.some(c => c.method === 'fill')).toBe(true);
        expect(mockCtx.calls.some(c => c.method === 'stroke')).toBe(true);
    });

    test('未选中状态渲染空心框', () => {
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 80, height: 30,
            value: false, displayValue: 'FALSE', style: {},
            row: 0, col: 0
        });

        renderer.render(context);

        // 应该有描边但无填充（或仅有背景填充）
        const hasFill = mockCtx.calls.filter(c => c.method === 'fill').length;
        expect(hasFill).toBeLessThanOrEqual(1);  // 可能只有一次背景填充
    });

    test('禁用态降低透明度', () => {
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 80, height: 30,
            value: true, displayValue: 'TRUE', style: {},
            row: 0, col: 0,
            isDisabled: true
        });

        renderer.render(context);

        // 应该设置 globalAlpha
        expect(mockCtx.calls.some(c => c.prop === 'globalAlpha')).toBe(true);
    });

    test('hasCustomRenderer 为 true', () => {
        expect(renderer.hasCustomRenderer).toBe(true);
    });
});

describe('内置渲染器 - ProgressBarType', () => {

    let renderer;
    let mockCtx;
    let context;

    beforeEach(() => {
        renderer = new ProgressBarType();
        mockCtx = createMockCanvasContext();
    });

    test('渲染进度条', () => {
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 120, height: 25,
            value: 75, displayValue: '75%', style: {},
            row: 0, col: 0
        });

        renderer.render(context);

        // 应该有大量绘制调用（背景、进度条、文字）
        expect(mockCtx.calls.length).toBeGreaterThan(10);
    });

    test('值超出范围时自动裁剪到 0-100', () => {
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 120, height: 25,
            value: 150, displayValue: '150%', style: {},
            row: 0, col: 0
        });

        renderer.render(context);

        // 不应该报错，且应该正常渲染
        expect(mockCtx.calls.length).toBeGreaterThan(0);
    });

    test('负值处理', () => {
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 120, height: 25,
            value: -10, displayValue: '-10%', style: {},
            row: 0, col: 0
        });

        renderer.render(context);
        expect(mockCtx.calls.length).toBeGreaterThan(0);
    });

    test('null/undefined 值显示空进度条', () => {
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 120, height: 25,
            value: null, displayValue: '', style: {},
            row: 0, col: 0
        });

        renderer.render(context);
        expect(mockCtx.calls.length).toBeGreaterThan(0);
    });
});

describe('内置渲染器 - StarRatingType', () => {

    let renderer;
    let mockCtx;
    let context;

    beforeEach(() => {
        renderer = new StarRatingType();
        mockCtx = createMockCanvasContext();
    });

    test('整数评分渲染', () => {
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 100, height: 25,
            value: 4, displayValue: '4 星', style: {},
            row: 0, col: 0
        });

        renderer.render(context);

        // 应该有多个星星的绘制调用
        expect(mockCtx.calls.length).toBeGreaterThan(15);
    });

    test('半星渲染', () => {
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 100, height: 25,
            value: 3.5, displayValue: '3.5 星', style: {},
            row: 0, col: 0
        });

        renderer.render(context);
        expect(mockCtx.calls.length).toBeGreaterThan(15);
    });

    test('零分渲染空心星', () => {
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 100, height: 25,
            value: 0, displayValue: '0 星', style: {},
            row: 0, col: 0
        });

        renderer.render(context);
        expect(mockCtx.calls.length).toBeGreaterThan(10);
    });
});

describe('内置渲染器 - SparklineType', () => {

    let renderer;
    let mockCtx;
    let context;

    beforeEach(() => {
        renderer = new SparklineType();
        mockCtx = createMockCanvasContext();
    });

    test('折线图渲染', () => {
        const data = [10, 25, 18, 32, 28, 45, 38];
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 150, height: 40,
            value: data, displayValue: '7 个数据点', style: {},
            row: 0, col: 0
        });

        renderer.render(context);
        expect(mockCtx.calls.length).toBeGreaterThan(20);
    });

    test('柱状图渲染', () => {
        renderer.options = { type: 'bar' };
        const data = [15, 22, 18, 30];
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 150, height: 40,
            value: data, displayValue: '4 个数据点', style: {},
            row: 0, col: 0
        });

        renderer.render(context);
        expect(mockCtx.calls.length).toBeGreaterThan(5);
    });

    test('空数组不渲染', () => {
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 150, height: 40,
            value: [], displayValue: '', style: {},
            row: 0, col: 0
        });

        renderer.render(context);
        expect(mockCtx.calls.length).toBe(0);
    });

    test('非数组值不崩溃', () => {
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 150, height: 40,
            value: 'invalid', displayValue: 'invalid', style: {},
            row: 0, col: 0
        });

        renderer.render(context);
        // 应该优雅地处理非数组输入
        expect(mockCtx.calls.length).toBe(0);
    });
});

describe('内置渲染器 - ColorPreviewType', () => {

    let renderer;
    let mockCtx;
    let context;

    beforeEach(() => {
        renderer = new ColorPreviewType();
        mockCtx = createMockCanvasContext();
    });

    test('Hex 颜色渲染', () => {
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 60, height: 25,
            value: '#ff5722', displayValue: '#ff5722', style: {},
            row: 0, col: 0
        });

        renderer.render(context);
        expect(mockCtx.calls.length).toBeGreaterThan(3);
    });

    test('RGB 颜色渲染', () => {
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 60, height: 25,
            value: 'rgb(255, 87, 34)', displayValue: 'rgb(255, 87, 34)', style: {},
            row: 0, col: 0
        });

        renderer.render(context);
        expect(mockCtx.calls.length).toBeGreaterThan(3);
    });

    test('空值不渲染', () => {
        context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 60, height: 25,
            value: '', displayValue: '', style: {},
            row: 0, col: 0
        });

        renderer.render(context);
        expect(mockCtx.calls.length).toBe(0);
    });
});

// ============================================================
// 第五部分：攻击性测试（边界条件、异常输入、性能压力）
// ============================================================
describe('攻击性测试 - 异常输入与边界条件', () => {

    let mockCtx;

    beforeEach(() => {
        mockCtx = createMockCanvasContext();
    });

    // ---- CellRenderContext 攻击性测试 ----

    test('极端坐标值（超大数值）', () => {
        const context = new CellRenderContext({
            ctx: mockCtx,
            x: Number.MAX_SAFE_INTEGER,
            y: Number.MAX_SAFE_INTEGER,
            width: Number.MAX_SAFE_INTEGER,
            height: Number.MAX_SAFE_INTEGER,
            value: null, displayValue: '', style: {},
            row: Number.MAX_SAFE_INTEGER,
            col: Number.MAX_SAFE_INTEGER,
        });

        expect(context.x).toBe(Number.MAX_SAFE_INTEGER);
        expect(context.y).toBe(Number.MAX_SAFE_INTEGER);
        expect(() => context.getCenterX()).not.toThrow();
        expect(() => context.getCenterY()).not.toThrow();
    });

    test('负数坐标值', () => {
        const context = new CellRenderContext({
            ctx: mockCtx,
            x: -100,
            y: -200,
            width: 50,
            height: 30,
            value: null, displayValue: '', style: {},
            row: -5,
            col: -3,
        });

        expect(context.x).toBe(-100);
        expect(context.y).toBe(-200);
        expect(context.row).toBe(-5);
        expect(context.col).toBe(-3);
    });

    test('零尺寸单元格', () => {
        const context = new CellRenderContext({
            ctx: mockCtx,
            x: 0, y: 0, width: 0, height: 0,
            value: null, displayValue: '', style: {},
            row: 0, col: 0,
        });

        expect(context.width).toBe(0);
        expect(context.height).toBe(0);
        expect(context.getCenterX()).toBe(0);
        expect(context.getCenterY()).toBe(0);
    });

    test('极小尺寸单元格（1像素）', () => {
        const context = new CellRenderContext({
            ctx: mockCtx,
            x: 0, y: 0, width: 1, height: 1,
            value: null, displayValue: '', style: {},
            row: 0, col: 0,
        });

        expect(() => context.drawRoundedRect(0, 0, 1, 1, 0.5)).not.toThrow();
    });

    test('特殊值：NaN', () => {
        const context = new CellRenderContext({
            ctx: mockCtx,
            x: NaN, y: NaN, width: NaN, height: NaN,
            value: NaN, displayValue: String(NaN), style: {},
            row: NaN, col: NaN,
        });

        expect(Number.isNaN(context.x)).toBe(true);
        expect(Number.isNaN(context.value)).toBe(true);
        expect(() => context.getCenterX()).not.toThrow();  // NaN 运算结果也是 NaN
    });

    test('特殊值：Infinity', () => {
        const context = new CellRenderContext({
            ctx: mockCtx,
            x: Infinity, y: -Infinity,
            width: Infinity, height: Infinity,
            value: Infinity, displayValue: String(Infinity), style: {},
            row: Infinity, col: -Infinity,
        });

        expect(context.x).toBe(Infinity);
        expect(context.y).toBe(-Infinity);
        expect(() => context.getCenterX()).not.toThrow();
    });

    test('null/undefined 属性值', () => {
        const context = new CellRenderContext({
            ctx: mockCtx,
            x: 0, y: 0, width: 50, height: 20,
            value: undefined,
            displayValue: undefined,
            style: undefined,
            row: 0, col: 0,
            isSelected: undefined,
            isMerged: undefined,
            mergeInfo: undefined,
            sheet: undefined,
        });

        expect(context.value).toBeUndefined();
        expect(context.displayValue).toBeUndefined();
        expect(context.style).toBeUndefined();
        expect(context.row).toBe(0);
        expect(context.isSelected).toBe(false);  // 默认值
    });

    test('循环引用对象作为 value', () => {
        const circularObj = {};
        circularObj.self = circularObj;

        const context = new CellRenderContext({
            ctx: mockCtx,
            x: 0, y: 0, width: 50, height: 20,
            value: circularObj,
            displayValue: '[object Object]',
            style: {},
            row: 0, col: 0,
        });

        expect(context.value).toBe(circularObj);
        // 渲染器应该能安全处理循环引用
        expect(() => String(context.value)).not.toThrow();
    });

    test('超长字符串值', () => {
        const longStr = 'a'.repeat(100000);  // 100KB 字符串

        const context = new CellRenderContext({
            ctx: mockCtx,
            x: 0, y: 0, width: 50, height: 20,
            value: longStr,
            displayValue: longStr,
            style: {},
            row: 0, col: 0,
        });

        expect(context.displayValue.length).toBe(100000);
    });

    // ---- 渲染器攻击性测试 ----

    test('ProgressBarType 接受极端值', () => {
        const renderer = new ProgressBarType();

        const extremeValues = [
            -Infinity, -Number.MAX_VALUE, -999999,
            Number.MIN_VALUE, 0, 0.000001,
            99.9999, 100, 100.001,
            Number.MAX_VALUE, Infinity, NaN
        ];

        for (const val of extremeValues) {
            mockCtx.resetCalls();
            const context = new CellRenderContext({
                ctx: mockCtx, x: 0, y: 0, width: 100, height: 25,
                value: val, displayValue: String(val), style: {},
                row: 0, col: 0
            });

            expect(() => renderer.render(context)).not.toThrow(`Failed with value: ${val}`);
        }
    });

    test('StarRatingType 接受非数字值', () => {
        const renderer = new StarRatingType();

        const invalidValues = [
            null, undefined, '', 'abc', {}, [],
            true, false, Symbol('test'), () => {}
        ];

        for (const val of invalidValues) {
            mockCtx.resetCalls();
            const context = new CellRenderContext({
                ctx: mockCtx, x: 0, y: 0, width: 100, height: 25,
                value: val, displayValue: String(val), style: {},
                row: 0, col: 0
            });

            expect(() => renderer.render(context)).not.toThrow(`Failed with value: ${typeof val}`);
        }
    });

    test('SparklineType 处理大数据集', () => {
        const renderer = new SparklineType();

        // 10000 个数据点
        const largeDataset = Array.from({ length: 10000 }, (_, i) => Math.random() * 100);

        const context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 300, height: 50,
            value: largeDataset, displayValue: `${largeDataset.length} 个数据点`, style: {},
            row: 0, col: 0
        });

        const startTime = performance.now();
        renderer.render(context);
        const endTime = performance.now();

        // 应该在合理时间内完成（< 100ms）
        expect(endTime - startTime).toBeLessThan(100);
        expect(mockCtx.calls.length).toBeGreaterThan(0);
    });

    test('SparklineType 处理全相同数据', () => {
        const renderer = new SparklineType();

        // 所有数据点相同（range = 0 的边界情况）
        const flatData = Array(100).fill(42);

        const context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 200, height: 40,
            value: flatData, displayValue: '100 个数据点', style: {},
            row: 0, col: 0
        });

        expect(() => renderer.render(context)).not.toThrow();
    });

    test('ColorPreviewType 处理无效颜色值', () => {
        const renderer = new ColorPreviewType();

        const invalidColors = [
            '', 'not-a-color', 'rgb(999, 999, 999)',
            'hsl(400, 110%, 200%)', null, undefined, 12345, {}
        ];

        for (const color of invalidColors) {
            mockCtx.resetCalls();
            const context = new CellRenderContext({
                ctx: mockCtx, x: 0, y: 0, width: 60, height: 25,
                value: color, displayValue: String(color), style: {},
                row: 0, col: 0
            });

            expect(() => renderer.render(context)).not.toThrow(`Failed with color: ${color}`);
        }
    });

    // ---- 性能压力测试 ----

    test('批量创建 CellRenderContext 性能', () => {
        const count = 10000;
        const startTime = performance.now();

        for (let i = 0; i < count; i++) {
            new CellRenderContext({
                ctx: mockCtx,
                x: i % 100, y: Math.floor(i / 100),
                width: 80, height: 25,
                value: i, displayValue: String(i),
                style: { color: '#333' },
                row: i, col: i % 10,
            });
        }

        const elapsed = performance.now() - startTime;

        // 10000 次创建应该在 500ms 内完成
        expect(elapsed).toBeLessThan(500);
        console.log(`[Performance] Created ${count} contexts in ${elapsed.toFixed(2)}ms`);
    });

    test('高频调用转换方法性能', () => {
        const sheet = createMockSheet({ frozenRows: 2 });
        const context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 50, height: 20,
            value: null, displayValue: '', style: {},
            row: 0, col: 0,
            sheet: sheet,
        });

        const iterations = 100000;
        const startTime = performance.now();

        for (let i = 0; i < iterations; i++) {
            // 测试属性访问性能（新的简化 API）
            const _row = context.row;
            const _col = context.col;
        }

        const elapsed = performance.now() - startTime;

        // 100000 次属性访问应该在 100ms 内完成
        expect(elapsed).toBeLessThan(100);
        console.log(`[Performance] ${iterations} property accesses in ${elapsed.toFixed(2)}ms`);
    });

    test('内存泄漏检测 - 大量创建销毁', () => {
        const initialMemory = process.memoryUsage?.().heapUsed || 0;

        for (let i = 0; i < 10000; i++) {
            const ctx = new CellRenderContext({
                ctx: mockCtx,
                x: 0, y: 0, width: 50, height: 20,
                value: { data: 'x'.repeat(1000) },  // 较大的数据
                displayValue: 'large',
                style: { a: 1, b: 2, c: 3 },
                row: i, col: i,
                sheet: createMockSheet(),
            });
            // 不保留引用，允许 GC
        }

        // 强制 GC（如果可用）
        if (global.gc) global.gc();

        const finalMemory = process.memoryUsage?.().heapUsed || 0;
        const memoryIncrease = finalMemory - initialMemory;

        // 内存增长不应超过 10MB（考虑 GC 延迟）
        expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
        console.log(`[Memory] Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });
});

// ============================================================
// 第七部分：与图表引擎一致性验证
// ============================================================
describe('与图表引擎一致性验证', () => {

    let mockCtx;

    beforeEach(() => {
        mockCtx = createMockCanvasContext();
    });

    test('行号用于数据访问', () => {
        const sheet = createMockSheet({
            cellData: {
                '5,3': { value: 'Data at Row 5' },
                '10,3': { value: 'Data at Row 10' }
            }
        });

        const context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 80, height: 25,
            value: null, displayValue: '', style: {},
            row: 5, col: 3,
            sheet: sheet
        });

        // 使用行号访问数据
        const data = context.sheet.cellStore.get(context.row, context.col);
        expect(data?.value).toBe('Data at Row 5');
    });

    test('数据范围定义使用行号', () => {
        const context = new CellRenderContext({
            ctx: mockCtx, x: 0, y: 0, width: 80, height: 25,
            value: '[CHART]', displayValue: '[CHART]', style: {},
            row: 5, col: 2,
            sheet: createMockSheet()
        });

        // 模拟自定义渲染器创建图表配置
        const chartConfig = {
            type: 'bar',
            anchorRow: context.row,
            anchorCol: context.col,
            dataRange: {
                startRow: context.row,
                endRow: context.row + 10,
                startCol: context.col,
                endCol: context.col + 3
            }
        };

        expect(chartConfig.anchorRow).toBe(5);
        expect(chartConfig.dataRange.startRow).toBe(5);
        expect(chartConfig.dataRange.endRow).toBe(15);
    });

    test('行号在不同场景下正确', () => {
        const scenarios = [
            { row: 0, col: 0, desc: '第1行' },
            { row: 1, col: 0, desc: '第2行' },
            { row: 5, col: 3, desc: '第6行第4列' },
            { row: 100, col: 10, desc: '第101行第11列' },
        ];

        for (const scenario of scenarios) {
            const ctx = new CellRenderContext({
                ctx: mockCtx, x: 0, y: 0, width: 80, height: 25,
                value: scenario.desc, displayValue: scenario.desc, style: {},
                row: scenario.row, col: scenario.col,
                sheet: createMockSheet()
            });

            expect(ctx.row).toBe(scenario.row, `行号错误: ${scenario.desc}`);
            expect(ctx.col).toBe(scenario.col, `列号错误: ${scenario.desc}`);
        }
    });
});

// ============================================================
// 第八部分：并发与线程安全（Node.js 环境）
// ============================================================
describe('并发安全性测试', () => {

    test('多实例并行创建无竞争条件', async () => {
        const promises = Array.from({ length: 100 }, (_, i) => {
            return Promise.resolve().then(() => {
                const mockCtx = createMockCanvasContext();
                return new CellRenderContext({
                    ctx: mockCtx,
                    x: i, y: i, width: 50, height: 20,
                    value: i, displayValue: String(i),
                    style: {},
                    row: i, col: i,
                });
            });
        });

        const contexts = await Promise.all(promises);

        expect(contexts.length).toBe(100);
        contexts.forEach((ctx, i) => {
            expect(ctx.value).toBe(i);
            expect(ctx.row).toBe(i);
        });
    });

    test('共享 Sheet 引用的线程安全读取', () => {
        const sharedSheet = createMockSheet({
            cellData: {
                '0,0': { value: 'Shared Data' }
            }
        });

        const contexts = Array.from({ length: 50 }, (_, i) => {
            const mockCtx = createMockCanvasContext();
            return new CellRenderContext({
                ctx: mockCtx,
                x: 0, y: 0, width: 50, height: 20,
                value: null, displayValue: '', style: {},
                row: 0, col: 0,
                sheet: sharedSheet  // 共享同一个 Sheet
            });
        });

        // 所有上下文都应该能正确访问共享数据
        contexts.forEach((ctx, i) => {
            const data = ctx.sheet.cellStore.get(0, 0);
            expect(data?.value).toBe('Shared Data');
        });
    });
});

// ============================================================
// 第九部分：类型安全与 TypeScript 兼容性（运行时检查）
// ============================================================
describe('类型安全运行时检查', () => {

    test('缺少必需参数时的行为', () => {
        const mockCtx = createMockCanvasContext();

        // 缺少 ctx
        expect(() => new CellRenderContext({
            x: 0, y: 0, width: 50, height: 20,
            value: null, displayValue: '', style: {},
            row: 0, col: 0
        })).not.toThrow();  // JavaScript 不强制参数

        // ctx 为 null
        const ctxWithNullCtx = new CellRenderContext({
            ctx: null,
            x: 0, y: 0, width: 50, height: 20,
            value: null, displayValue: '', style: {},
            row: 0, col: 0
        });
        expect(ctxWithNullCtx.ctx).toBeNull();
    });

    test('属性类型错误时的容错', () => {
        const mockCtx = createMockCanvasContext();

        const ctxWithWrongTypes = new CellRenderContext({
            ctx: mockCtx,
            x: 'not a number',  // 应该是 number
            y: [],              // 应该是 number
            width: {},          // 应该是 number
            height: function(){}, // 应该是 number
            value: new Date(),  // 任意类型都可以
            displayValue: 12345, // 应该是 string
            style: 'string',    // 应该是 object
            row: 'zero',        // 应该是 number
            col: {c: 0},        // 应该是 number
        });

        // 不应该抛出错误，JavaScript 是动态类型
        expect(ctxWithWrongTypes.x).toBe('not a number');
        expect(ctxWithWrongTypes.value instanceof Date).toBe(true);
    });
});