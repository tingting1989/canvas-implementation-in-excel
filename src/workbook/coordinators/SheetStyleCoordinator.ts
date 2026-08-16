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
 *
 * 样式优先级体系（从低到高）：
 * ┌───────────────────────────────────────────────────┐
 * │ 1. 默认样式 (defaultStyle)                        │
 * │ 2. 主题样式 (themeStyle)                          │
 * │ 3. 列样式 (colStyle)                              │
 * │ 4. 行样式 (rowStyle)                              │
 * │ 5. 单元格样式 (cellStyle)                         │
 * │ 6. 列类型默认样式 (typeDefaultStyle)              │
 * │ 7. 单元格配置样式 (cellConfigStyle)               │
 * │ 8. 条件格式样式 (conditionalStyle)                │
 * │ 9. 数据绑定样式 (dataBindStyle)                   │
 * └───────────────────────────────────────────────────┘
 *
 * @class SheetStyleCoordinator
 */
export class SheetStyleCoordinator {
    /** 工作表接口引用 */
    #sheet: ISheet;

    /**
     * @param sheet - 工作表接口实例
     */
    constructor(sheet: ISheet) {
        this.#sheet = sheet;
    }

    /** 获取样式管理器（私有访问器） */
    get #styleManager() {
        return this.#sheet.styleManager;
    }

    /** 获取条件格式管理器（私有访问器） */
    get #conditionalFormat() {
        return this.#sheet.conditionalFormat;
    }

    /**
     * 设置行样式
     *
     * 处理流程：
     * 1. 权限检查
     * 2. 样式对象验证
     * 3. 通过 stylePool 获取样式 ID
     * 4. 记录变更并构建 StyleChangeCommand
     * 5. 使缓存失效
     *
     * @param row - 行号
     * @param styleObj - 样式对象
     */
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

    /**
     * 清除行样式
     * @param row - 行号
     */
    clearRowStyle(row: number): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.clearRowStyle(row);
        this.#sheet._invalidateAll();
    }

    /**
     * 设置列样式
     * @param col - 列号
     * @param styleObj - 样式对象
     */
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

    /**
     * 清除列样式
     * @param col - 列号
     */
    clearColStyle(col: number): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.clearColStyle(col);
        this.#sheet._invalidateAll();
    }

    /**
     * 设置单元格样式
     * @param r - 行号
     * @param c - 列号
     * @param styleObj - 样式对象
     */
    setCellStyle(r: number, c: number, styleObj: StyleObject): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.resetRecorder();
        this.#styleManager.setCellStyle(r, c, styleObj);

        const cmd = this.#styleManager.buildStyleCommand();
        if (cmd) this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history);

        this.#sheet._invalidateAll();
    }

    /**
     * 清除单元格样式
     * @param r - 行号
     * @param c - 列号
     */
    clearCellStyle(r: number, c: number): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.clearCellStyle(r, c);
        this.#sheet._invalidateAll();
    }

    /**
     * 设置区域样式
     *
     * 对区域内所有单元格应用相同样式，通过 StyleChangeRecorder 收集变更，
     * 最终构建单个 StyleChangeCommand 以支持撤销。
     *
     * @param range - 单元格范围
     * @param styleObj - 样式对象
     */
    setRangeStyle(range: CellRange, styleObj: StyleObject): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.resetRecorder();
        this.#styleManager.setRangeStyle(range, styleObj);

        const cmd = this.#styleManager.buildStyleCommand();
        if (cmd) this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history);

        this.#sheet._invalidateAll();
    }

    /**
     * 清除区域样式
     * @param range - 单元格范围
     */
    clearRangeStyle(range: CellRange): void {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.clearRangeStyle(range);
        this.#sheet._invalidateAll();
    }

    /**
     * 设置默认样式
     *
     * 默认样式是样式优先级体系的第 1 层，所有单元格都会继承。
     * 不需要权限检查（默认样式不属于单个单元格操作）。
     *
     * @param styleObj - 样式对象
     */
    setDefaultStyle(styleObj: StyleObject): void {
        this.#styleManager.setDefaultStyle(styleObj);
        this.#sheet._invalidateAll();
    }

    /**
     * 获取默认样式
     * @returns 默认样式对象
     */
    getDefaultStyle(): StyleObject {
        return this.#styleManager.getDefaultStyle();
    }

    /**
     * 批量样式更新
     *
     * 在 beginBatch / endBatch 之间执行所有样式操作，
     * 最终合并为单个撤销步骤。
     *
     * @param fn - 接收 ISheet 引用的操作函数，在函数内执行多个样式操作
     */
    batchStyleUpdate(fn: (sheet: ISheet) => void): void {
        this.#sheet.batchOp.beginBatch();
        try {
            fn(this.#sheet);
        } finally {
            this.#sheet.batchOp.endBatch(this.#sheet.history);
            this.#sheet._invalidateAll();
        }
    }

    /**
     * 解析指定位置的最终合并样式
     *
     * 按样式优先级体系逐层合并，返回最终样式对象。
     * 带帧级缓存，同一渲染帧内相同位置只计算一次。
     *
     * @param r - 行号
     * @param c - 列号
     * @returns 合并后的样式对象
     */
    resolveStyle(r: number, c: number): StyleObject {
        return this.#styleManager.resolveStyle(r, c);
    }

    /**
     * 获取单元格最终样式（resolveStyle 的别名）
     * @param r - 行号
     * @param c - 列号
     * @returns 样式对象
     */
    getCellStyle(r: number, c: number): StyleObject {
        return this.resolveStyle(r, c);
    }

    /**
     * 添加条件格式规则
     *
     * 条件格式是样式优先级体系的第 8 层。
     * 当单元格值满足 condition 时，应用对应的样式。
     *
     * @param options - 条件格式选项
     * @param options.range - 规则生效的单元格范围
     * @param options.condition - 条件判断函数，返回 true 时应用样式
     * @param options.style - 满足条件时应用的样式，默认为空对象
     */
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

    /**
     * 检查是否存在条件格式规则
     * @returns 是否存在规则
     */
    hasConditionalRules(): boolean {
        return this.#conditionalFormat.hasRules();
    }

    /**
     * 匹配条件格式样式
     *
     * 遍历所有条件格式规则，返回第一个匹配的样式 ID。
     *
     * @param r - 行号
     * @param c - 列号
     * @param cell - 单元格数据（用于条件判断）
     * @returns 匹配的样式 ID，未匹配返回 null
     */
    matchConditionalStyle(r: number, c: number, cell: unknown): number | null {
        return this.#conditionalFormat.match(r, c, cell as any);
    }

    /**
     * 检查是否存在数据绑定
     * @returns 是否存在绑定
     */
    hasDataBindings(): boolean {
        return this.#conditionalFormat.hasBindings();
    }

    /**
     * 绑定数据样式映射
     *
     * 数据绑定是样式优先级体系的第 9 层（最高优先级）。
     * 为指定列注册映射函数，将单元格值转换为样式。
     *
     * @param col - 列号
     * @param mapperFn - 值到样式对象的映射函数，返回 null 表示无样式
     */
    bindDataStyle(col: number, mapperFn: (value: unknown) => StyleObject | null): void {
        this.#conditionalFormat.bind(col, (value) => {
            const styleObj = mapperFn(value);
            return styleObj ? stylePool.getStyleId(styleObj) : 0;
        });
    }

    /**
     * 获取数据绑定样式 ID
     * @param r - 行号
     * @param c - 列号
     * @returns 样式 ID，未绑定返回 null
     */
    getDataBindStyle(r: number, c: number): number | null {
        return this.#conditionalFormat.getBinding(r, c);
    }

    /**
     * 获取数据绑定映射表
     * @returns 列号到映射函数的 Map
     */
    get dataBindings(): Map<number, (value: unknown) => number> {
        return this.#conditionalFormat.bindings;
    }

    /**
     * 验证样式对象合法性
     *
     * @param styleObj - 待验证的样式对象
     * @param methodName - 调用方方法名（用于错误消息）
     * @throws TypeError 当 styleObj 不是对象时
     */
    #validateStyleObject(styleObj: unknown, methodName: string): void {
        if (!styleObj || typeof styleObj !== "object") {
            throw new TypeError(`${methodName} expects a style object, received: ${typeof styleObj}`);
        }
    }
}
