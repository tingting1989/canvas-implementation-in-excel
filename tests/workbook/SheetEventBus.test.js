import { describe, it, expect, vi, beforeEach } from "vitest";
import { Sheet } from "../../src/workbook/Sheet.js";
import { SHEET_EVENTS } from "../../src/constants/sheetEvents.js";
import { EventBus } from "../../src/core/EventBus.js";

describe("Sheet - EventBus Integration", () => {
    let sheet;

    beforeEach(() => {
        sheet = new Sheet("TestSheet");
    });

    describe("bus property", () => {
        it("should expose bus as EventBus instance", () => {
            expect(sheet.bus).toBeInstanceOf(EventBus);
        });

        it("should return the same bus instance on each access", () => {
            expect(sheet.bus).toBe(sheet.bus);
        });
    });

    describe("INVALIDATE_ALL event", () => {
        it("should emit INVALIDATE_ALL on setRowStyle", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_ALL, handler);
            sheet.setRowStyle(0, { backgroundColor: "yellow" });
            expect(handler).toHaveBeenCalledOnce();
        });

        it("should emit INVALIDATE_ALL on setColStyle", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_ALL, handler);
            sheet.setColStyle(0, { textAlign: "right" });
            expect(handler).toHaveBeenCalledOnce();
        });

        it("should emit INVALIDATE_ALL on loadData", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_ALL, handler);
            sheet.loadData([["a", "b"], ["c", "d"]]);
            expect(handler).toHaveBeenCalled();
        });

        it("should emit INVALIDATE_ALL on insertRow", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_ALL, handler);
            sheet.insertRow(0);
            expect(handler).toHaveBeenCalled();
        });

        it("should emit INVALIDATE_ALL on deleteRow", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_ALL, handler);
            sheet.deleteRow(0);
            expect(handler).toHaveBeenCalled();
        });

        it("should emit INVALIDATE_ALL on undo", () => {
            sheet.setCell(0, 0, "val");
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_ALL, handler);
            sheet.undo();
            expect(handler).toHaveBeenCalled();
        });

        it("should emit INVALIDATE_ALL on redo", () => {
            sheet.setCell(0, 0, "val");
            sheet.undo();
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_ALL, handler);
            sheet.redo();
            expect(handler).toHaveBeenCalled();
        });
    });

    describe("INVALIDATE_CELL event", () => {
        it("should emit INVALIDATE_CELL with r, c, pageRow on setCell", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_CELL, handler);
            sheet.setCell(0, 0, "value");
            expect(handler).toHaveBeenCalledOnce();
            const envelope = handler.mock.calls[0][0];
            expect(envelope.payload).toHaveProperty("r", 0);
            expect(envelope.payload).toHaveProperty("c", 0);
            expect(envelope.payload).toHaveProperty("pageRow", 0);
        });

        it("should emit INVALIDATE_CELL on disableCell", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_CELL, handler);
            sheet.disableCell(0, 0);
            expect(handler).toHaveBeenCalledOnce();
        });

        it("should emit INVALIDATE_CELL on enableCell", () => {
            sheet.setCell(0, 0, "val");
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_CELL, handler);
            sheet.enableCell(0, 0);
            expect(handler).toHaveBeenCalledOnce();
        });
    });

    describe("RENDER_REQUEST event", () => {
        it("should emit RENDER_REQUEST on sheet.render()", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.RENDER_REQUEST, handler);
            sheet.render();
            expect(handler).toHaveBeenCalledOnce();
            const envelope = handler.mock.calls[0][0];
            expect(envelope.type).toBe(SHEET_EVENTS.RENDER_REQUEST);
        });
    });

    describe("FORMULA_SET event", () => {
        it("should emit FORMULA_SET when value starts with =", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, handler);
            sheet.setCell(0, 0, "=SUM(A1:A3)");
            expect(handler).toHaveBeenCalledOnce();
            const envelope = handler.mock.calls[0][0];
            expect(envelope.payload.formula).toBe("=SUM(A1:A3)");
            expect(envelope.payload.r).toBe(0);
            expect(envelope.payload.c).toBe(0);
        });

        it("should not emit FORMULA_SET for non-formula values", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, handler);
            sheet.setCell(0, 0, "hello");
            expect(handler).not.toHaveBeenCalled();
        });

        it("should use returned value from FORMULA_SET listener as cell value", () => {
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, () => 42);
            sheet.setCell(0, 0, "=1+1");
            expect(sheet.cellStore.get(0, 0)?.value).toBe(42);
        });

        it("should fall back to formula string when no listener returns value", () => {
            sheet.setCell(0, 0, "=1+1");
            expect(sheet.cellStore.get(0, 0)?.value).toBe("=1+1");
        });
    });

    describe("FORMULA_REMOVE event", () => {
        it("should emit FORMULA_REMOVE when overwriting a formula with non-formula", () => {
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, () => 42);
            sheet.setCell(0, 0, "=1+1");
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.FORMULA_REMOVE, handler);
            sheet.setCell(0, 0, "plain");
            expect(handler).toHaveBeenCalledOnce();
            const envelope = handler.mock.calls[0][0];
            expect(envelope.payload.r).toBe(0);
            expect(envelope.payload.c).toBe(0);
        });
    });

    describe("CELL_CHANGED event", () => {
        it("should emit CELL_CHANGED for non-formula setCell", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.CELL_CHANGED, handler);
            sheet.setCell(0, 0, "hello");
            expect(handler).toHaveBeenCalledOnce();
            const envelope = handler.mock.calls[0][0];
            expect(envelope.payload.r).toBe(0);
            expect(envelope.payload.c).toBe(0);
        });

        it("should not emit CELL_CHANGED for formula setCell", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.CELL_CHANGED, handler);
            sheet.setCell(0, 0, "=1+1");
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe("UNDO / REDO events", () => {
        it("should emit UNDO on sheet.undo()", () => {
            sheet.setCell(0, 0, "val");
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.UNDO, handler);
            sheet.undo();
            expect(handler).toHaveBeenCalledOnce();
            const envelope = handler.mock.calls[0][0];
            expect(envelope.type).toBe(SHEET_EVENTS.UNDO);
        });

        it("should emit REDO on sheet.redo()", () => {
            sheet.setCell(0, 0, "val");
            sheet.undo();
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.REDO, handler);
            sheet.redo();
            expect(handler).toHaveBeenCalledOnce();
            const envelope = handler.mock.calls[0][0];
            expect(envelope.type).toBe(SHEET_EVENTS.REDO);
        });
    });

    describe("AFTER_CHANGE event", () => {
        it("should emit AFTER_CHANGE on setRowCount", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.AFTER_CHANGE, handler);
            sheet.setRowCount(50);
            expect(handler).toHaveBeenCalledOnce();
        });

        it("should emit AFTER_CHANGE on setColCount", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.AFTER_CHANGE, handler);
            sheet.setColCount(10);
            expect(handler).toHaveBeenCalledOnce();
        });

        it("should emit AFTER_CHANGE on setGridSize", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.AFTER_CHANGE, handler);
            sheet.setGridSize(50, 10);
            expect(handler).toHaveBeenCalledOnce();
        });
    });

    describe("ROW_COL_RESIZE event", () => {
        it("should emit ROW_COL_RESIZE on setRowCount", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.ROW_COL_RESIZE, handler);
            sheet.setRowCount(50);
            expect(handler).toHaveBeenCalledOnce();
        });

        it("should emit ROW_COL_RESIZE on setGridSize", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.ROW_COL_RESIZE, handler);
            sheet.setGridSize(50, 10);
            expect(handler).toHaveBeenCalledOnce();
        });
    });

    describe("Sheet independence (no workbook reference needed)", () => {
        it("should work without workbook reference", () => {
            expect(() => sheet.setCell(0, 0, "hello")).not.toThrow();
            expect(sheet.cellStore.get(0, 0)?.value).toBe("hello");
        });

        it("should emit events without workbook reference", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_CELL, handler);
            sheet.setCell(0, 0, "hello");
            expect(handler).toHaveBeenCalled();
        });

        it("should handle formula without workbook/formulaEngine", () => {
            sheet.setCell(0, 0, "=1+1");
            expect(sheet.cellStore.get(0, 0)?.value).toBe("=1+1");
        });

        it("should handle undo without workbook/formulaEngine", () => {
            sheet.setCell(0, 0, "val");
            sheet.undo();
            expect(sheet.cellStore.get(0, 0)).toBeUndefined();
        });

        it("should handle redo without workbook/formulaEngine", () => {
            sheet.setCell(0, 0, "val");
            sheet.undo();
            sheet.redo();
            expect(sheet.cellStore.get(0, 0)?.value).toBe("val");
        });
    });

    describe("Service locator events", () => {
        it("should resolve GET_CLIPBOARD via bus", () => {
            const mockClipboard = { copy: vi.fn() };
            sheet.bus.on(SHEET_EVENTS.GET_CLIPBOARD, () => mockClipboard);
            const result = sheet.bus.emit(SHEET_EVENTS.GET_CLIPBOARD, undefined, { source: "TileRenderer" });
            expect(result).toBe(mockClipboard);
        });

        it("should resolve GET_PLUGIN via bus", () => {
            const mockPlugin = { freeze: vi.fn() };
            sheet.bus.on(SHEET_EVENTS.GET_PLUGIN, (envelope) => {
                if (envelope.payload.name === "freeze") return mockPlugin;
            });
            const result = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "freeze" }, { source: "ContextMenuStrategy" });
            expect(result).toBe(mockPlugin);
        });

        it("should return undefined for GET_CLIPBOARD when no listener", () => {
            const result = sheet.bus.emit(SHEET_EVENTS.GET_CLIPBOARD, undefined, { source: "TileRenderer" });
            expect(result).toBeUndefined();
        });

        it("should return undefined for GET_PLUGIN when no listener", () => {
            const result = sheet.bus.emit(SHEET_EVENTS.GET_PLUGIN, { name: "nonexistent" }, { source: "ContextMenuStrategy" });
            expect(result).toBeUndefined();
        });
    });

    describe("BEFORE_CHANGE event", () => {
        it("should emit BEFORE_CHANGE with changes array in payload", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.BEFORE_CHANGE, handler);
            const changes = [{ row: 0, col: 0, oldValue: "", newValue: "test" }];
            sheet.bus.emit(SHEET_EVENTS.BEFORE_CHANGE, changes, { source: "CellEditor" });
            expect(handler).toHaveBeenCalledOnce();
            const envelope = handler.mock.calls[0][0];
            expect(envelope.payload).toBe(changes);
        });
    });

    describe("Event envelope metadata", () => {
        it("should include source, sheetId, timestamp, type in every envelope", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_CELL, handler);
            sheet.setCell(0, 0, "val");
            const envelope = handler.mock.calls[0][0];
            expect(envelope).toHaveProperty("source", "Sheet");
            expect(envelope).toHaveProperty("sheetId", "TestSheet");
            expect(envelope).toHaveProperty("timestamp");
            expect(typeof envelope.timestamp).toBe("number");
            expect(envelope).toHaveProperty("type", SHEET_EVENTS.INVALIDATE_CELL);
            expect(envelope).toHaveProperty("payload");
        });

        it("should allow source override via emit options", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.BEFORE_CHANGE, handler);
            sheet.bus.emit(SHEET_EVENTS.BEFORE_CHANGE, [], { source: "CellEditor" });
            const envelope = handler.mock.calls[0][0];
            expect(envelope.source).toBe("CellEditor");
        });

        it("should use bus default source when no override", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_CELL, handler);
            sheet.setCell(0, 0, "val");
            const envelope = handler.mock.calls[0][0];
            expect(envelope.source).toBe("Sheet");
        });
    });
});

describe("Sheet - EventBus Aggressive Tests", () => {
    let sheet;

    beforeEach(() => {
        sheet = new Sheet("AggressiveSheet");
    });

    describe("Multiple subscribers on same event", () => {
        it("should notify all subscribers of FORMULA_SET", () => {
            const h1 = vi.fn();
            const h2 = vi.fn();
            const h3 = vi.fn();
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, h1);
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, h2);
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, h3);
            sheet.setCell(0, 0, "=1");
            expect(h1).toHaveBeenCalledOnce();
            expect(h2).toHaveBeenCalledOnce();
            expect(h3).toHaveBeenCalledOnce();
        });

        it("should use last non-undefined return from FORMULA_SET listeners", () => {
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, () => 10);
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, () => 20);
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, () => 30);
            sheet.setCell(0, 0, "=1");
            expect(sheet.cellStore.get(0, 0)?.value).toBe(30);
        });
    });

    describe("Rapid operations", () => {
        it("should handle 1000 setCell calls with INVALIDATE_CELL listeners", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_CELL, handler);
            for (let i = 0; i < 1000; i++) {
                sheet.setCell(0, i, `val-${i}`);
            }
            expect(handler).toHaveBeenCalledTimes(1000);
        });

        it("should handle rapid on/off during operations", () => {
            const handler = vi.fn();
            const unsub = sheet.bus.on(SHEET_EVENTS.INVALIDATE_CELL, handler);
            sheet.setCell(0, 0, "a");
            unsub();
            sheet.setCell(0, 1, "b");
            expect(handler).toHaveBeenCalledOnce();
        });
    });

    describe("Event data integrity", () => {
        it("should pass correct row/col in INVALIDATE_CELL for different cells", () => {
            const events = [];
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_CELL, (envelope) => events.push({ r: envelope.payload.r, c: envelope.payload.c }));
            sheet.setCell(5, 3, "val1");
            sheet.setCell(10, 7, "val2");
            expect(events).toEqual([
                { r: 5, c: 3 },
                { r: 10, c: 7 },
            ]);
        });

        it("should pass correct formula string in FORMULA_SET", () => {
            const events = [];
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, (envelope) => events.push(envelope.payload.formula));
            sheet.setCell(0, 0, "=A1+B1");
            sheet.setCell(1, 1, "=SUM(C1:C10)");
            expect(events).toEqual(["=A1+B1", "=SUM(C1:C10)"]);
        });

        it("should include sheetId in all envelopes", () => {
            const envelopes = [];
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_ALL, (env) => envelopes.push(env));
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_CELL, (env) => envelopes.push(env));
            sheet.bus.on(SHEET_EVENTS.RENDER_REQUEST, (env) => envelopes.push(env));
            sheet.setCell(0, 0, "val");
            sheet.render();
            for (const env of envelopes) {
                expect(env.sheetId).toBe("AggressiveSheet");
            }
        });
    });

    describe("Read-only mode interaction", () => {
        it("should not emit any events when sheet is read-only and setCell is called", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_ALL, handler);
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_CELL, handler);
            sheet.bus.on(SHEET_EVENTS.CELL_CHANGED, handler);
            sheet.readOnly = true;
            sheet.setCell(0, 0, "val");
            expect(handler).not.toHaveBeenCalled();
        });

        it("should not emit events when undo is called on read-only sheet", () => {
            sheet.setCell(0, 0, "val");
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.UNDO, handler);
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_ALL, handler);
            sheet.readOnly = true;
            sheet.undo();
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe("Bus isolation between sheets", () => {
        it("should have independent buses for different sheets", () => {
            const sheet2 = new Sheet("Sheet2");
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_CELL, handler1);
            sheet2.bus.on(SHEET_EVENTS.INVALIDATE_CELL, handler2);
            sheet.setCell(0, 0, "val");
            expect(handler1).toHaveBeenCalledOnce();
            expect(handler2).not.toHaveBeenCalled();
        });

        it("should not cross-emit between sheet buses", () => {
            const sheet2 = new Sheet("Sheet2");
            const handler = vi.fn();
            sheet2.bus.on(SHEET_EVENTS.INVALIDATE_CELL, handler);
            for (let i = 0; i < 100; i++) {
                sheet.setCell(0, i, `val-${i}`);
            }
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe("loadData event sequence", () => {
        it("should emit FORMULA_SET for formula cells in loadData", () => {
            const formulaHandler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, formulaHandler);
            sheet.loadData([["=A1", "hello"], ["=B2", "world"]]);
            expect(formulaHandler).toHaveBeenCalledTimes(2);
        });
    });

    describe("Event ordering", () => {
        it("should emit CELL_CHANGED after INVALIDATE_CELL for non-formula setCell", () => {
            const order = [];
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_CELL, () => order.push("invalidate"));
            sheet.bus.on(SHEET_EVENTS.CELL_CHANGED, () => order.push("changed"));
            sheet.setCell(0, 0, "hello");
            expect(order).toEqual(["invalidate", "changed"]);
        });

        it("should emit UNDO before INVALIDATE_ALL on undo", () => {
            sheet.setCell(0, 0, "val");
            const order = [];
            sheet.bus.on(SHEET_EVENTS.UNDO, () => order.push("undo"));
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_ALL, () => order.push("invalidate"));
            sheet.undo();
            expect(order).toEqual(["undo", "invalidate"]);
        });
    });

    describe("Boundary conditions", () => {
        it("should handle setCell at max row/col indices", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_CELL, handler);
            sheet.setCell(9999, 25, "edge");
            expect(handler).toHaveBeenCalledOnce();
        });

        it("should handle loadData with empty array", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_ALL, handler);
            sheet.loadData([]);
            expect(handler).not.toHaveBeenCalled();
        });

        it("should handle setRowCount with 1 (minimum)", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.ROW_COL_RESIZE, handler);
            sheet.setRowCount(1);
            expect(handler).toHaveBeenCalledOnce();
        });

        it("should not emit ROW_COL_RESIZE for invalid setRowCount", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.ROW_COL_RESIZE, handler);
            sheet.setRowCount(0);
            sheet.setRowCount(-1);
            sheet.setRowCount(1.5);
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe("Formula result propagation via EventBus", () => {
        it("should propagate FORMULA_SET result back to cell value", () => {
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, (envelope) => {
                if (envelope.payload.formula === "=1+1") return 2;
                if (envelope.payload.formula === "=2*3") return 6;
                return undefined;
            });
            sheet.setCell(0, 0, "=1+1");
            sheet.setCell(1, 1, "=2*3");
            expect(sheet.cellStore.get(0, 0)?.value).toBe(2);
            expect(sheet.cellStore.get(1, 1)?.value).toBe(6);
        });

        it("should handle FORMULA_SET listener that returns undefined", () => {
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, () => undefined);
            sheet.setCell(0, 0, "=unknown");
            expect(sheet.cellStore.get(0, 0)?.value).toBe("=unknown");
        });

        it("should handle multiple FORMULA_SET listeners with only one returning value", () => {
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, () => undefined);
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, () => 99);
            sheet.bus.on(SHEET_EVENTS.FORMULA_SET, () => undefined);
            sheet.setCell(0, 0, "=test");
            expect(sheet.cellStore.get(0, 0)?.value).toBe(99);
        });
    });

    describe("Event cleanup", () => {
        it("should allow removing all listeners via bus.removeAll", () => {
            const handler = vi.fn();
            sheet.bus.on(SHEET_EVENTS.INVALIDATE_CELL, handler);
            sheet.bus.removeAll();
            sheet.setCell(0, 0, "val");
            expect(handler).not.toHaveBeenCalled();
        });
    });
});