import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChartCacheManager } from "@/render/chart/ChartCacheManager";
import { SHEET_EVENTS } from "@/constants/sheetEvents";

function createMockBus() {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    return {
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(cb);
        }),
        off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
            if (listeners[event]) {
                listeners[event] = listeners[event].filter((l) => l !== cb);
            }
        }),
        emit: vi.fn((event: string, ...args: unknown[]) => {
            if (listeners[event]) {
                listeners[event].forEach((cb) => cb(...args));
            }
        }),
        _listeners: listeners,
    };
}

describe("ChartCacheManager", () => {
    let manager: ChartCacheManager;
    let mockBus: ReturnType<typeof createMockBus>;

    beforeEach(() => {
        mockBus = createMockBus();
        const mockSheet = { bus: mockBus };
        manager = new ChartCacheManager(mockSheet as any);
    });

    it("initial globalVersion is 0", () => {
        expect(manager.globalVersion).toBe(0);
    });

    it("isDirty returns true for new chart (never rendered)", () => {
        expect(manager.isDirty("chart1")).toBe(true);
    });

    it("markClean makes chart not dirty", () => {
        manager.markClean("chart1");
        expect(manager.isDirty("chart1")).toBe(false);
    });

    it("invalidateAll makes all charts dirty", () => {
        manager.markClean("chart1");
        manager.markClean("chart2");
        expect(manager.isDirty("chart1")).toBe(false);
        expect(manager.isDirty("chart2")).toBe(false);

        manager.invalidateAll();
        expect(manager.isDirty("chart1")).toBe(true);
        expect(manager.isDirty("chart2")).toBe(true);
    });

    it("invalidateAll increments globalVersion", () => {
        expect(manager.globalVersion).toBe(0);
        manager.invalidateAll();
        expect(manager.globalVersion).toBe(1);
    });

    it("CELL_CHANGED event sets pending invalidation", () => {
        manager.markClean("chart1");
        expect(manager.isDirty("chart1")).toBe(false);

        mockBus.emit(SHEET_EVENTS.CELL_CHANGED);
        expect(manager.isDirty("chart1")).toBe(false);
    });

    it("INVALIDATE_ALL event increments global version", () => {
        manager.markClean("chart1");
        expect(manager.isDirty("chart1")).toBe(false);

        mockBus.emit(SHEET_EVENTS.INVALIDATE_ALL);
        expect(manager.isDirty("chart1")).toBe(true);
    });

    it("destroy removes event listeners", () => {
        manager.destroy();
        expect(mockBus.off).toHaveBeenCalled();
    });

    it("destroy is idempotent", () => {
        manager.destroy();
        expect(() => manager.destroy()).not.toThrow();
    });

    it("sheet getter returns the sheet", () => {
        expect(manager.sheet).not.toBeNull();
    });
});