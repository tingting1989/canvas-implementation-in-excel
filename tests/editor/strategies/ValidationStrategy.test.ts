import { describe, it, expect, beforeEach, vi } from "vitest";
import { ValidationStrategy } from "@/plugins/dataValidation/ValidationStrategy.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";

describe("ValidationStrategy", () => {
    let mockHandler: any;
    let mockPlugin: any;
    let validationStrategy: ValidationStrategy;

    beforeEach(() => {
        mockHandler = {
            addStrategy: vi.fn(),
            removeStrategy: vi.fn(),
        };

        mockPlugin = {
            active: true,
            uiController: {
                onCellSelected: vi.fn(),
            },
            interceptBeforeSetValue: vi.fn((_row: number, _col: number, _value: unknown) => true),
            handleAfterSetValue: vi.fn(),
            interceptBeforePaste: vi.fn((_data: unknown) => true),
        };

        validationStrategy = new ValidationStrategy(mockHandler, mockPlugin);
    });

    describe("构造函数和属性", () => {
        it("VS-01: 应正确设置名称", () => {
            expect(validationStrategy.name).toBe("validation");
        });

        it("VS-02: 应正确设置优先级", () => {
            expect(validationStrategy.priority).toBe(STRATEGY_PRIORITY.DATA_VALIDATION);
        });

        it("VS-03: 默认启用", () => {
            expect(validationStrategy.enabled).toBe(true);
        });

        it("VS-04: 应保存 handler 引用", () => {
            expect(validationStrategy.handler).toBe(mockHandler);
        });
    });

    describe("getEventHandlers()", () => {
        it("VS-05: 应返回空对象（不监听DOM事件）", () => {
            expect(validationStrategy.getEventHandlers()).toEqual({});
        });
    });

    describe("interceptBeforeSetValue()", () => {
        it("VS-06: 策略禁用时返回 true", () => {
            validationStrategy.enabled = false;
            const result = validationStrategy.interceptBeforeSetValue(0, 0, "test");
            expect(result).toBe(true);
            expect(mockPlugin.interceptBeforeSetValue).not.toHaveBeenCalled();
        });

        it("VS-07: 插件未激活时返回 true", () => {
            mockPlugin.active = false;
            const result = validationStrategy.interceptBeforeSetValue(0, 0, "test");
            expect(result).toBe(true);
            expect(mockPlugin.interceptBeforeSetValue).not.toHaveBeenCalled();
        });

        it("VS-08: 插件为 null 时返回 true", () => {
            validationStrategy = new ValidationStrategy(mockHandler, null);
            const result = validationStrategy.interceptBeforeSetValue(0, 0, "test");
            expect(result).toBe(true);
        });

        it("VS-09: 正常情况委托给插件", () => {
            mockPlugin.interceptBeforeSetValue.mockReturnValue(true);
            const result = validationStrategy.interceptBeforeSetValue(1, 2, "test_value");
            expect(mockPlugin.interceptBeforeSetValue).toHaveBeenCalledWith(1, 2, "test_value");
            expect(result).toBe(true);
        });

        it("VS-10: 插件拒绝写入时返回 false", () => {
            mockPlugin.interceptBeforeSetValue.mockReturnValue(false);
            const result = validationStrategy.interceptBeforeSetValue(0, 0, "invalid");
            expect(result).toBe(false);
        });
    });

    describe("handleAfterSetValue()", () => {
        it("VS-11: 策略禁用时不调用插件", () => {
            validationStrategy.enabled = false;
            validationStrategy.handleAfterSetValue(0, 0, "test");
            expect(mockPlugin.handleAfterSetValue).not.toHaveBeenCalled();
        });

        it("VS-12: 插件未激活时不调用", () => {
            mockPlugin.active = false;
            validationStrategy.handleAfterSetValue(0, 0, "test");
            expect(mockPlugin.handleAfterSetValue).not.toHaveBeenCalled();
        });

        it("VS-13: 插件为 null 时不抛异常", () => {
            validationStrategy = new ValidationStrategy(mockHandler, null);
            expect(() => validationStrategy.handleAfterSetValue(0, 0, "test")).not.toThrow();
        });

        it("VS-14: 正常情况委托给插件", () => {
            validationStrategy.handleAfterSetValue(1, 2, "test_value");
            expect(mockPlugin.handleAfterSetValue).toHaveBeenCalledWith(1, 2, "test_value");
        });
    });

    describe("interceptBeforePaste()", () => {
        it("VS-15: 策略禁用时返回 true", () => {
            validationStrategy.enabled = false;
            const result = validationStrategy.interceptBeforePaste({ data: "test" });
            expect(result).toBe(true);
            expect(mockPlugin.interceptBeforePaste).not.toHaveBeenCalled();
        });

        it("VS-16: 插件未激活时返回 true", () => {
            mockPlugin.active = false;
            const result = validationStrategy.interceptBeforePaste({ data: "test" });
            expect(result).toBe(true);
            expect(mockPlugin.interceptBeforePaste).not.toHaveBeenCalled();
        });

        it("VS-17: 插件为 null 时返回 true", () => {
            validationStrategy = new ValidationStrategy(mockHandler, null);
            const result = validationStrategy.interceptBeforePaste({ data: "test" });
            expect(result).toBe(true);
        });

        it("VS-18: 正常情况委托给插件", () => {
            const pasteData = { data: [[1, 2], [3, 4]] };
            mockPlugin.interceptBeforePaste.mockReturnValue(true);
            const result = validationStrategy.interceptBeforePaste(pasteData);
            expect(mockPlugin.interceptBeforePaste).toHaveBeenCalledWith(pasteData);
            expect(result).toBe(true);
        });

        it("VS-19: 插件拒绝粘贴时返回 false", () => {
            mockPlugin.interceptBeforePaste.mockReturnValue(false);
            const result = validationStrategy.interceptBeforePaste({ data: [[1, 2]] });
            expect(result).toBe(false);
        });
    });

    describe("handleCellSelected()", () => {
        it("VS-20: 策略禁用时不调用 uiController", () => {
            validationStrategy.enabled = false;
            validationStrategy.handleCellSelected(0, 0);
            expect(mockPlugin.uiController.onCellSelected).not.toHaveBeenCalled();
        });

        it("VS-21: 插件未激活时不调用", () => {
            mockPlugin.active = false;
            validationStrategy.handleCellSelected(0, 0);
            expect(mockPlugin.uiController.onCellSelected).not.toHaveBeenCalled();
        });

        it("VS-22: uiController 为 null 时不抛异常", () => {
            mockPlugin.uiController = null;
            validationStrategy = new ValidationStrategy(mockHandler, mockPlugin);
            expect(() => validationStrategy.handleCellSelected(0, 0)).not.toThrow();
        });

        it("VS-23: 正常情况委托给 uiController", () => {
            validationStrategy.handleCellSelected(1, 2);
            expect(mockPlugin.uiController.onCellSelected).toHaveBeenCalledWith(1, 2);
        });
    });

    describe("enable() / disable()", () => {
        it("VS-24: disable 后 enabled 为 false", () => {
            validationStrategy.disable();
            expect(validationStrategy.enabled).toBe(false);
        });

        it("VS-25: enable 后 enabled 为 true", () => {
            validationStrategy.disable();
            validationStrategy.enable();
            expect(validationStrategy.enabled).toBe(true);
        });
    });

    describe("init() / destroy()", () => {
        it("VS-26: init 不抛异常", () => {
            expect(() => validationStrategy.init()).not.toThrow();
        });

        it("VS-27: destroy 不抛异常", () => {
            expect(() => validationStrategy.destroy()).not.toThrow();
        });
    });
});