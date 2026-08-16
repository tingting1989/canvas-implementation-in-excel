import { stylePool } from "../../model/styles/index";
import type { ISheet } from "../interfaces/ISheet";
import { errorHandler } from "../../core/ErrorHandler";
import { ERROR_CODE } from "../../constants/errorCodes";
import type { StyleObject, CellProperties } from "../interfaces/ISheet";
import type { CellRange } from "../../model/types";

/**
 * 工作表样式协调者
 *
 * 负责：
 * - 行/列/单元格/区域的样式设置与清除
 * - 默认样式管理
 * - 条件格式规则管理
 * - 数据绑定（将数据映射为样式）
 *
 * 设计特点：
 * - 所有样式操作都经过统一的权限检查和命令记录
 * - 支持批量样式更新（batchStyleUpdate）
 * - 样式解析带有帧级缓存，避免重复计算
 * - 通过 ISheet 接口解耦对具体实现的依赖
 */
export class SheetStyleCoordinator {
    #sheet: ISheet;

    constructor(sheet: ISheet) {
        this.#sheet = sheet;
    }

    get #styleManager() {
        return this.#sheet.styleManager;
    }

    get #conditionalFormat() {
        return this.#sheet.conditionalFormat;
    }

    setRowStyle(row: number, styleObj: StyleObject): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#validateStyleObject(styleObj, "setRowStyle");

        this.#styleManager.resetRecorder();
        const styleId = stylePool.getStyleId(styleObj);
        this.#styleManager.setRowStyle(row, styleId);

        const cmd = this.#styleManager.buildStyleCommand();
        if (cmd) this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history);

        this.#sheet._invalidateAll();
    }

    clearRowStyle(row: number): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.clearRowStyle(row);
        this.#sheet._invalidateAll();
    }

    setColStyle(col: number, styleObj: StyleObject): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#validateStyleObject(styleObj, "setColStyle");

        this.#styleManager.resetRecorder();
        const styleId = stylePool.getStyleId(styleObj);
        this.#styleManager.setColStyle(col, styleId);

        const cmd = this.#styleManager.buildStyleCommand();
        if (cmd) this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history);

        this.#sheet._invalidateAll();
    }

    clearColStyle(col: number): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.clearColStyle(col);
        this.#sheet._invalidateAll();
    }

    setCellStyle(r: number, c: number, styleObj: StyleObject): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.resetRecorder();
        this.#styleManager.setCellStyle(r, c, styleObj);

        const cmd = this.#styleManager.buildStyleCommand();
        if (cmd) this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history);

        this.#sheet._invalidateAll();
    }

    clearCellStyle(r: number, c: number): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.clearCellStyle(r, c);
        this.#sheet._invalidateAll();
    }

    setRangeStyle(range: CellRange, styleObj: StyleObject): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.resetRecorder();
        this.#styleManager.setRangeStyle(range, styleObj);

        const cmd = this.#styleManager.buildStyleCommand();
        if (cmd) this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history);

        this.#sheet._invalidateAll();
    }

    clearRangeStyle(range: CellRange): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.clearRangeStyle(range);
        this.#sheet._invalidateAll();
    }

    setDefaultStyle(styleObj: StyleObject): void {
        this.#styleManager.setDefaultStyle(styleObj);
        this.#sheet._invalidateAll();
    }

    getDefaultStyle(): StyleObject {
        return this.#styleManager.getDefaultStyle();
    }

    batchStyleUpdate(fn: (sheet: ISheet) => void): void {
        this.#sheet.batchOp.beginBatch();
        try {
            fn(this.#sheet);
        } finally {
            this.#sheet.batchOp.endBatch(this.#sheet.history);
            this.#sheet._invalidateAll();
        }
    }

    resolveStyle(r: number, c: number): StyleObject {
        return this.#styleManager.resolveStyle(r, c);
    }

    getCellStyle(r: number, c: number): StyleObject {
        return this.resolveStyle(r, c);
    }

    addConditionalRule(options: { range: CellRange; condition: (value: unknown, cell?: unknown) => boolean; style?: StyleObject }): void {
        const { range, condition, style = {} } = options;

        if (!range || typeof condition !== "function") {
            errorHandler.warn(ERROR_CODE.FORMAT_APPLY_ERROR, "addConditionalRule 参数错误: range 或 condition 无效", {
                hasRange: !!range,
                conditionType: typeof condition,
            });
            return;
        }

        const styleId = stylePool.getStyleId(style);
        this.#conditionalFormat.addRule(range, condition, styleId);
    }

    hasConditionalRules(): boolean {
        return this.#conditionalFormat.hasRules();
    }

    matchConditionalStyle(r: number, c: number, cell: unknown): number | null {
        return this.#conditionalFormat.match(r, c, cell as any);
    }

    hasDataBindings(): boolean {
        return this.#conditionalFormat.hasBindings();
    }

    bindDataStyle(col: number, mapperFn: (value: unknown) => StyleObject | null): void {
        this.#conditionalFormat.bind(col, (value) => {
            const styleObj = mapperFn(value);
            return styleObj ? stylePool.getStyleId(styleObj) : 0;
        });
    }

    getDataBindStyle(r: number, c: number): number | null {
        return this.#conditionalFormat.getBinding(r, c);
    }

    get dataBindings(): Map<number, (value: unknown) => number> {
        return this.#conditionalFormat.bindings;
    }

    #validateStyleObject(styleObj: unknown, methodName: string): void {
        if (!styleObj || typeof styleObj !== "object") {
            throw new TypeError(`${methodName} expects a style object, received: ${typeof styleObj}`);
        }
    }
}
