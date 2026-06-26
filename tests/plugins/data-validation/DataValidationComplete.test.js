import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    DataValidationPlugin,
    ValidationRule,
    ValidationResult,
    ValidationEngine,
    BatchValidationCoordinator,
    BATCH_EVENTS,
    ValidationFormattingBridge,
    ValidationPortalManager,
    NumberValidator,
    TextLengthValidator,
    ListValidator,
    UniqueValidatorV3
} from '../../../src/plugins/data-validation/index.js';

// ═══════════════════════════════════════════════════════════════════
// Mock 工厂函数
// ═══════════════════════════════════════════════════════════════════

function createMockCellStore() {
    const cells = new Map();

    return {
        get: vi.fn((row, col) => cells.get(`${row},${col}`)),
        set: vi.fn((row, col, value) => cells.set(`${row},${col}`, value)),
        getAllValuesInRange: vi.fn((range) => {
            const values = [];
            for (const [key, cell] of cells) {
                values.push(cell.value);
            }
            return values;
        }),
        sheetName: 'Sheet1',
        _cells: cells
    };
}

function createMockEventBus() {
    const listeners = new Map();

    return {
        on: vi.fn((event, callback) => {
            if (!listeners.has(event)) listeners.set(event, []);
            listeners.get(event).push(callback);
        }),
        emit: vi.fn((event, data) => {
            if (listeners.has(event)) {
                listeners.get(event).forEach(cb => cb(data));
            }
        }),
        off: vi.fn((event, callback) => {
            if (listeners.has(event)) {
                const cbs = listeners.get(event);
                const idx = cbs.indexOf(callback);
                if (idx > -1) cbs.splice(idx, 1);
            }
        }),
        _listeners: listeners
    };
}

function createMockWorkbook() {
    return {
        formulaEngine: null,
        getPlugin: vi.fn(() => null),
        hooks: {
            call: vi.fn(),
            addHook: vi.fn()
        },
        activeSheet: {
            cellStore: createMockCellStore(),
            name: 'Sheet1'
        },
        renderEngine: {
            invalidateAll: vi.fn(),
            canvas: {
                getBoundingClientRect: () => ({ left: 0, top: 0 }),
                zoomLevel: 1
            },
            zoomLevel: 1
        },
        render: vi.fn(),
        destroy: vi.fn()
    };
}

// ═══════════════════════════════════════════════════════════════════
// Part 1: BatchValidationCoordinator 测试
// ═══════════════════════════════════════════════════════════════════

describe('BatchValidationCoordinator - 批量验证协调器', () => {
    let coordinator;
    let mockEngine;
    let eventBus;

    beforeEach(() => {
        eventBus = createMockEventBus();
        mockEngine = {
            validateCell: vi.fn().mockResolvedValue(ValidationResult.success())
        };
        coordinator = new BatchValidationCoordinator(mockEngine, eventBus);
    });

    afterEach(() => {
        coordinator.destroy();
    });

    describe('基础功能测试', () => {
        test('应该正确初始化', () => {
            expect(coordinator.isBatchMode).toBe(false);
            expect(coordinator.pendingCount).toBe(0);
        });

        test('进入批量模式应该正确设置状态', () => {
            coordinator.enterBatchMode('paste', 1000);

            expect(coordinator.isBatchMode).toBe(true);
            expect(coordinator.pendingCount).toBe(0);
            expect(eventBus.emit).toHaveBeenCalledWith(BATCH_EVENTS.BATCH_START, {
                operation: 'paste',
                estimatedCount: 1000
            });
        });

        test('重复进入批量模式应该抛出错误', () => {
            coordinator.enterBatchMode('paste', 100);

            expect(() => {
                coordinator.enterBatchMode('sort', 200);
            }).toThrow('已经在批量模式中');
        });

        test('非批量模式下调用 onCellChange 应该抛出错误', () => {
            expect(() => {
                coordinator.onCellChange(0, 0, 'value');
            }).toThrow('不在批量模式中');
        });
    });

    describe('队列管理测试', () => {
        test('批量模式下应该正确收集验证请求', () => {
            coordinator.enterBatchMode('paste', 100);

            coordinator.onCellChange(0, 0, 'value1');
            coordinator.onCellChange(0, 1, 'value2');
            coordinator.onCellChange(1, 0, 'value3');

            expect(coordinator.pendingCount).toBe(3);
        });

        test('退出批量模式应该执行所有待处理的验证', async () => {
            coordinator.enterBatchMode('paste', 100);

            coordinator.onCellChange(0, 0, 50);
            coordinator.onCellChange(0, 1, 150);
            coordinator.onCellChange(1, 0, 75);

            const report = await coordinator.exitBatchMode();

            expect(mockEngine.validateCell).toHaveBeenCalledTimes(3);
            expect(report.totalChecked).toBe(3);
            expect(coordinator.isBatchMode).toBe(false);
        });

        test('取消操作不应该执行验证', () => {
            coordinator.enterBatchMode('paste', 100);

            coordinator.onCellChange(0, 0, 'value');

            coordinator.cancel();

            expect(coordinator.isBatchMode).toBe(false);
            expect(coordinator.pendingCount).toBe(0);
            expect(mockEngine.validateCell).not.toHaveBeenCalled();
        });

        test('空队列退出应该返回空报告', async () => {
            coordinator.enterBatchMode('sort', 50);

            const report = await coordinator.exitBatchMode();

            expect(report.totalChecked).toBe(0);
            expect(report.invalidCount).toBe(0);
            expect(report.violations.length).toBe(0);
        });
    });

    describe('批量处理测试', () => {
        test('大批量数据应该分批处理', async () => {
            coordinator.BATCH_SIZE = 10;

            coordinator.enterBatchMode('autofill', 500);

            for (let i = 0; i < 500; i++) {
                coordinator.onCellChange(Math.floor(i / 10), i % 10, `value_${i}`);
            }

            const report = await coordinator.exitBatchMode();

            expect(report.totalChecked).toBe(500);
            expect(eventBus.emit).toHaveBeenCalledWith(
                BATCH_EVENTS.BATCH_PROGRESS,
                expect.objectContaining({ processed: expect.any(Number) })
            );
        });

        test('验证失败应该记录到报告中', async () => {
            mockEngine.validateCell
                .mockResolvedValueOnce(ValidationResult.success())
                .mockResolvedValueOnce(ValidationResult.failure('超出范围', 'stop'))
                .mockResolvedValueOnce(ValidationResult.success());

            coordinator.enterBatchMode('paste', 10);

            coordinator.onCellChange(0, 0, 50);
            coordinator.onCellChange(0, 1, 200);
            coordinator.onCellChange(1, 0, 75);

            const report = await coordinator.exitBatchMode();

            expect(report.invalidCount).toBe(1);
            expect(report.violations).toHaveLength(1);
            expect(report.violations[0].message).toContain('超出范围');
        });

        test('验证异常应该被捕获并标记为警告', async () => {
            mockEngine.validateCell
                .mockRejectedValueOnce(new Error('验证引擎异常'));

            coordinator.enterBatchMode('paste', 5);

            coordinator.onCellChange(0, 0, 'value');

            const report = await coordinator.exitBatchMode();

            expect(report.invalidCount).toBe(1);
            expect(report.violations[0].message).toContain('验证异常');
        });
    });

    describe('事件触发测试', () => {
        test('应该发送进度事件', async () => {
            coordinator.BATCH_SIZE = 5;

            coordinator.enterBatchMode('paste', 20);

            for (let i = 0; i < 15; i++) {
                coordinator.onCellChange(0, i, `v${i}`);
            }

            await coordinator.exitBatchMode();

            expect(eventBus.emit).toHaveBeenCalledWith(
                BATCH_EVENTS.BATCH_COMPLETE,
                expect.objectContaining({
                    totalChecked: 15,
                    duration: expect.any(Number)
                })
            );
        });
    });
});

// ═══════════════════════════════════════════════════════════════════
// Part 2: ValidationFormattingBridge 测试
// ═══════════════════════════════════════════════════════════════════

describe('ValidationFormattingBridge - 验证格式桥接器', () => {
    let bridge;
    let mockCFPlugin;
    let mockDVPlugin;

    beforeEach(() => {
        mockCFPlugin = {
            applyFormat: vi.fn(),
            removeFormat: vi.fn()
        };

        mockDVPlugin = {
            getRuleById: vi.fn()
        };

        bridge = new ValidationFormattingBridge(mockCFPlugin, mockDVPlugin);
    });

    afterEach(() => {
        bridge.destroy();
    });

    describe('基础功能测试', () => {
        test('应该正确初始化', () => {
            expect(bridge.enabled).toBe(true);
            expect(bridge.getFormatMapping()).toBeInstanceOf(Map);
        });

        test('禁用时不应应用格式', () => {
            bridge.setEnabled(false);

            bridge.onValidationChanged(0, 0, ValidationResult.failure('错误'), { id: 'rule1', type: 'number' });

            expect(mockCFPlugin.applyFormat).not.toHaveBeenCalled();
        });

        test('启用后应该正常工作', () => {
            bridge.setEnabled(false);
            bridge.setEnabled(true);

            expect(bridge.enabled).toBe(true);
        });
    });

    describe('错误格式应用测试', () => {
        test('数值验证失败应该应用红色背景样式', () => {
            const rule = { id: 'rule1', type: 'number', errorStyle: 'stop' };
            const result = ValidationResult.failure('必须在 0-100 之间', 'stop');

            bridge.onValidationChanged(0, 0, result, rule);

            expect(mockCFPlugin.applyFormat).toHaveBeenCalledWith(
                0,
                0,
                expect.objectContaining({
                    backgroundColor: '#FFCDD2',
                    color: '#B71C1C'
                }),
                expect.objectContaining({
                    source: 'validation_rule1',
                    priority: 1000
                })
            );
        });

        test('文本长度失败应该应用黄色背景样式', () => {
            const rule = { id: 'rule2', type: 'text', errorStyle: 'warning' };
            const result = ValidationResult.failure('长度不符', 'warning');

            bridge.onValidationChanged(1, 1, result, rule);

            expect(mockCFPlugin.applyFormat).toHaveBeenCalledWith(
                1,
                1,
                expect.objectContaining({
                    backgroundColor: '#FFF9C4'
                }),
                expect.any(Object)
            );
        });

        test('唯一性冲突应该应用粉色波浪线样式', () => {
            const rule = { id: 'rule3', type: 'unique', errorStyle: 'stop' };
            const result = ValidationResult.failure('值已存在', 'stop');

            bridge.onValidationChanged(2, 2, result, rule);

            expect(mockCFPlugin.applyFormat).toHaveBeenCalledWith(
                2,
                2,
                expect.objectContaining({
                    backgroundColor: '#FCE4EC',
                    borderBottom: '2px dashed #C2185B'
                }),
                expect.any(Object)
            );
        });
    });

    describe('格式移除测试', () => {
        test('验证通过应该移除错误格式', () => {
            const rule = { id: 'rule1', type: 'number' };

            bridge.onValidationChanged(0, 0, ValidationResult.failure('错误'), rule);
            expect(mockCFPlugin.applyFormat).toHaveBeenCalledTimes(1);

            bridge.onValidationChanged(0, 0, ValidationResult.success(), rule);
            expect(mockCFPlugin.removeFormat).toHaveBeenCalledWith(0, 0, 'validation_rule1');
        });
    });

    describe('批量同步测试', () => {
        test('批量结果应该同步应用到条件格式', () => {
            const rule = { id: 'rule1', type: 'number' };
            mockDVPlugin.getRuleById.mockReturnValue(rule);

            const report = {
                violations: [
                    { row: 0, col: 0, message: '错误1', ruleId: 'rule1' },
                    { row: 1, col: 1, message: '错误2', ruleId: 'rule1' },
                    { row: 2, col: 2, message: '错误3', ruleId: 'rule1' }
                ]
            };

            bridge.syncBatchResults(report);

            expect(mockCFPlugin.applyFormat).toHaveBeenCalledTimes(3);
        });
    });

    describe('清理功能测试', () => {
        test('清除所有格式应该调用 removeFormat', () => {
            const rule1 = { id: 'rule1', type: 'number' };
            const rule2 = { id: 'rule2', type: 'text' };

            bridge.onValidationChanged(0, 0, ValidationResult.failure('e1'), rule1);
            bridge.onValidationChanged(1, 1, ValidationResult.failure('e2'), rule2);

            expect(bridge.getFormatMapping().size).toBe(2);

            bridge.clearAllFormats();

            expect(mockCFPlugin.removeFormat).toHaveBeenCalledTimes(2);
            expect(bridge.getFormatMapping().size).toBe(0);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════
// Part 3: ValidationPortalManager 测试
// ═══════════════════════════════════════════════════════════════════

describe('ValidationPortalManager - Portal UI 管理器', () => {
    let portalManager;
    let mockContainer;

    beforeEach(() => {
        mockContainer = document.createElement('div');
        document.body.appendChild(mockContainer);

        portalManager = new ValidationPortalManager(null, {
            maxPortals: 5,
            zIndex: 9999
        });
    });

    afterEach(() => {
        portalManager?.destroy();
        if (mockContainer.parentNode) {
            mockContainer.parentNode.removeChild(mockContainer);
        }
    });

    describe('初始化与销毁测试', () => {
        test('未初始化时应该抛出错误', () => {
            expect(() => {
                portalManager.createPortal('test', 'dropdown', { x: 0, y: 0 });
            }).toThrow('未初始化');
        });

        test('应该正确初始化', () => {
            portalManager.init(mockContainer);

            expect(portalManager.isInitialized).toBe(true);
            expect(document.getElementById('validation-portal-root')).not.toBeNull();
        });

        test('重复初始化应该抛出错误', () => {
            portalManager.init(mockContainer);

            expect(() => {
                portalManager.init(mockContainer);
            }).toThrow('已经初始化');
        });

        test('销毁后应该清理所有资源', () => {
            portalManager.init(mockContainer);
            portalManager.createPortal('p1', 'tooltip', { x: 10, y: 20 });

            portalManager.destroy();

            expect(portalManager.isInitialized).toBe(false);
            expect(portalManager.activePortalCount).toBe(0);
            expect(document.getElementById('validation-portal-root')).toBeNull();
        });
    });

    describe('Portal 创建与管理测试', () => {
        beforeEach(() => {
            portalManager.init(mockContainer);
        });

        test('应该成功创建 Portal', () => {
            const portal = portalManager.createPortal('dropdown_A1', 'dropdown', {
                x: 100,
                y: 200
            });

            expect(portal).toBeInstanceOf(HTMLElement);
            expect(portal.dataset.portalId).toBe('dropdown_A1');
            expect(portal.dataset.portalType).toBe('dropdown');
            expect(portalManager.activePortalCount).toBe(1);
        });

        test('创建同名 Portal 应该先移除旧的', () => {
            portalManager.createPortal('p1', 'tooltip', { x: 0, y: 0 });
            expect(portalManager.activePortalCount).toBe(1);

            portalManager.createPortal('p1', 'dropdown', { x: 10, y: 20 });
            expect(portalManager.activePortalCount).toBe(1);
        });

        test('应该能够获取已创建的 Portal', () => {
            const created = portalManager.createPortal('p1', 'bubble', { x: 50, y: 60 });
            const retrieved = portalManager.getPortal('p1');

            expect(retrieved).toBe(created);
        });

        test('获取不存在的 Portal 应该返回 null', () => {
            expect(portalManager.getPortal('nonexistent')).toBeNull();
        });

        test('应该能够移除 Portal', () => {
            portalManager.createPortal('p1', 'tooltip', { x: 0, y: 0 });
            expect(portalManager.activePortalCount).toBe(1);

            const removed = portalManager.removePortal('p1');
            expect(removed).toBe(true);
            expect(portalManager.activePortalCount).toBe(0);
        });

        test('移除不存在的 Portal 应该返回 false', () => {
            const removed = portalManager.removePortal('nonexistent');
            expect(removed).toBe(false);
        });

        test('达到最大数量时应该自动移除最旧的', () => {
            for (let i = 0; i < 6; i++) {
                portalManager.createPortal(`p${i}`, 'tooltip', { x: i * 10, y: i * 10 });
            }

            expect(portalManager.activePortalCount).toBe(5);
            expect(portalManager.getPortal('p0')).toBeNull();
            expect(portalManager.getPortal('p5')).not.toBeNull();
        });
    });

    describe('位置计算测试', () => {
        beforeEach(() => {
            portalManager.init(mockContainer);
        });

        test('应该正确设置 Portal 位置', () => {
            const portal = portalManager.createPortal('pos_test', 'dropdown', {
                x: 100,
                y: 200,
                width: 150,
                height: 300
            });

            const style = portal.style;
            expect(parseFloat(style.left)).toBeGreaterThan(0);
            expect(parseFloat(style.top)).toBeGreaterThan(0);
        });

        test('应该支持更新位置', () => {
            portalManager.createPortal('update_test', 'tooltip', { x: 10, y: 20 });

            const updated = portalManager.updatePosition('update_test', { x: 50, y: 60 });
            expect(updated).toBe(true);

            const portal = portalManager.getPortal('update_test');
            expect(parseFloat(portal.style.left)).not.toBe(10);
        });
    });

    describe('类型清理测试', () => {
        beforeEach(() => {
            portalManager.init(mockContainer);
        });

        test('应该按类型清除 Portal', () => {
            portalManager.createPortal('d1', 'dropdown', { x: 0, y: 0 });
            portalManager.createPortal('t1', 'tooltip', { x: 10, y: 10 });
            portalManager.createPortal('d2', 'dropdown', { x: 20, y: 20 });
            portalManager.createPortal('b1', 'bubble', { x: 30, y: 30 });

            const removed = portalManager.clearByType('dropdown');

            expect(removed).toBe(2);
            expect(portalManager.activePortalCount).toBe(2);
            expect(portalManager.getPortal('d1')).toBeNull();
            expect(portalManager.getPortal('t1')).not.toBeNull();
        });
    });

    describe('自动移除测试', () => {
        beforeEach(() => {
            portalManager.init(mockContainer);
        });

        test('autoRemove=true 时应该在延迟后自动移除', async () => {
            vi.useFakeTimers();

            portalManager.createPortal('auto_remove', 'tooltip', { x: 0, y: 0 }, {
                autoRemove: true,
                autoRemoveDelay: 1000
            });

            expect(portalManager.activePortalCount).toBe(1);

            vi.advanceTimersByTime(1000);

            expect(portalManager.activePortalCount).toBe(0);

            vi.useRealTimers();
        });
    });
});

// ═══════════════════════════════════════════════════════════════════
// Part 4: 攻击性测试用例（BugHunt）
// ═══════════════════════════════════════════════════════════════════

describe('DataValidation - 攻击性测试（边界情况与异常输入）', () => {
    let engine;
    let cellStore;

    beforeEach(() => {
        cellStore = createMockCellStore();
        engine = new ValidationEngine(cellStore);
    });

    afterEach(() => {
        engine.destroy();
    });

    describe('极端输入测试', () => {
        test('超长字符串输入', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'text',
                operator: 'lengthBetween',
                value: [1, 100]
            }));

            const longString = 'a'.repeat(100000);
            const result = await engine.validateCell(0, 0, longString);

            expect(result.valid).toBe(false);
            expect(result.message).toContain('长度');
        });

        test('特殊字符输入', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'list',
                source: ['normal']
            }));

            const specialInputs = [
                '<script>alert("xss")</script>',
                "'; DROP TABLE users; --",
                '\x00\x01\x02\x03',
                '🎉🚀💥🌟⭐️',
                '\t\n\r\t   ',
                'null',
                'undefined',
                'NaN',
                'Infinity'
            ];

            for (const input of specialInputs) {
                const result = await engine.validateCell(0, 0, input);
                expect(result.valid).toBe(false);
            }
        });

        test('极大数值输入', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'number',
                operator: 'between',
                value: [-1000000, 1000000]
            }));

            const extremeNumbers = [
                Number.MAX_VALUE,
                Number.MIN_VALUE,
                Number.MAX_SAFE_INTEGER + 1,
                Number.MIN_SAFE_INTEGER - 1,
                Infinity,
                -Infinity,
                NaN,
                1e308,
                -1e308
            ];

            for (const num of extremeNumbers) {
                const result = await engine.validateCell(0, 0, num);
                if (!Number.isFinite(num)) {
                    expect(result.valid).toBe(false);
                }
            }
        });

        test('Unicode 和 Emoji 输入', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'text',
                operator: 'lengthBetween',
                value: [1, 10]
            }));

            const unicodeInputs = [
                '中文测试',
                '日本語テスト',
                '한국어테스트',
                'العربية',
                '👨‍👩‍👧‍👦',
                '🇨🇳🇺🇸🇯🇵',
                'ℜ𝔢𝔞𝔩𝔩𝔶 𝔬𝔩𝔡 𝔱𝔢𝔵𝔱'
            ];

            for (const input of unicodeInputs) {
                const result = await engine.validateCell(0, 0, input);
                expect(result).toBeDefined();
                expect(typeof result.valid).toBe('boolean');
            }
        });
    });

    describe('规则边界测试', () => {
        test('空范围规则', () => {
            expect(() => {
                new ValidationRule({
                    range: '',
                    type: 'number',
                    value: [0, 100]
                });
            }).toThrow();
        });

        test('无效类型规则', () => {
            expect(() => {
                new ValidationRule({
                    range: 'A1:A10',
                    type: 'invalid_type'
                });
            }).toThrow();
        });

        test('缺失必需属性', () => {
            expect(() => {
                new ValidationRule({
                    range: 'A1:A10',
                    type: 'list'
                });
            }).toThrow();
        });

        test('极长范围字符串', () => {
            const longRange = 'A1:' + 'Z'.repeat(1000) + '999999';
            const rule = new ValidationRule({
                range: longRange,
                type: 'number',
                operator: 'between',
                value: [0, 100]
            });

            expect(rule.range).toBe(longRange);
        });

        test('嵌套深度极大的 JSON 规则导入导出', () => {
            const deepObject = { a: { b: { c: { d: { e: 'value' } } } } };
            const rule = new ValidationRule({
                range: 'A1:A1',
                type: 'custom',
                formula: '=TRUE()',
                ...deepObject
            });

            const json = rule.toJSON();
            const restored = ValidationRule.fromJSON(json);

            expect(restored.id).toBe(rule.id);
        });
    });

    describe('并发与竞态条件测试', () => {
        test('快速连续添加删除规则', () => {
            for (let i = 0; i < 1000; i++) {
                const rule = new ValidationRule({
                    range: `A${i}:A${i}`,
                    type: 'number',
                    value: [0, 100]
                });
                engine.addRule(rule);
            }

            expect(engine.rules.size).toBe(1000);

            for (let i = 0; i < 500; i++) {
                const ruleId = [...engine.rules.keys()][i];
                engine.removeRule(ruleId);
            }

            expect(engine.rules.size).toBe(500);
        });

        test('并发验证请求', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'number',
                operator: 'between',
                value: [0, 100]
            }));

            const promises = [];
            for (let i = 0; i < 100; i++) {
                promises.push(engine.validateCell(0, 0, i));
            }

            const results = await Promise.all(promises);

            results.forEach(result => {
                expect(result).toBeDefined();
                expect(typeof result.valid).toBe('boolean');
            });
        });

        test('缓存溢出攻击', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'number',
                operator: 'between',
                value: [0, 100]
            }));

            for (let i = 0; i < 20000; i++) {
                await engine.validateCell(0, 0, Math.random() * 100);
            }

            expect(engine.rules.size).toBe(1);
        });
    });

    describe('内存泄漏测试', () => {
        test('大量创建销毁引擎实例', () => {
            const initialMemory = process.memoryUsage?.().heapUsed || 0;

            for (let i = 0; i < 100; i++) {
                const tempEngine = new ValidationEngine(createMockCellStore());
                tempEngine.init();
                tempEngine.destroy();
            }

            if (process.memoryUsage) {
                const finalMemory = process.memoryUsage().heapUsed;
                const memoryIncrease = finalMemory - initialMemory;
                expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 小于 50MB
            }
        });
    });

    describe('错误恢复测试', () => {
        test('验证器异常后的系统稳定性', async () => {
            const brokenValidator = {
                validate: vi.fn().mockImplementation(() => {
                    throw new Error('模拟验证器崩溃');
                })
            };

            engine.registerValidator('broken', brokenValidator);

            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'broken',
                value: 'test'
            }));

            const result = await engine.validateCell(0, 0, 'test');

            expect(result).toBeDefined();
            expect(result.valid).toBe(false);
        });

        test('CellStore 异常处理', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A10000',
                type: 'unique'
            }));

            cellStore.get.mockImplementation(() => {
                throw new Error('CellStore 崩溃');
            });

            const result = await engine.validateCell(0, 0, 'test');

            expect(result).toBeDefined();
        });
    });

    describe('性能压力测试', () => {
        test('10K 条规则的验证性能', async () => {
            const startTime = performance.now();

            for (let i = 0; i < 10000; i++) {
                engine.addRule(new ValidationRule({
                    range: `A${i}:A${i}`,
                    type: 'number',
                    operator: 'between',
                    value: [0, 100]
                }));
            }

            const addDuration = performance.now() - startTime;
            console.log(`添加 10K 条规则耗时: ${addDuration.toFixed(2)}ms`);
            expect(addDuration).toBeLessThan(5000); // 5秒内完成
        });

        test('大规模批量验证性能', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A10000',
                type: 'number',
                operator: 'between',
                value: [0, 100]
            }));

            const startTime = performance.now();

            const promises = [];
            for (let i = 0; i < 1000; i++) {
                promises.push(engine.validateCell(i, 0, Math.random() * 200 - 50));
            }

            await Promise.all(promises);

            const duration = performance.now() - startTime;
            console.log(`批量验证 1K 单元格耗时: ${duration.toFixed(2)}ms`);
            expect(duration).toBeLessThan(5000); // 5秒内完成
        });
    });
});

// ═══════════════════════════════════════════════════════════════════
// Part 5: 安全性测试
// ═══════════════════════════════════════════════════════════════════

describe('DataValidation - 安全性测试', () => {
    let plugin;
    let workbook;

    beforeEach(() => {
        workbook = createMockWorkbook();
        plugin = new DataValidationPlugin(workbook);
    });

    afterEach(() => {
        plugin?.destroy();
    });

    describe('注入攻击防护', () => {
        test('XSS 防护 - 恶意脚本注入', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'A1:A10',
                type: 'list',
                source: ['<img src=x onerror=alert(1)>', '正常选项']
            });

            const result = await plugin.validateCell(0, 0, '<script>alert("xss")</script>');

            expect(result.valid).toBe(false);
        });

        test('SQL 注入防护', async () => {
            await plugin.init();

            plugin.setValidation({
                range: 'A1:A10',
                type: 'text',
                operator: 'lengthBetween',
                value: [1, 100]
            });

            const sqlInjection = "'; DROP TABLE users; --";
            const result = await plugin.validateCell(0, 0, sqlInjection);

            expect(result).toBeDefined();
            expect(typeof result.message).toBe('string');
        });

        test('原型链污染防护', async () => {
            await plugin.init();

            const maliciousRule = {
                range: 'A1:A10',
                type: 'number',
                __proto__: { polluted: true }
            };

            expect(() => {
                plugin.setValidation(maliciousRule);
            }).not.toThrow();

            expect({}.polluted).toBeUndefined();
        });
    });

    describe('权限控制测试', () => {
        test('禁用状态下应拒绝所有验证', async () => {
            await plugin.init();
            plugin.disable();

            plugin.setValidation({
                range: 'A1:A10',
                type: 'number',
                value: [0, 100]
            });

            const result = await plugin.validateCell(0, 0, 99999);

            expect(result.valid).toBe(true);
        });

        test('销毁后应拒绝所有操作', async () => {
            await plugin.init();
            plugin.destroy();

            expect(() => {
                plugin.setValidation({
                    range: 'A1:A10',
                    type: 'number',
                    value: [0, 100]
                });
            }).toThrow();
        });
    });

    describe('数据完整性测试', () => {
        test('规则序列化反序列化一致性', async () => {
            await plugin.init();

            const originalRule = plugin.setValidation({
                range: 'B2:B100',
                type: 'number',
                operator: 'between',
                value: [0, 10000],
                errorMessage: '自定义错误消息',
                errorStyle: 'warning',
                allowBlank: false,
                priority: 10
            });

            const exported = plugin.exportRules();
            plugin.removeValidation(originalRule);

            const importedIds = plugin.importRules(exported);

            expect(importedIds.length).toBe(1);

            const restoredRule = plugin.getRuleById(importedIds[0]);
            expect(restoredRule.range).toBe('B2:B100');
            expect(restoredRule.type).toBe('number');
            expect(restoredRule.errorMessage).toContain('自定义错误消息');
            expect(restoredRule.errorStyle).toBe('warning');
            expect(restoredRule.allowBlank).toBe(false);
            expect(restoredRule.priority).toBe(10);
        });

        test('并发导入导出数据一致性', async () => {
            await plugin.init();

            for (let i = 0; i < 100; i++) {
                plugin.setValidation({
                    range: `A${i}:A${i}`,
                    type: 'number',
                    value: [0, 100]
                });
            }

            const exported1 = plugin.exportRules();
            const exported2 = plugin.exportRules();

            expect(exported1.length).toBe(exported2.length);

            exported1.forEach((rule, idx) => {
                expect(rule.id).toBe(exported2[idx].id);
                expect(rule.range).toBe(exported2[idx].range);
            });
        });
    });
});

// ═══════════════════════════════════════════════════════════════════
// Part 6: 边缘场景测试
// ═══════════════════════════════════════════════════════════════════

describe('DataValidation - 边缘场景测试', () => {
    let engine;

    beforeEach(() => {
        engine = new ValidationEngine(createMockCellStore());
    });

    afterEach(() => {
        engine.destroy();
    });

    describe('空值和 undefined 处理', () => {
        test('null 值处理', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'number',
                value: [0, 100],
                allowBlank: true
            }));

            const result = await engine.validateCell(0, 0, null);
            expect(result.valid).toBe(true);
        });

        test('undefined 值处理', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'text',
                value: [1, 10],
                allowBlank: true
            }));

            const result = await engine.validateCell(0, 0, undefined);
            expect(result.valid).toBe(true);
        });

        test('空字符串处理', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'list',
                source: ['option1', 'option2'],
                allowBlank: true
            }));

            const result = await engine.validateCell(0, 0, '');
            expect(result.valid).toBe(true);
        });

        test('不允许空白时的各种空值', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'number',
                value: [0, 100],
                allowBlank: false
            }));

            const blankValues = [null, undefined, '', '   '];

            for (const value of blankValues) {
                const result = await engine.validateCell(0, 0, value);
                expect(result.valid).toBe(false);
            }
        });
    });

    describe('精度问题测试', () => {
        test('浮点数精度问题', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'number',
                operator: 'between',
                value: [0.1, 0.3]
            }));

            const result1 = await engine.validateCell(0, 0, 0.2);
            expect(result1.valid).toBe(true);

            const result2 = await engine.validateCell(0, 0, 0.1 + 0.2);
            expect(result2).toBeDefined();
        });

        test('极小数值', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'number',
                operator: 'greaterThan',
                value: 0
            }));

            const tinyNumber = 1e-300;
            const result = await engine.validateCell(0, 0, tinyNumber);
            expect(result.valid).toBe(true);
        });
    });

    describe('日期时间边缘情况', () => {
        test('无效日期字符串', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'date',
                operator: 'between',
                value: ['2024-01-01', '2024-12-31']
            }));

            const invalidDates = [
                '2024-13-01',
                '2024-02-30',
                'not-a-date',
                '2024/02/30',
                ''
            ];

            for (const dateStr of invalidDates) {
                const result = await engine.validateCell(0, 0, dateStr);
                expect(result.valid).toBe(false);
            }
        });

        test('闰年日期', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'date',
                operator: 'between',
                value: ['2024-01-01', '2024-12-31']
            }));

            const leapYearDate = '2024-02-29';
            const result = await engine.validateCell(0, 0, leapYearDate);
            expect(result.valid).toBe(true);
        });
    });

    describe('正则表达式边缘情况', () => {
        test('复杂正则表达式', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'regex',
                pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$'
            }));

            const validPassword = 'StrongPass123!';
            const invalidPassword = 'weak';

            const validResult = await engine.validateCell(0, 0, validPassword);
            const invalidResult = await engine.validateCell(0, 0, invalidPassword);

            expect(validResult.valid).toBe(true);
            expect(invalidResult.valid).toBe(false);
        });

        test('ReDoS 攻击防护', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A1',
                type: 'regex',
                pattern: '^(a+)+$'
            }));

            const maliciousInput = 'a'.repeat(100) + '!';

            const startTime = performance.now();
            const result = await engine.validateCell(0, 0, maliciousInput);
            const duration = performance.now() - startTime;

            expect(duration).toBeLessThan(1000); // 1秒内完成
            expect(result).toBeDefined();
        });
    });

    describe('唯一性校验边缘情况', () => {
        test('大量重复值的性能', async () => {
            const cellStore = createMockCellStore();

            for (let i = 0; i < 10000; i++) {
                cellStore._cells.set(`0,${i}`, { value: 'duplicate' });
            }

            const uniqueEngine = new ValidationEngine(cellStore);
            uniqueEngine.init();

            uniqueEngine.addRule(new ValidationRule({
                range: 'A1:A10000',
                type: 'unique'
            }));

            const startTime = performance.now();
            const result = await uniqueEngine.validateCell(0, 0, 'duplicate');
            const duration = performance.now() - startTime;

            expect(result.valid).toBe(false);
            expect(duration).toBeLessThan(2000); // 2秒内完成

            uniqueEngine.destroy();
        });

        test('特殊字符的唯一性判断', async () => {
            engine.addRule(new ValidationRule({
                range: 'A1:A10',
                type: 'unique'
            }));

            const specialValues = [
                'null',
                'undefined',
                'NaN',
                '',
                ' ',
                '  ',
                '\t',
                '\n',
                'true',
                'false',
                '0',
                '-0'
            ];

            for (const value of specialValues) {
                const result = await engine.validateCell(0, 0, value);
                expect(result).toBeDefined();
            }
        });
    });
});

console.log('✅ 数据验证完整测试套件加载完成');