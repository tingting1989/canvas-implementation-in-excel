import { getType, getColumnTypeFromConfig, resolveCellType, extractTypeOptions, formatValue, parseValue, validateValue } from "../../types";
import { isFunction, isObject } from "../../utils/utils.js";
import { errorHandler, ERROR_CODE } from "@/core/ErrorHandler.js";

/**
 * 列类型管理器
 *
 * 负责管理单个工作表（Sheet）的列类型体系，包括：
 * - 列配置的读取与查询（getColumnConfig / getColumnType）
 * - 列类型实例的创建（getColumnTypeInstance / getCellTypeInstance）
 * - 列配置的应用（applyColumnsConfig）：将 columns 数组解析到 columnsConfig、colStyles、列宽等
 * - 单元格值的格式化、验证、解析（委托 BaseColumnType 实例）
 *
 * 类型解析优先级（getCellTypeInstance）：
 *   单元格级别类型（cellTypes） → 列级别类型（columnsConfig） → 默认 text 类型
 */
export class ColumnTypeManager {
    /** 所属工作表引用 */
    #sheet;

    /** 列配置映射 col → ColumnConfig */
    #columnsConfig = new Map();

    /** 单元格级别类型配置映射 key("r,c") → {name, options} */
    #cellTypes = new Map();

    /**
     * @param {import("../Sheet.js").Sheet} sheet - 所属工作表实例
     */
    constructor(sheet) {
        this.#sheet = sheet;
    }

    /** 列配置 Map（供 RowColSync 等内部模块访问） */
    get columnsConfig() {
        return this.#columnsConfig;
    }

    /** 单元格类型 Map（供 RowColSync 等内部模块访问） */
    get cellTypes() {
        return this.#cellTypes;
    }

    /**
     * 获取指定列的配置对象
     * @param {number} col - 列号
     * @returns {Object|null} 列配置对象，无配置时返回 null
     */
    getColumnConfig(col) {
        return this.#columnsConfig.get(col) || null;
    }

    /**
     * 获取指定列的类型名称
     * @param {number} col - 列号
     * @returns {string} 类型名称（如 "text"、"numeric"、"date"），默认 "text"
     */
    getColumnType(col) {
        return this.#columnsConfig.get(col)?.type || "text";
    }

    /**
     * 检查选区范围内所有列的类型是否一致
     *
     * 用于判断多列选区是否可以统一应用某种类型操作（如编辑器选择）。
     *
     * @param {number} topCol - 起始列号
     * @param {number} bottomCol - 结束列号
     * @returns {boolean} 类型一致返回 true，否则 false
     */
    checkColumnTypeConsistency(topCol, bottomCol) {
        const firstType = this.getColumnType(topCol);
        for (let c = topCol + 1; c <= bottomCol; c++) {
            if (this.getColumnType(c) !== firstType) return false;
        }
        return true;
    }

    /**
     * 获取列级别的 BaseColumnType 实例
     *
     * 仅根据列配置（columnsConfig）创建类型实例，不考虑单元格级别覆盖。
     * 适用于需要列级别类型行为的场景（如列默认样式）。
     *
     * @param {number} col - 列号
     * @returns {import("../../types/BaseColumnType.js").BaseColumnType} 列类型实例
     */
    getColumnTypeInstance(col) {
        return getColumnTypeFromConfig(this.#columnsConfig.get(col));
    }

    /**
     * 获取单元格级别的 BaseColumnType 实例
     *
     * 解析优先级：单元格类型配置（cellTypes） → 列配置（columnsConfig） → 默认 text
     * 适用于需要精确单元格类型行为的场景（如格式化、验证、编辑器选择）。
     *
     * @param {number} r - 页面行号（pageRow）
     * @param {number} c - 列号
     * @returns {import("../../types/BaseColumnType.js").BaseColumnType} 单元格类型实例
     */
    getCellTypeInstance(r, c) {
        const cellProps = this.#sheet.resolveCellProperties(r, c);
        if (cellProps?.type) {
            const { type: name, ...rest } = cellProps;
            return getType(name, extractTypeOptions(rest));
        }

        return resolveCellType(r, c, this.#cellTypes, this.#columnsConfig);
    }

    /**
     * 应用列配置数组
     *
     * 将 columns 配置数组解析并应用到工作表的各个子系统：
     * - columnsConfig：存储每列的完整配置对象
     * - rowColManager：设置列宽
     * - colStyles：设置列样式（通过 stylePool 转为 ID）
     * - rowColManager：确保禁用/只读列的尺寸已分配
     *
     * 支持函数式配置：数组元素可以是函数，接收列号作为参数，返回配置对象。
     *
     * @param {Array<Object|Function>} columnsConfig - 列配置数组
     */
    applyColumnsConfig(columnsConfig) {
        if (!Array.isArray(columnsConfig)) return;

        for (let c = 0; c < columnsConfig.length; c++) {
            let config = columnsConfig[c];

            // 支持函数式配置：config 可以是返回配置对象的函数
            if (isFunction(config)) {
                try {
                    config = config(c);
                } catch (error) {
                    errorHandler.handle(ERROR_CODE.TYPE_PARSE_ERROR, `Column config function failed at column ${c}`, { originalError: error });
                    continue;
                }
            }

            // 跳过无效配置
            if (!config || !isObject(config)) continue;

            // 存储列配置到 columnsConfig Map
            this.#columnsConfig.set(c, config);

            // 应用列宽配置
            if (config.width != null) {
                this.#sheet.rowColManager.setColWidth(c, config.width);
            }

            // 应用列样式配置，通过 Sheet API（解耦，不再直接写入 colStyles Map）
            if (config.style) {
                this.#sheet.setColStyle(c, config.style);
            }

            // 禁用/只读列需要确保行列表尺寸已分配，以便渲染禁用状态
            if (config.disabled === true || config.readOnly === true) {
                this.#sheet.rowColManager.ensureSize(1, c + 1);
            }
        }
    }

    /**
     * 格式化单元格值用于显示
     *
     * 委托 BaseColumnType.format() 将原始值转为显示文本。
     * 例如：数字类型添加千分位，日期类型按模式格式化。
     *
     * @param {number} r - 页面行号
     * @param {number} c - 列号
     * @param {*} value - 原始值
     * @returns {string} 格式化后的显示文本
     */
    formatCellValue(r, c, value) {
        return formatValue(this.getCellTypeInstance(r, c), value);
    }

    /**
     * 验证单元格值是否有效
     *
     * 委托 BaseColumnType.validate() 和列配置中的 validator 进行双重验证。
     *
     * @param {number} r - 页面行号
     * @param {number} c - 列号
     * @param {*} value - 待验证的值
     * @returns {boolean|string} true 表示有效，false 或错误信息字符串表示无效
     */
    validateCellValue(r, c, value) {
        return validateValue(this.getCellTypeInstance(r, c), value, this.#columnsConfig.get(c));
    }

    /**
     * 解析用户输入为原始值
     *
     * 委托 BaseColumnType.parse() 将用户输入的字符串转为对应类型的值。
     * 例如：数字类型将 "123" 转为 123，日期类型将 "2024-01-15" 转为 Date。
     *
     * @param {number} r - 页面行号
     * @param {number} c - 列号
     * @param {string} input - 用户输入的原始字符串
     * @returns {*} 解析后的值
     */
    parseCellValue(r, c, input) {
        return parseValue(this.getCellTypeInstance(r, c), input);
    }
}