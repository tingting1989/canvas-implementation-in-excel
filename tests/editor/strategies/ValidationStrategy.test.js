import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ValidationStrategy } from '../../../src/editor/strategies/ValidationStrategy.js';
import { STRATEGY_PRIORITY } from '../../../src/constants/strategyPriority.js';

describe('ValidationStrategy', () => {
    let mockHandler;
    let mockPlugin;
    let validationStrategy;

    beforeEach(() => {
        mockHandler = {
            addStrategy: vi.fn(),
            removeStrategy: vi.fn()
        };

        mockPlugin = {
            active: true,
            uiController: {
                onCellSelected: vi.fn()
            },
            interceptBeforeSetValue: vi.fn((row, col, value) => true),
            handleAfterSetValue: vi.fn(),
            interceptBeforePaste: vi.fn((data) => true)
        };

        validationStrategy = new ValidationStrategy(mockHandler, mockPlugin);
    });

    describe('构造函数和属性', () => {
        it('should create instance with correct name', () => {
            expect(validationStrategy.name).toBe('validation');
        });

        it('should have correct priority', () => {
            expect(validationStrategy.priority).toBe(STRATEGY_PRIORITY.DATA_VALIDATION);
        });

        it('should be enabled by default', () => {
            expect(validationStrategy.enabled).toBe(true);
        });

        it('should store handler reference', () => {
            expect(validationStrategy.handler).toBe(mockHandler);
        });
    });

    describe('getEventHandlers()', () => {
        it('should return empty object', () => {
            expect(validationStrategy.getEventHandlers()).toEqual({});
        });
    });

    describe('interceptBeforeSetValue()', () => {
        it('should return true when strategy is disabled', () => {
            validationStrategy.enabled = false;

            const result = validationStrategy.interceptBeforeSetValue(0, 0, 'test');

            expect(result).toBe(true);
            expect(mockPlugin.interceptBeforeSetValue).not.toHaveBeenCalled();
        });

        it('should return true when plugin is not active', () => {
            mockPlugin.active = false;

            const result = validationStrategy.interceptBeforeSetValue(0, 0, 'test');

            expect(result).toBe(true);
            expect(mockPlugin.interceptBeforeSetValue).not.toHaveBeenCalled();
        });

        it('should return true when plugin is null', () => {
            validationStrategy = new ValidationStrategy(mockHandler, null);

            const result = validationStrategy.interceptBeforeSetValue(0, 0, 'test');

            expect(result).toBe(true);
        });

        it('should call plugin.interceptBeforeSetValue when enabled and plugin is active', () => {
            mockPlugin.interceptBeforeSetValue.mockReturnValue(true);

            const result = validationStrategy.interceptBeforeSetValue(1, 2, 'test_value');

            expect(mockPlugin.interceptBeforeSetValue).toHaveBeenCalledWith(1, 2, 'test_value');
            expect(result).toBe(true);
        });

        it('should call plugin.interceptBeforeSetValue with correct parameters', () => {
            mockPlugin.interceptBeforeSetValue.mockReturnValue(false);

            const result = validationStrategy.interceptBeforeSetValue(5, 10, 'negative');

            expect(mockPlugin.interceptBeforeSetValue).toHaveBeenCalledWith(5, 10, 'negative');
            expect(result).toBe(false);
        });

        it('should allow validation to be rejected by plugin', () => {
            mockPlugin.interceptBeforeSetValue.mockReturnValue(false);

            const result = validationStrategy.interceptBeforeSetValue(0, 0, 'invalid');

            expect(result).toBe(false);
        });
    });

    describe('handleAfterSetValue()', () => {
        it('should not call plugin method when strategy is disabled', () => {
            validationStrategy.enabled = false;

            validationStrategy.handleAfterSetValue(0, 0, 'test');

            expect(mockPlugin.handleAfterSetValue).not.toHaveBeenCalled();
        });

        it('should not call plugin method when plugin is not active', () => {
            mockPlugin.active = false;

            validationStrategy.handleAfterSetValue(0, 0, 'test');

            expect(mockPlugin.handleAfterSetValue).not.toHaveBeenCalled();
        });

        it('should not call plugin method when plugin is null', () => {
            validationStrategy = new ValidationStrategy(mockHandler, null);

            validationStrategy.handleAfterSetValue(0, 0, 'test');
        });

        it('should call plugin.handleAfterSetValue when enabled and plugin is active', () => {
            validationStrategy.handleAfterSetValue(1, 2, 'test_value');

            expect(mockPlugin.handleAfterSetValue).toHaveBeenCalledWith(1, 2, 'test_value');
        });

        it('should call plugin.handleAfterSetValue with correct parameters', () => {
            validationStrategy.handleAfterSetValue(5, 10, 'validated_value');

            expect(mockPlugin.handleAfterSetValue).toHaveBeenCalledWith(5, 10, 'validated_value');
        });
    });

    describe('interceptBeforePaste()', () => {
        it('should return true when strategy is disabled', () => {
            validationStrategy.enabled = false;

            const result = validationStrategy.interceptBeforePaste({ data: 'test' });

            expect(result).toBe(true);
            expect(mockPlugin.interceptBeforePaste).not.toHaveBeenCalled();
        });

        it('should return true when plugin is not active', () => {
            mockPlugin.active = false;

            const result = validationStrategy.interceptBeforePaste({ data: 'test' });

            expect(result).toBe(true);
            expect(mockPlugin.interceptBeforePaste).not.toHaveBeenCalled();
        });

        it('should return true when plugin is null', () => {
            validationStrategy = new ValidationStrategy(mockHandler, null);

            const result = validationStrategy.interceptBeforePaste({ data: 'test' });

            expect(result).toBe(true);
        });

        it('should call plugin.interceptBeforePaste when enabled and plugin is active', () => {
            const pasteData = { data: [[1, 2], [3, 4]] };
            mockPlugin.interceptBeforePaste.mockReturnValue(true);

            const result = validationStrategy.interceptBeforePaste(pasteData);

            expect(mockPlugin.interceptBeforePaste).toHaveBeenCalledWith(pasteData);
            expect(result).toBe(true);
        });

        it('should allow paste to be rejected by plugin', () => {
            const pasteData = { data: [[1, 2], [3, 4]] };
            mockPlugin.interceptBeforePaste.mockReturnValue(false);

            const result = validationStrategy.interceptBeforePaste(pasteData);

            expect(result).toBe(false);
        });
    });

    describe('handleCellSelected()', () => {
        it('should not call uiController when strategy is disabled', () => {
            validationStrategy.enabled = false;

            validationStrategy.handleCellSelected(0, 0);

            expect(mockPlugin.uiController.onCellSelected).not.toHaveBeenCalled();
        });

        it('should not call uiController when plugin is not active', () => {
            mockPlugin.active = false;

            validationStrategy.handleCellSelected(0, 0);

            expect(mockPlugin.uiController.onCellSelected).not.toHaveBeenCalled();
        });

        it('should not call uiController when uiController is null', () => {
            mockPlugin.uiController = null;
            validationStrategy = new ValidationStrategy(mockHandler, mockPlugin);

            validationStrategy.handleCellSelected(0, 0);
        });

        it('should call uiController.onCellSelected when enabled and plugin is active', () => {
            validationStrategy.handleCellSelected(1, 2);

            expect(mockPlugin.uiController.onCellSelected).toHaveBeenCalledWith(1, 2);
        });

        it('should call uiController.onCellSelected with correct parameters', () => {
            validationStrategy.handleCellSelected(5, 10);

            expect(mockPlugin.uiController.onCellSelected).toHaveBeenCalledWith(5, 10);
        });
    });

    describe('继承自 EventStrategy 的方法', () => {
        it('should disable strategy when disable() is called', () => {
            validationStrategy.disable();

            expect(validationStrategy.enabled).toBe(false);
        });

        it('should enable strategy when enable() is called', () => {
            validationStrategy.enabled = false;
            validationStrategy.enable();

            expect(validationStrategy.enabled).toBe(true);
        });

        it('should allow toggling enabled state', () => {
            expect(validationStrategy.enabled).toBe(true);

            validationStrategy.disable();
            expect(validationStrategy.enabled).toBe(false);

            validationStrategy.enable();
            expect(validationStrategy.enabled).toBe(true);
        });
    });

    describe('集成场景', () => {
        it('should work with disabled plugin after being enabled', () => {
            validationStrategy.enabled = true;
            mockPlugin.active = true;

            const result1 = validationStrategy.interceptBeforeSetValue(0, 0, 'test');
            expect(result1).toBe(true);
            expect(mockPlugin.interceptBeforeSetValue).toHaveBeenCalled();

            mockPlugin.active = false;

            const result2 = validationStrategy.interceptBeforeSetValue(0, 0, 'test');
            expect(result2).toBe(true);
        });

        it('should handle plugin with missing optional dependencies', () => {
            const minimalPlugin = {
                active: true,
                interceptBeforeSetValue: vi.fn(() => true),
                handleAfterSetValue: vi.fn()
            };

            validationStrategy = new ValidationStrategy(mockHandler, minimalPlugin);

            validationStrategy.handleCellSelected(0, 0);

            expect(validationStrategy.enabled).toBe(true);
            expect(validationStrategy.handleAfterSetValue(0, 0, 'test')).toBeUndefined();
        });

        it('should handle multiple sequential calls', () => {
            mockPlugin.interceptBeforeSetValue.mockReturnValue(true);

            for (let i = 0; i < 10; i++) {
                const result = validationStrategy.interceptBeforeSetValue(i, i, `value_${i}`);
                expect(result).toBe(true);
            }

            expect(mockPlugin.interceptBeforeSetValue).toHaveBeenCalledTimes(10);
        });

        it('should handle rapid enable/disable toggling', () => {
            mockPlugin.interceptBeforeSetValue.mockReturnValue(true);

            validationStrategy.interceptBeforeSetValue(0, 0, 'test');
            expect(mockPlugin.interceptBeforeSetValue).toHaveBeenCalledTimes(1);

            validationStrategy.disable();
            validationStrategy.interceptBeforeSetValue(0, 0, 'test');
            expect(mockPlugin.interceptBeforeSetValue).toHaveBeenCalledTimes(1);

            validationStrategy.enable();
            validationStrategy.interceptBeforeSetValue(0, 0, 'test');
            expect(mockPlugin.interceptBeforeSetValue).toHaveBeenCalledTimes(2);
        });
    });
});