import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CopyPasteStrategy } from "@/editor/strategies/CopyPasteStrategy.js";
import { STRATEGY_PRIORITY } from "@/constants/strategyPriority.js";
import { DELEGATE_KEYS } from "@/constants/eventNames.js";

describe("CopyPasteStrategy", () => {
    let mockHandler: any;
    let mockClipboardManager: any;

    beforeEach(() => {
        mockClipboardManager = {
            copy: vi.fn(),
            paste: vi.fn(),
        };

        mockHandler = {
            sheet: {
                selection: {
                    getRange: vi.fn(() => ({ topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 0 })),
                    setActive: vi.fn(),
                    setRange: vi.fn(),
                },
                setCell: vi.fn(),
            },
            editor: { getActiveEditor: vi.fn(() => null) },
            render: vi.fn(),
            runHooks: vi.fn(),
        };
    });

    afterEach(() => {
        const target = document.querySelector("[contenteditable]");
        if (target) target.remove();
    });

    describe("构造函数和属性", () => {
        it("CP-01: 应正确设置优先级", () => {
            const strategy = new CopyPasteStrategy(mockHandler, mockClipboardManager);
            expect(strategy.priority).toBe(STRATEGY_PRIORITY.SHORTCUT_KEY);
        });

        it("CP-02: 默认启用", () => {
            const strategy = new CopyPasteStrategy(mockHandler, mockClipboardManager);
            expect(strategy.enabled).toBe(true);
        });

        it("CP-03: 应保存 handler 引用", () => {
            const strategy = new CopyPasteStrategy(mockHandler, mockClipboardManager);
            expect(strategy.handler).toBe(mockHandler);
        });

        it("CP-04: 应保存 clipboardManager 引用", () => {
            const strategy = new CopyPasteStrategy(mockHandler, mockClipboardManager);
            expect(strategy.clipboardManager).toBe(mockClipboardManager);
        });
    });

    describe("getEventHandlers()", () => {
        it("CP-05: 应声明 document:keydown 事件", () => {
            const strategy = new CopyPasteStrategy(mockHandler, mockClipboardManager);
            const handlers = strategy.getEventHandlers();
            expect(handlers[DELEGATE_KEYS.DOCUMENT_KEYDOWN]).toBeTypeOf("function");
        });

        it("CP-06: 应只声明1个事件", () => {
            const strategy = new CopyPasteStrategy(mockHandler, mockClipboardManager);
            const handlers = strategy.getEventHandlers();
            expect(Object.keys(handlers)).toHaveLength(1);
        });
    });

    describe("init() / destroy()", () => {
        it("CP-07: init 创建粘贴目标 DOM", () => {
            const beforeCount = document.body.children.length;
            const strategy = new CopyPasteStrategy(mockHandler, mockClipboardManager);
            strategy.init();
            expect(document.body.children.length).toBeGreaterThan(beforeCount);
        });

        it("CP-08: destroy 移除粘贴目标 DOM", () => {
            const strategy = new CopyPasteStrategy(mockHandler, mockClipboardManager);
            strategy.init();
            const afterInitCount = document.body.children.length;
            strategy.destroy();
            expect(document.body.children.length).toBeLessThan(afterInitCount);
        });

        it("CP-09: destroy 后 clipboardManager 置 null", () => {
            const strategy = new CopyPasteStrategy(mockHandler, mockClipboardManager);
            strategy.init();
            strategy.destroy();
            expect(strategy.clipboardManager).toBeNull();
        });

        it("CP-10: destroy 幂等安全", () => {
            const strategy = new CopyPasteStrategy(mockHandler, mockClipboardManager);
            strategy.init();
            expect(() => {
                strategy.destroy();
                strategy.destroy();
            }).not.toThrow();
        });
    });

    describe("enable() / disable()", () => {
        it("CP-11: 禁用后 enabled 为 false", () => {
            const strategy = new CopyPasteStrategy(mockHandler, mockClipboardManager);
            strategy.disable();
            expect(strategy.enabled).toBe(false);
        });
    });
});