import { stylePool } from "../../model/styles";
import { ISheet } from "../interfaces/ISheet.js";

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
    /** @type {ISheet} */
    #sheet;

    /**
     * @param {ISheet} sheet - 所属工作表实例（通过接口访问）
     */
    constructor(sheet) {
        this.#sheet = sheet;
    }

    // ─── 内部属性访问 ─────────────────────────────────

    get #styleManager() {
        return this.#sheet.styleManager;
    }

    get #conditionalFormat() {
        return this.#sheet.conditionalFormat;
    }

    // ─── 样式操作：行级别 ─────────────────────────────

    /**
     * 设置整行的默认样式
     * @param {number} row - 行号
     * @param {Object} styleObj - 样式对象（如 { bold: true, color: 'red' }）
     */
    setRowStyle(row, styleObj) {
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
     * 清除行级别的自定义样式
     * @param {number} row - 行号
     */
    clearRowStyle(row) {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.clearRowStyle(row);
        this.#sheet._invalidateAll();
    }

    // ─── 样式操作：列级别 ─────────────────────────────

    /**
     * 设置整列的默认样式
     * @param {number} col - 列号
     * @param {Object} styleObj - 样式对象
     */
    setColStyle(col, styleObj) {
        if (!this.#sheet._ensureWritable()) return;
        this.#validateStyleObject(styleObj, "setColStyle");

        this.#styleManager.resetRecorder();
        const styleId = stylePool.getStyleId(styleObj);
        this.#styleManager.setColStyle(col, styleId);

        const cmd = this.#styleManager.buildStyleCommand();
        if (cmd) this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history);

        this.#sheet._invalidateAll();
    }

    clearColStyle(col) {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.clearColStyle(col);
        this.#sheet._invalidateAll();
    }

    // ─── 样式操作：单元格级别 ─────────────────────────

    /**
     * 设置单个单元格的自定义样式
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {Object} styleObj - 样式对象
     */
    setCellStyle(r, c, styleObj) {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.resetRecorder();
        this.#styleManager.setCellStyle(r, c, styleObj);

        const cmd = this.#styleManager.buildStyleCommand();
        if (cmd) this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history);

        this.#sheet._invalidateAll();
    }

    clearCellStyle(r, c) {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.clearCellStyle(r, c);
        this.#sheet._invalidateAll();
    }

    // ─── 样式操作：区域级别 ───────────────────────────

    /**
     * 设置矩形区域内所有单元格的样式
     * @param {{topRow:number, topCol:number, bottomRow:number, bottomCol:number}} range - 区域范围
     * @param {Object} styleObj - 样式对象
     */
    setRangeStyle(range, styleObj) {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.resetRecorder();
        this.#styleManager.setRangeStyle(range, styleObj);

        const cmd = this.#styleManager.buildStyleCommand();
        if (cmd) this.#sheet.batchOp.pushCommand(cmd, this.#sheet.history);

        this.#sheet._invalidateAll();
    }

    clearRangeStyle(range) {
        if (!this.#sheet._ensureWritable()) return;
        this.#styleManager.clearRangeStyle(range);
        this.#sheet._invalidateAll();
    }

    // ─── 默认样式 ─────────────────────────────────────

    /**
     * 设置工作表的默认样式（应用于无自定义样式的单元格）
     * @param {Object} styleObj - 样式对象
     */
    setDefaultStyle(styleObj) {
        this.#styleManager.setDefaultStyle(styleObj);
        this.#sheet._invalidateAll();
    }

    /**
     * 获取工作表的默认样式
     * @returns {Object} 默认样式对象
     */
    getDefaultStyle() {
        return this.#styleManager.getDefaultStyle();
    }

    // ─── 批量样式更新 ─────────────────────────────────

    /**
     * 批量样式更新（在单个撤销步骤中执行多个样式修改）
     *
     * 使用场景：
     * - 格式刷应用
     * - 批量修改字体/颜色
     * - 导入样式模板
     *
     * @param {function(sheet: Sheet): void} fn - 样式修改回调函数
     */
    batchStyleUpdate(fn) {
        this.#sheet.batchOp.beginBatch();
        try {
            fn(this.#sheet);
        } finally {
            this.#sheet.batchOp.endBatch(this.#sheet.history);
            this.#sheet._invalidateAll();
        }
    }

    // ─── 样式查询 ─────────────────────────────────────

    /**
     * 获取单元格的最终计算样式
     *
     * 解析优先级（从低到高）：
     * 1. 工作表默认样式
     * 2. 行默认样式
     * 3. 列默认样式
     * 4. 单元格自定义样式
     * 5. 条件格式样式
     * 6. 数据绑定样式
     *
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {Object} 最终样式对象
     */
    resolveStyle(r, c) {
        return this.#styleManager.resolveStyle(r, c);
    }

    /**
     * 获取单元格样式（resolveStyle 的别名）
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {Object}
     */
    getCellStyle(r, c) {
        return this.resolveStyle(r, c);
    }

    // ─── 条件格式 ─────────────────────────────────────

    /**
     * 添加条件格式规则
     *
     * @param {{topRow:number, topCol:number, bottomRow:number, bottomCol:number}} range - 应用范围
     * @param {function(cell: Object): boolean} conditionFn - 条件判断函数
     * @param {number} styleId - 符合条件时应用的样式 ID
     */
    addConditionalRule(range, conditionFn, styleId) {
        this.#conditionalFormat.addRule(range, conditionFn, styleId);
    }

    /**
     * 是否有已定义的条件格式规则
     * @returns {boolean}
     */
    hasConditionalRules() {
        return this.#conditionalFormat.hasRules();
    }

    /**
     * 匹配条件格式样式
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @param {Object} cell - 单元格对象
     * @returns {Object|null} 匹配的样式对象，未匹配返回 null
     */
    matchConditionalStyle(r, c, cell) {
        return this.#conditionalFormat.match(r, c, cell);
    }

    // ─── 数据绑定 ─────────────────────────────────────

    /**
     * 是否有数据绑定规则
     * @returns {boolean}
     */
    hasDataBindings() {
        return this.#conditionalFormat.hasBindings();
    }

    /**
     * 绑定数据到样式映射
     *
     * 将某列的值映射为不同的样式（如：正数绿色、负数红色）
     *
     * @param {number} col - 列号
     * @param {function(value: *): number} mapperFn - 值→样式ID 的映射函数
     */
    bindDataStyle(col, mapperFn) {
        this.#conditionalFormat.bind(col, mapperFn);
    }

    /**
     * 获取数据绑定的样式
     * @param {number} r - 行号
     * @param {number} c - 列号
     * @returns {Object|null}
     */
    getDataBindStyle(r, c) {
        return this.#conditionalFormat.getBinding(r, c);
    }

    /**
     * 获取所有数据绑定（供内部使用）
     * @returns {Map<number, Function>}
     */
    get dataBindings() {
        return this.#conditionalFormat.bindings;
    }

    // ─── 内部工具方法 ─────────────────────────────────

    /**
     * 验证样式对象的有效性
     * @param {*} styleObj - 待验证的对象
     * @param {string} methodName - 调用方法名（用于错误提示）
     * @throws {TypeError} 如果不是有效的样式对象
     */
    #validateStyleObject(styleObj, methodName) {
        if (!styleObj || typeof styleObj !== "object") {
            throw new TypeError(`${methodName} expects a style object, received: ${typeof styleObj}`);
        }
    }
}