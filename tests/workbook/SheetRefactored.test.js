import { describe, it, expect, vi, beforeEach } from "vitest";
import { Sheet } from "@/workbook/Sheet";

describe("Sheet - 重构后代理层完整性测试", () => {
    let sheet;

    beforeEach(() => {
        sheet = new Sheet("TestRefactored");
    });

    // ============================================================
    // 构造函数和属性初始化
    // ============================================================
    describe("构造函数", () => {
        it("应该正确设置所有公开属性", () => {
            expect(sheet.name).toBe("TestRefactored");
            expect(sheet.visible).toBe(true);
            expect(sheet.readOnly).toBe(false);
            expect(sheet.cellPadding).toBeDefined();
            expect(sheet.textOverflowEllipsis).toBeDefined();
            expect(Array.isArray(sheet.cellConfig)).toBe(true);
            expect(sheet.cellsFn).toBeNull();
            expect(sheet.chartManager).toBeNull();
        });

        it("应该创建所有子系统实例", () => {
            expect(sheet.cellStore).toBeDefined();
            expect(sheet.selection).toBeDefined();
            expect(sheet.history).toBeDefined();
            expect(sheet.mergeManager).toBeDefined();
            expect(sheet.rowColManager).toBeDefined();
            expect(sheet.batchOp).toBeDefined();
        });

        it("应该创建所有子管理器（公开属性）", () => {
            expect(sheet.styleManager).toBeDefined();
            expect(sheet.typeManager).toBeDefined();
            expect(sheet.headerLabels).toBeDefined();
            expect(sheet.conditionalFormat).toBeDefined();
            expect(sheet.rowSync).toBeDefined();
            expect(sheet.colSync).toBeDefined();
        });
    });

    // ============================================================
    // 协调者懒初始化
    // ============================================================
    describe("协调者访问器", () => {
        it("data 应该返回 SheetDataCoordinator 实例", () => {
            const data = sheet.data;
            expect(data).toBeDefined();
            expect(data.constructor.name).toBe("SheetDataCoordinator");
        });

        it("styles 应该返回 SheetStyleCoordinator 实例", () => {
            const styles = sheet.styles;
            expect(styles).toBeDefined();
            expect(styles.constructor.name).toBe("SheetStyleCoordinator");
        });

        it("merges 应该返回 SheetMergeCoordinator 实例", () => {
            const merges = sheet.merges;
            expect(merges).toBeDefined();
            expect(merges.constructor.name).toBe("SheetMergeCoordinator");
        });

        it("operations 应该返回 SheetOperationCoordinator 实例", () => {
            const ops = sheet.operations;
            expect(ops).toBeDefined();
            expect(ops.constructor.name).toBe("SheetOperationCoordinator");
        });

        it("meta 应该返回 SheetMetaCoordinator 实例", () => {
            const meta = sheet.meta;
            expect(meta).toBeDefined();
            expect(meta.constructor.name).toBe("SheetMetaCoordinator");
        });

        it("协调者应该是单例（缓存）", () => {
            const data1 = sheet.data;
            const data2 = sheet.data;
            expect(data1).toBe(data2);
        });
    });

    // ============================================================
    // 方法代理完整性
    // ============================================================
    describe("方法代理", () => {
        it("数据操作方法应该正确代理到 SheetDataCoordinator", () => {
            sheet.setCell(0, 0, "test");
            expect(sheet.cellStore.get(0, 0)?.value).toBe("test");

            sheet.disableCell(1, 1);
            expect(sheet.isDisabled(1, 1)).toBe(true);

            sheet.enableCell(1, 1);
            expect(sheet.isDisabled(1, 1)).toBe(false);
        });

        it("样式操作方法应该正确代理到 SheetStyleCoordinator", () => {
            sheet.setRowStyle(0, { bgColor: "red" });
            // 验证方法调用成功
            expect(sheet.rowStyles).toBeDefined();

            sheet.setColStyle(0, { bold: true });
            expect(sheet.colStyles).toBeDefined();
        });

        it("合并操作方法应该正确代理到 SheetMergeCoordinator", () => {
            sheet.mergeCells(0, 0, 2, 2);
            expect(sheet.isMergedCell(1, 1)).toBe(true);

            sheet.unmergeCells(0, 0);
            expect(sheet.getAllMerges().length).toBe(0);
        });

        it("行列操作方法应该正确代理到 SheetOperationCoordinator", () => {
            sheet.insertRow(0);
            sheet.insertCol(0);

            expect(sheet.rowColManager.rowCount).toBeGreaterThan(0);
            expect(sheet.rowColManager.colCount).toBeGreaterThan(0);
        });

        it("元数据操作方法应该正确代理到 SheetMetaCoordinator", () => {
            sheet.rowHeaders = ["Row1"];
            expect(sheet.getRowHeader(0)).toBe("Row1");

            // getColumnType 应该可调用
            const type = sheet.getColumnType(0);
            expect(type === undefined || typeof type === "string").toBe(true);
        });
    });

    // ============================================================
    // 冻结区域和缓存
    // ============================================================
    describe("冻结区域", () => {
        it("应该支持冻结行", () => {
            sheet.fixedRowsTop = 3;
            expect(sheet.fixedRowsTop).toBe(3);
        });

        it("应该支持冻结列", () => {
            sheet.fixedColumnsStart = 2;
            expect(sheet.fixedColumnsStart).toBe(2);
        });

        it("冻结区域高度/宽度应该是非负数", () => {
            sheet.fixedRowsTop = 5;
            const height = sheet.frozenRowsHeight;
            expect(height).toBeGreaterThanOrEqual(0);

            sheet.fixedColumnsStart = 3;
            const width = sheet.frozenColsWidth;
            expect(width).toBeGreaterThanOrEqual(0);
        });

        it("invalidateFreezeCache 应该存在且可调用", () => {
            expect(typeof sheet.invalidateFreezeCache).toBe("function");
            expect(() => sheet.invalidateFreezeCache()).not.toThrow();
        });
    });

    // ============================================================
    // readOnly 模式
    // ============================================================
    describe("readOnly 模式", () => {
        it("应该强制转换为布尔值", () => {
            sheet.readOnly = 1;
            expect(sheet.readOnly).toBe(true);
            expect(typeof sheet.readOnly).toBe("boolean");

            sheet.readOnly = 0;
            expect(sheet.readOnly).toBe(false);

            sheet.readOnly = "true";
            expect(sheet.readOnly).toBe(true);

            sheet.readOnly = "";
            expect(sheet.readOnly).toBe(false);
        });

        it("readOnly 模式下应该阻止修改操作", () => {
            sheet.readOnly = true;

            sheet.setCell(0, 0, "blocked");
            expect(sheet.cellStore.get(0, 0)).toBeUndefined();
        });
    });

    // ============================================================
    // 事件总线
    // ============================================================
    describe("事件总线", () => {
        it("bus 应该是 EventBus 实例", () => {
            expect(sheet.bus).toBeDefined();
            expect(sheet.bus.emit).toBeDefined();
            expect(sheet.bus.on).toBeDefined();
        });

        it("应该能够触发和监听事件", () => {
            const handler = vi.fn();
            sheet.bus.on("customEvent", handler);

            sheet.bus.emit("customEvent", { data: "test" });

            // EventBus 会包装参数为 { payload, type, source, sheetId, timestamp }
            expect(handler).toHaveBeenCalled();
            const callArg = handler.mock.calls[0][0];
            expect(callArg.payload).toEqual({ data: "test" });
            expect(callArg.type).toBe("customEvent");
        });
    });

    // ============================================================
    // 向后兼容性验证
    // ============================================================
    describe("向后兼容性", () => {
        it("原有的公共 API 签名应该保持不变", () => {
            // 测试关键方法的签名
            expect(typeof sheet.setCell).toBe("function");
            expect(typeof sheet.disableCell).toBe("function");
            expect(typeof sheet.enableCell).toBe("function");
            expect(typeof sheet.isDisabled).toBe("function");
            expect(typeof sheet.loadData).toBe("function");
            expect(typeof sheet.setRowStyle).toBe("function");
            expect(typeof sheet.setColStyle).toBe("function");
            expect(typeof sheet.setDefaultStyle).toBe("function");
            expect(typeof sheet.getDefaultStyle).toBe("function");
            expect(typeof sheet.setCellStyle).toBe("function");
            expect(typeof sheet.clearCellStyle).toBe("function");
            expect(typeof sheet.clearRowStyle).toBe("function");
            expect(typeof sheet.clearColStyle).toBe("function");
            expect(typeof sheet.setRangeStyle).toBe("function");
            expect(typeof sheet.clearRangeStyle).toBe("function");
            expect(typeof sheet.batchStyleUpdate).toBe("function");
            expect(typeof sheet.getCellStyle).toBe("function");
            expect(typeof sheet.resolveStyle).toBe("function");
            expect(typeof sheet.addConditionalRule).toBe("function");
            expect(typeof sheet.hasConditionalRules).toBe("function");
            expect(typeof sheet.matchConditionalStyle).toBe("function");
            expect(typeof sheet.bindDataStyle).toBe("function");
            expect(typeof sheet.getDataBindStyle).toBe("function");
            expect(typeof sheet.mergeCells).toBe("function");
            expect(typeof sheet.unmergeCells).toBe("function");
            expect(typeof sheet.getMerge).toBe("function");
            expect(typeof sheet.isMergeTopLeft).toBe("function");
            expect(typeof sheet.isMergedCell).toBe("function");
            expect(typeof sheet.getAllMerges).toBe("function");
            expect(typeof sheet.insertRow).toBe("function");
            expect(typeof sheet.insertCol).toBe("function");
            expect(typeof sheet.deleteRow).toBe("function");
            expect(typeof sheet.deleteCol).toBe("function");
            expect(typeof sheet.moveRow).toBe("function");
            expect(typeof sheet.moveCol).toBe("function");
            expect(typeof sheet.undo).toBe("function");
            expect(typeof sheet.redo).toBe("function");
            expect(typeof sheet.render).toBe("function");
            expect(typeof sheet.beginBatch).toBe("function");
            expect(typeof sheet.endBatch).toBe("function");
            expect(typeof sheet.setRowCount).toBe("function");
            expect(typeof sheet.setColCount).toBe("function");
            expect(typeof sheet.setGridSize).toBe("function");
            expect(typeof sheet.applyCellConfig).toBe("function");
            expect(typeof sheet.resolveCellProperties).toBe("function");
            expect(typeof sheet.formatCellValue).toBe("function");
            expect(typeof sheet.parseCellValue).toBe("function");
            expect(typeof sheet.validateCellValue).toBe("function");
            expect(typeof sheet.getColumnType).toBe("function");
            expect(typeof sheet.getRowHeader).toBe("function");
            expect(typeof sheet.getColHeader).toBe("function");
            expect(typeof sheet.invalidateFreezeCache).toBe("function");
            expect(typeof sheet._ensureWritable).toBe("function");
            expect(typeof sheet._invalidateAll).toBe("function");
            expect(typeof sheet._invalidateCell).toBe("function");
        });

        it("getter/setter 应该正常工作", () => {
            sheet.visible = false;
            expect(sheet.visible).toBe(false);

            sheet.name = "NewName";
            expect(sheet.name).toBe("NewName");
        });

        it("公开属性 getter 应该正常工作", () => {
            expect(() => sheet.rowStyles).not.toThrow();
            expect(() => sheet.colStyles).not.toThrow();
            expect(() => sheet.dataBindings).not.toThrow();
            expect(() => sheet.columnsConfig).not.toThrow();
            expect(() => sheet.cellTypes).not.toThrow();
            expect(() => sheet.colHeaders).not.toThrow();
            expect(() => sheet.rowHeaders).not.toThrow();
            expect(() => sheet.nestedHeaders).not.toThrow();
            expect(() => sheet.cellDataAccessor).not.toThrow();
        });
    });

    // ============================================================
    // 性能相关
    // ============================================================
    describe("性能优化", () => {
        it("frozenRowsHeight/frozenColsWidth 应该快速响应", () => {
            sheet.fixedRowsTop = 100;

            const start = performance.now();
            for (let i = 0; i < 100; i++) {
                const h = sheet.frozenRowsHeight;
                void h; // 使用变量避免优化掉
            }
            const duration = performance.now() - start;

            // 100次调用应该在合理时间内完成（<50ms）
            expect(duration).toBeLessThan(50);
        });

        it("协调者懒初始化不应该影响首次访问性能", () => {
            const start = performance.now();
            const data = sheet.data; // 首次访问触发初始化
            const duration = performance.now() - start;

            expect(data).toBeDefined();
            // 初始化时间应该在合理范围内（<200ms）
            expect(duration).toBeLessThan(200);
        });
    });

    // ============================================================
    // cellDataAccessor 访问器
    // ============================================================
    describe("cellDataAccessor", () => {
        it("应该返回 CellDataAccessor 实例", () => {
            const accessor = sheet.cellDataAccessor;
            expect(accessor).toBeDefined();
            expect(accessor.constructor.name).toBe("CellDataAccessor");
        });

        it("应该与 sheet.data.dataAccessor 返回相同实例", () => {
            const accessor1 = sheet.cellDataAccessor;
            const accessor2 = sheet.data.dataAccessor;
            expect(accessor1).toBe(accessor2);
        });
    });
});