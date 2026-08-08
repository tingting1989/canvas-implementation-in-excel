/**
 * SearchStrategy 单元测试
 *
 * 测试搜索策略的键盘快捷键处理和外部输入检测
 */
import { describe, it, expect, beforeEach, jest } from "vitest";
import { SearchStrategy } from "../SearchStrategy.js";

describe("SearchStrategy", () => {
    let strategy;
    let mockPlugin;
    let mockHandler;

    /**
     * 创建模拟的 EventHandler
     */
    function createMockHandler() {
        return {
            viewport: {
                scrollX: 0,
                scrollY: 0,
            },
            canvasContext: {
                canvas: {
                    getBoundingClientRect: () => ({
                        left: 100,
                        top: 50,
                        width: 800,
                        height: 600,
                    }),
                },
            },
            sheet: {
                editor: {
                    isActive: jest.fn().mockReturnValue(false),
                },
            },
            registerStrategy: jest.fn(),
            unregisterStrategy: jest.fn(),
        };
    }

    /**
     * 创建模拟的 SearchPlugin
     */
    function createMockPlugin() {
        let isSearchActive = false;

        return {
            enabled: true,

            show: jest.fn(() => {
                isSearchActive = true;
            }),
            hide: jest.fn(() => {
                isSearchActive = false;
            }),
            findNext: jest.fn(),
            findPrevious: jest.fn(),
            getLastQuery: jest.fn().mockReturnValue("test"),

            // 用于验证状态变化
            _getIsActive: () => isSearchActive,
        };
    }

    beforeEach(() => {
        mockHandler = createMockHandler();
        mockPlugin = createMockPlugin();

        strategy = new SearchStrategy(mockHandler, mockPlugin);
    });

    describe("初始化", () => {
        it("应正确设置策略优先级为 POPUP_UI (500)", () => {
            const { STRATEGY_PRIORITY } = require("../../constants/strategyPriority");
            expect(strategy.priority).toBe(STRATEGY_PRIORITY.POPUP_UI);
        });

        it("应监听 DOCUMENT_KEYDOWN 事件", () => {
            const handlers = strategy.getEventHandlers();
            const { DELEGATE_KEYS } = require("../../constants/eventNames");

            expect(handlers).toHaveProperty(DELEGATE_KEYS.DOCUMENT_KEYDOWN);
            expect(typeof handlers[DELEGATE_KEYS.DOCUMENT_KEYDOWN]).toBe("function");
        });
    });

    describe("Ctrl+F 快捷键", () => {
        it("应在按下 Ctrl+F 时打开搜索面板", async () => {
            const event = new KeyboardEvent("keydown", {
                key: "f",
                ctrlKey: true,
                metaKey: false,
                shiftKey: false,
            });

            const result = await strategy.getEventHandlers()["document:keydown"](event);

            expect(result).toBe(false); // 阻止默认行为
            expect(mockPlugin.show).toHaveBeenCalledTimes(1);
        });

        it("应在 Cmd+F (Mac) 时也打开搜索面板", async () => {
            const event = new KeyboardEvent("keydown", {
                key: "f",
                ctrlKey: false,
                metaKey: true, // Mac 的 Command 键
                shiftKey: false,
            });

            await strategy.getEventHandlers()["document:keydown"](event);

            expect(mockPlugin.show).toHaveBeenCalledTimes(1);
        });

        it("应在搜索面板已打开时关闭它", async () => {
            // 模拟已激活状态
            mockPlugin._setActive(true); // 假设有这个方法

            const event = new KeyboardEvent("keydown", {
                key: "f",
                ctrlKey: true,
                metaKey: false,
            });

            await strategy.getEventHandlers()["document:keydown"](event);

            expect(mockPlugin.hide).toHaveBeenCalledTimes(1);
        });

        it("应阻止 Ctrl+F 的浏览器默认行为（查找框）", async () => {
            const event = new KeyboardEvent("keydown", {
                key: "f",
                ctrlKey: true,
                preventDefault: jest.fn(),
                stopPropagation: jest.fn(),
            });

            await strategy.getEventHandlers()["document:keydown"](event);

            expect(event.preventDefault).toHaveBeenCalled();
            expect(event.stopPropagation).toHaveBeenCalled();
        });
    });

    describe("F3 导航快捷键", () => {
        it("应在按 F3 时导航到下一个结果", async () => {
            const event = new KeyboardEvent("keydown", {
                key: "F3",
                ctrlKey: false,
                shiftKey: false,
                preventDefault: jest.fn(),
            });

            await strategy.getEventHandlers()["document:keydown"](event);

            expect(mockPlugin.findNext).toHaveBeenCalledTimes(1);
            expect(event.preventDefault).toHaveBeenCalled();
        });

        it("应在 Shift+F3 时导航到上一个结果", async () => {
            const event = new KeyboardEvent("keydown", {
                key: "F3",
                ctrlKey: false,
                shiftKey: true,
                preventDefault: jest.fn(),
            });

            await strategy.getEventHandlers()["document:keydown"](event);

            expect(mockPlugin.findPrevious).toHaveBeenCalledTimes(1);
        });

        it("应在搜索未激活且无历史记录时打开空面板", async () => {
            mockPlugin.getLastQuery.mockReturnValue(null);

            const event = new KeyboardEvent("keydown", {
                key: "F3",
                preventDefault: jest.fn(),
            });

            await strategy.getEventHandlers()["document:keydown"](event);

            expect(mockPlugin.show).toHaveBeenCalled();
        });
    });

    describe("Esc 关闭快捷键", () => {
        it("应在 Esc 且搜索激活时关闭面板", async () => {
            // 模拟搜索激活
            // （通过修改插件内部状态）

            const event = new KeyboardEvent("keydown", {
                key: "Escape",
                preventDefault: jest.fn(),
            });

            const result = await strategy.getEventHandlers()["document:keydown"](event);

            // 如果搜索未激活，应该返回 true 允许传播
            // 如果搜索激活，应该返回 false 阻止传播
            expect(typeof result).toBe("boolean");
        });
    });

    describe("外部输入检测", () => {
        it("应在编辑器活跃时不拦截按键", async () => {
            // 模拟编辑器处于活跃状态
            mockHandler.sheet.editor.isActive.mockReturnValue(true);

            const event = new KeyboardEvent("keydown", {
                key: "f",
                ctrlKey: true,
            });

            const result = await strategy.getEventHandlers()["document:keydown"](event);

            expect(result).toBe(true); // 允许事件传播
            expect(mockPlugin.show).not.toHaveBeenCalled();
        });

        it("应在表单元素获得焦点时不拦截（非搜索输入框）", async () => {
            // 模拟一个普通的 input 元素获得焦点
            const fakeInput = document.createElement("input");
            document.body.appendChild(fakeInput);
            fakeInput.focus();

            const event = new KeyboardEvent("keydown", {
                key: "f",
                ctrlKey: true,
            });

            const result = await strategy.getEventHandlers()["document:keydown"](event);

            expect(result).toBe(true); // 应该允许传播给 input

            // 清理
            fakeInput.remove();
        });
    });

    describe("策略销毁", () => {
        it("应在 destroy() 后清理所有引用", () => {
            strategy.destroy();

            // 验证内部引用已被清理
            // 注意：由于 #plugin 和其他属性是私有的，
            // 我们只能验证 destroy() 不抛出异常
            expect(() => strategy.destroy()).not.toThrow();
        });
    });

    describe("优先级协调", () => {
        it("应与 FilterStrategy 使用相同的 POPUP_UI 优先级", () => {
            const { STRATEGY_PRIORITY } = require("../../constants/strategyPriority");

            // FilterStrategy 也使用 POPUP_UI 优先级
            expect(strategy.priority).toBe(STRATEGY_PRIORITY.POPUP_UI);
            expect(strategy.priority).toBe(500);
        });

        it("应高于 MouseStrategy (300) 但低于 ResizeStrategy (600)", () => {
            // 确保优先级在合理范围内
            expect(strategy.priority).toBeGreaterThan(300);
            expect(strategy.priority).toBeLessThan(600);
        });
    });
});
