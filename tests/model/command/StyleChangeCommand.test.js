import { describe, it, expect, beforeEach, vi } from "vitest";
import { Sheet } from "../../../src/workbook/Sheet.js";
import { StyleChangeRecorder, StyleChangeCommand } from "../../../src/model/command/StyleChangeRecorder.js";
import { stylePool } from "../../../src/model/styles/index.js";

describe("StyleChangeCommand", () => {
    let sheet;

    beforeEach(() => {
        sheet = new Sheet("Test");
    });

    it("should undo setCellStyle", () => {
        sheet.setCell(0, 0, "hello");
        const originalStyle = sheet.resolveStyle(0, 0);

        sheet.setCellStyle(0, 0, { fontWeight: "bold" });
        const afterSet = sheet.resolveStyle(0, 0);
        expect(afterSet.fontWeight).toBe("bold");

        sheet.history.undo();
        const afterUndo = sheet.resolveStyle(0, 0);
        expect(afterUndo.fontWeight).toBeUndefined();
    });

    it("should redo setCellStyle after undo", () => {
        sheet.setCell(0, 0, "hello");
        sheet.setCellStyle(0, 0, { fontWeight: "bold" });
        sheet.history.undo();

        sheet.history.redo();
        const afterRedo = sheet.resolveStyle(0, 0);
        expect(afterRedo.fontWeight).toBe("bold");
    });

    it("should undo setRowStyle", () => {
        sheet.setRowStyle(0, { backgroundColor: "yellow" });
        const afterSet = sheet.resolveStyle(0, 0);
        expect(afterSet.backgroundColor).toBe("yellow");

        sheet.history.undo();
        const afterUndo = sheet.resolveStyle(0, 0);
        expect(afterUndo.backgroundColor).toBe("transparent");
    });

    it("should undo setColStyle", () => {
        sheet.setColStyle(0, { textAlign: "right" });
        const afterSet = sheet.resolveStyle(0, 0);
        expect(afterSet.textAlign).toBe("right");

        sheet.history.undo();
        const afterUndo = sheet.resolveStyle(0, 0);
        expect(afterUndo.textAlign).toBe("left");
    });

    it("should undo setRangeStyle", () => {
        sheet.setRangeStyle(
            { topRow: 0, topCol: 0, bottomRow: 0, bottomCol: 5 },
            { fontWeight: "bold" }
        );
        const afterSet = sheet.resolveStyle(0, 0);
        expect(afterSet.fontWeight).toBe("bold");

        sheet.history.undo();
        const afterUndo = sheet.resolveStyle(0, 0);
        expect(afterUndo.fontWeight).toBeUndefined();
    });
});

describe("StyleChangeRecorder", () => {
    it("should record multiple changes and build single command", () => {
        const recorder = new StyleChangeRecorder();
        recorder.record("row", 0, 0, 1);
        recorder.record("row", 1, 0, 2);
        recorder.record("col", 0, 0, 3);

        expect(recorder.size).toBe(3);

        const mockManager = {
            applyStyleId: vi.fn(),
        };
        const cmd = recorder.buildCommand(mockManager);
        expect(cmd).toBeInstanceOf(StyleChangeCommand);

        cmd.redo();
        expect(mockManager.applyStyleId).toHaveBeenCalledTimes(3);
    });

    it("should undo in reverse order", () => {
        const recorder = new StyleChangeRecorder();
        recorder.record("row", 0, 0, 1);
        recorder.record("row", 1, 0, 2);

        const applyCalls = [];
        const mockManager = {
            applyStyleId(type, key, styleId) {
                applyCalls.push({ type, key, styleId });
            },
        };

        const cmd = recorder.buildCommand(mockManager);
        cmd.undo();

        expect(applyCalls).toHaveLength(2);
        expect(applyCalls[0]).toEqual({ type: "row", key: 1, styleId: 0 });
        expect(applyCalls[1]).toEqual({ type: "row", key: 0, styleId: 0 });
    });

    it("should reset recorder after building command", () => {
        const recorder = new StyleChangeRecorder();
        recorder.record("row", 0, 0, 1);
        recorder.buildCommand({ applyStyleId() {} });
        expect(recorder.size).toBe(0);
    });

    it("should return null when building command from empty recorder", () => {
        const recorder = new StyleChangeRecorder();
        const cmd = recorder.buildCommand({});
        expect(cmd).toBeNull();
    });
});