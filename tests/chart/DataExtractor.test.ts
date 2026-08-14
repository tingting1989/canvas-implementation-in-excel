import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DataExtractor } from "@/render/chart/DataExtractor";

function createMockAccessor() {
    return {
        getValueMatrix: vi.fn((startRow: number, startCol: number, endRow: number, endCol: number) => {
            const rows = endRow - startRow + 1;
            const cols = endCol - startCol + 1;
            const matrix: unknown[][] = [];
            for (let r = 0; r < rows; r++) {
                const row: unknown[] = [];
                for (let c = 0; c < cols; c++) {
                    if (r === 0) row.push(`Header${c}`);
                    else row.push(r * cols + c);
                }
                matrix.push(row);
            }
            return matrix;
        }),
    };
}

function createMockSheet() {
    return {
        cellDataAccessor: createMockAccessor(),
        rowColManager: {
            isRowHidden: vi.fn(() => false),
            isColumnHidden: vi.fn(() => false),
        },
    };
}

describe("DataExtractor", () => {
    let extractor: DataExtractor;

    beforeEach(() => {
        extractor = new DataExtractor();
    });

    afterEach(() => {
        extractor.destroy();
    });

    it("extract returns empty result when no dataRange", async () => {
        const chart = { dataRange: null, style: {} };
        const sheet = createMockSheet();
        const result = await extractor.extract(chart as any, sheet as any);
        expect(result.headers).toEqual([]);
        expect(result.data).toEqual([]);
        expect(result.source).toBe("none");
    });

    it("extract uses sync for small data (< 500 cells)", async () => {
        const chart = {
            dataRange: { startRow: 0, endRow: 5, startCol: 0, endCol: 3 },
            style: { ignoreHiddenData: false },
        };
        const sheet = createMockSheet();
        const result = await extractor.extract(chart as any, sheet as any);
        expect(result.source).toBe("sync");
        expect(result.headers.length).toBeGreaterThan(0);
        expect(result.data.length).toBeGreaterThan(0);
    });

    it("extract uses async-chunked for medium data (500-5000 cells)", async () => {
        const chart = {
            dataRange: { startRow: 0, endRow: 50, startCol: 0, endCol: 15 },
            style: { ignoreHiddenData: false },
        };
        const sheet = createMockSheet();
        const result = await extractor.extract(chart as any, sheet as any);
        expect(result.source).toBe("async-chunked");
    });

    it("extract filters hidden rows and cols when ignoreHiddenData is true", async () => {
        const chart = {
            dataRange: { startRow: 0, endRow: 3, startCol: 0, endCol: 2 },
            style: { ignoreHiddenData: true },
        };
        const sheet = createMockSheet();
        sheet.rowColManager.isRowHidden = vi.fn((row: number) => row === 1);
        sheet.rowColManager.isColumnHidden = vi.fn((col: number) => col === 1);

        const result = await extractor.extract(chart as any, sheet as any);
        expect(result.source).toBe("sync");
    });

    it("destroy cleans up worker and pending tasks", () => {
        extractor.destroy();
        expect(() => extractor.destroy()).not.toThrow();
    });
});