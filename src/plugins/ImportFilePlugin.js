import { BasePlugin } from "./BasePlugin.js";
import ExcelJS from "exceljs";
import { StyleConverter } from "@/shared/StyleConverter.js";
import { ERROR_CODE, errorHandler } from "../core/index.js";
import { HOOKS } from "@/constants/hookNames";

/**
 * 导入文件插件
 * 支持从 Excel 文件（XLSX）导入数据到 Canvas-Sheet 工作表
 *
 * 功能：
 * - 解析 XLSX 文件并提取数据、样式、合并单元格等信息
 * - 完整的样式转换（使用共享 StyleConverter 模块）
 * - Hooks 事件系统驱动（进度报告、完成/失败通知）
 * - 支持文件预览和取消操作
 *
 * 使用方式：
 * ```js
 * // 方式 1：通过全局注册加载
 * PluginManager.register('importFile', ImportFilePlugin);
 * workbook.loadPlugin('importFile');
 *
 * // 方式 2：直接加载插件类
 * workbook.loadPluginClass(ImportFilePlugin);
 *
 * // 使用插件 API
 * const plugin = workbook.getPlugin('importFile');
 *
 * // 通过 Workbook Hooks 监听事件（统一标准）
 * wb.addHook(HOOKS.IMPORT_PROGRESS, (progress) => {
 *     console.log(`${progress.percent}%`);
 * });
 *
 * wb.addHook(HOOKS.IMPORT_COMPLETE, (result) => {
 *     alert(`成功！${result.rowCount} 行`);
 * });
 *
 * // 导入文件
 * const result = await plugin.importFromFile(file);
 *
 * // 预览文件
 * const preview = await plugin.previewFile(file);
 * ```
 */
export class ImportFilePlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "importFile";
    }

    /** @type {StyleConverter|null} 样式转换器实例 */
    #styleConverter = null;

    /** @type {number} 当前任务 ID（用于取消操作） */
    #currentTaskId = 0;

    /** @type {boolean} 是否已取消当前任务 */
    #cancelled = false;

    /**
     * 初始化导入文件插件
     * 创建样式转换器实例
     *
     * @param {object} options - 插件配置
     */
    init(options = {}) {
        super.init(options);
        this.#styleConverter = new StyleConverter();
        if (options.enabled === false) {
            this.disable();
        }
    }

    /**
     * 销毁插件
     * 清理所有资源
     */
    destroy() {
        this.#styleConverter = null;
        this.#cancelled = false;
        super.destroy();
    }

    /**
     * 启用插件
     */
    enable() {
        super.enable();
    }

    /**
     * 禁用插件
     */
    disable() {
        super.disable();
    }

    // ══════════════════════════════════════
    // 公共 API：核心功能方法
    // ══════════════════════════════════════

    /**
     * 从文件导入数据到工作表
     *
     * @param {File} file - 要导入的文件对象（.xlsx 格式）
     * @param {Object} [userOptions={}] - 用户选项
     * @param {number} [userOptions.startRow=0] - 起始行索引（0-based）
     * @param {number} [userOptions.startCol=0] - 起始列索引（0-based）
     * @param {boolean} [userOptions.firstRowAsHeader=true] - 是否将第一行作为表头，当 嵌套表头时用：false
     * @param {boolean} [userOptions.applyStyles=true] - 是否应用单元格样式
     * @param {boolean} [userOptions.overwriteExisting=true] - 是否覆盖已有数据
     * @param {number} [userOptions.batchSize=100] - 每批处理的行数
     * @param {boolean} [userOptions.applyMerges=true] - 是否应用合并单元格
     * @param {boolean} [userOptions.applyDimensions=true] - 是否应用列宽和行高
     * @param {number} [userOptions.headerRows=1] - 表头行数（用于嵌套表头场景），2 (2层嵌套表头)
     * @param {number} [userOptions.dataStartRow] - 数据起始行（可选，默认从 startRow 开始），2 (跳过2行表头)
     * @returns {Promise<ImportResult>} 导入结果
     * @throws {Error} 当文件格式不支持或导入失败时抛出异常
     */
    async importFromFile(file, userOptions = {}) {
        const taskId = ++this.#currentTaskId;
        this.#cancelled = false;
        this.#styleConverter?.clearWarnings();

        const options = {
            startRow: 0,
            startCol: 0,
            firstRowAsHeader: true,
            applyStyles: true,
            overwriteExisting: true,
            batchSize: 100,

            // 新增选项：合并单元格和尺寸控制
            applyMerges: true,
            applyDimensions: true,

            // 新增选项：嵌套表头支持
            headerRows: 1,
            dataStartRow: undefined, // undefined 表示自动计算

            ...userOptions,
        };

        try {
            // 1️⃣ 触发 BEFORE_IMPORT Hook（导入前拦截/确认点）
            const preview = await this.previewFile(file, { previewRows: 10 });
            const shouldContinue = this.hooks?.runHooksUntil(HOOKS.IMPORT_BEFORE_IMPORT, preview);

            if (shouldContinue === false) {
                throw new Error(ERROR_CODE.IMPORT_CANCELLED_BY_USER);
            }

            // 2️⃣ 开始读取文件
            this.#emitProgress({ percent: 0, stage: "reading", message: "正在读取文件...", taskId });

            const arrayBuffer = await file.arrayBuffer();

            // 3️⃣ 解析文件
            this.#emitProgress({ percent: 10, stage: "parsing", message: "正在解析文件结构...", taskId });

            const parsedData = await this.#parseExcelFile(arrayBuffer, file.name, options);

            // 4️⃣ 数据验证
            this.#emitProgress({ percent: 15, stage: "validating", message: "正在验证数据...", taskId });

            this.#validateData(parsedData);

            // 5️⃣ 提取并设置嵌套表头（如果存在）
            if (parsedData.mergedCells && parsedData.mergedCells.length > 0) {
                const nestedHeaders = this.#extractNestedHeaders(parsedData, options);

                if (nestedHeaders && nestedHeaders.length > 0) {
                    if (this.workbook?.updateSettings) {
                        this.workbook.updateSettings({ nestedHeaders });
                        // 记录设置的嵌套表头行数，供后续 #applyToSheet 使用
                        options._autoDetectedHeaderRows = nestedHeaders.length;
                    }
                }
            }

            // 6️⃣ 应用数据到工作表
            this.#emitProgress({ percent: 20, stage: "applying", message: "正在写入数据...", taskId });

            await this.#applyToSheet(parsedData, options, taskId);

            if (options.applyStyles && parsedData.styles.length > 0) {
                this.#emitProgress({ percent: 80, stage: "styling", message: "正在应用样式...", taskId });
                await this.#applyStyles(parsedData, options, taskId);
            }

            if (options.applyMerges && parsedData.mergedCells && parsedData.mergedCells.length > 0) {
                this.#emitProgress({ percent: 90, stage: "merging", message: "正在应用合并单元格...", taskId });

                await this.#applyMergedCells(parsedData.mergedCells, options, taskId);
            }

            if (options.applyDimensions) {
                await this.#applyDimensions(parsedData, options, taskId);
            }

            // 9️⃣ 导入完成
            const result = {
                success: true,
                rowCount: parsedData.cells.length,
                colCount: parsedData.cells[0]?.length || 0,
                taskId,
                timestamp: new Date(),
                warnings: this.#styleConverter?.warnings || [],
            };

            this.hooks?.runHooks(HOOKS.IMPORT_COMPLETE, result);

            return result;
        } catch (error) {
            // 8️⃣ 触发错误 Hook
            const importError = {
                code: this.#classifyError(error),
                message: error.message,
                taskId,
                timestamp: new Date(),
                stack: error.stack,
            };

            this.hooks?.runHooks(HOOKS.IMPORT_ERROR, importError);

            throw error;
        }
    }

    /**
     * 预览文件内容（不实际导入）
     *
     * @param {File} file - 要预览的文件对象
     * @param {Object} [previewOptions={}] - 预览选项
     * @param {number} [previewOptions.previewRows=10] - 预览行数
     * @returns {Promise<FilePreview>} 文件预览信息
     */
    async previewFile(file, previewOptions = {}) {
        const { previewRows = 10 } = previewOptions;

        try {
            const arrayBuffer = await file.arrayBuffer();
            const fullData = await this.#parseExcelFile(arrayBuffer, file.name, { applyStyles: false });

            // 截取预览行数
            const previewCells = fullData.cells.slice(0, previewRows);

            return {
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                totalRows: fullData.cells.length,
                totalCols: fullData.cells[0]?.length || 0,
                previewData: previewCells,
                sheetName: fullData.sheetName,
                hasStyles: fullData.styles.length > 0,
                hasMergedCells: fullData.mergedCells.length > 0,
                success: true,
            };
        } catch (error) {
            return {
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                error: error.message,
                success: false,
            };
        }
    }

    /**
     * 取消当前导入任务
     */
    cancelImport() {
        this.#cancelled = true;
    }

    // ══════════════════════════════════════
    // 私有方法：核心处理逻辑
    // ══════════════════════════════════════

    /**
     * 解析 Excel 文件
     *
     * @param {ArrayBuffer} arrayBuffer - 文件二进制数据
     * @param {string} filename - 文件名
     * @param {Object} options - 解析选项
     * @returns {Promise<Object>} 解析后的数据
     */
    async #parseExcelFile(arrayBuffer, filename, options) {
        if (!this.#isExcelFile(filename)) {
            errorHandler.throw(ERROR_CODE.INVALID_FILE_FORMAT, `不支持的文件格式: ${filename}`);
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);

        const worksheet = workbook.worksheets[0];

        const result = {
            cells: [],
            styles: [],
            mergedCells: [],
            columnWidths: [],
            rowHeights: [],
            sheetName: worksheet.name,
        };

        let totalCellsProcessed = 0;
        let totalStylesExtracted = 0;

        // 提取数据和样式
        worksheet.eachRow((row, rowNumber) => {
            const rowData = [];
            const rowStyles = [];

            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                rowData.push(cell.value);
                totalCellsProcessed++;

                // 始终提取样式（如果 applyStyles 为 true）
                if (options.applyStyles) {
                    const style = cell.style || {};

                    // 检查是否有非空样式属性
                    const hasStyle = Object.keys(style).some((key) => {
                        const value = style[key];
                        return (
                            value !== undefined && value !== null && value !== "" && !(typeof value === "object" && Object.keys(value).length === 0)
                        );
                    });

                    if (hasStyle) {
                        rowStyles.push({
                            row: rowNumber - 1,
                            col: colNumber - 1,
                            style: style,
                        });
                        totalStylesExtracted++;
                    }
                }
            });

            result.cells.push(rowData);
            result.styles.push(...rowStyles);

            // 记录行高
            if (row.height) {
                result.rowHeights.push({
                    row: rowNumber - 1,
                    height: row.height,
                });
            }
        });

        // 提取列宽
        worksheet.columns.forEach((col, index) => {
            if (col.width) {
                result.columnWidths.push({
                    col: index,
                    width: col.width,
                });
            }
        });

        result.mergedCells = this.#extractMergesFromWorksheet(worksheet);

        return result;
    }

    /**
     * 从工作表中提取合并单元格信息（统一处理各种格式）
     *
     * @param {Object} worksheet - ExcelJS 工作表对象
     * @returns {string[]} 合并区域数组（如 ["A1:B1", "C1:F1"]）
     */
    #extractMergesFromWorksheet(worksheet) {
        const merges = [];

        try {
            const rawMerges = this.#getRawMerges(worksheet);
            if (!rawMerges) return merges;
            this.#normalizeMergesToArray(rawMerges, merges);
        } catch (error) {
            errorHandler.warn(ERROR_CODE.IMPORT_MERGE_WARNING, "提取合并单元格失败", { error: error.message });
        }

        return merges;
    }

    /**
     * 从工作表获取原始的合并单元格数据
     *
     * @param {Object} worksheet - ExcelJS 工作表对象
     * @returns {*} 原始合并数据（可能是数组、对象、字符串等）
     */
    #getRawMerges(worksheet) {
        // 尝试从 model.merges 获取
        if (worksheet.model?.merges) {
            return worksheet.model.merges;
        }

        // 尝试其他可能的属性名
        const alternativeProps = ["model._merges", "model.mergeCells", "_worksheet.merges", "_merges"];

        for (const prop of alternativeProps) {
            const value = prop.split(".").reduce((obj, key) => obj?.[key], worksheet);
            if (value && (Array.isArray(value) || value.length > 0)) {
                return value;
            }
        }

        // 尝试通过 getMergeCells() 方法获取
        if (typeof worksheet.getMergeCells === "function") {
            return worksheet.getMergeCells();
        }

        return null;
    }

    /**
     * 将各种格式的合并数据标准化为数组
     *
     * @param {*} rawMerges - 原始合并数据
     * @param {string[]} target - 目标数组（用于存放结果）
     */
    #normalizeMergesToArray(rawMerges, target) {
        if (Array.isArray(rawMerges)) {
            rawMerges.forEach((merge) => {
                if (merge) target.push(String(merge));
            });
        } else if (rawMerges[Symbol.iterator]) {
            for (const merge of rawMerges) {
                if (merge) target.push(String(merge));
            }
        } else if (typeof rawMerges === "string") {
            target.push(rawMerges);
        } else if (typeof rawMerges === "object") {
            Object.keys(rawMerges).forEach((key) => target.push(key));
        }
    }

    /**
     * 检查是否为 Excel 文件
     *
     * @param {string} filename - 文件名
     * @returns {boolean}
     */
    #isExcelFile(filename) {
        return filename.toLowerCase().endsWith(".xlsx");
    }

    /**
     * 检测是否还有额外的非合并表头行
     *
     * 当合并区域结束后，可能还有未合并的子标题行（如 "Name", "Age", "City"...）
     * 此方法通过启发式规则检测这些行：
     * - 行内容都是短文本（可能是列标题）
     * - 行内容与数据行的特征不同（无数字、日期等）
     *
     * @param {Array[]} cells - 解析后的单元格数据
     * @param {number} currentHeaderRows - 当前已确定的表头行数（基于合并区域）
     * @param {Array} mergedCells - 合并单元格列表
     * @returns {number} 扩展后的表头行数（如果发现额外表头行）
     */
    #detectAdditionalHeaderRows(cells, currentHeaderRows, mergedCells) {
        if (!cells || cells.length <= currentHeaderRows) {
            return currentHeaderRows;
        }

        let extendedHeaderRows = currentHeaderRows;

        // 最多再检查2行（避免误判数据行为表头）
        const maxAdditionalRows = Math.min(2, cells.length - currentHeaderRows);

        for (let i = 0; i < maxAdditionalRows; i++) {
            const checkRow = currentHeaderRows + i;
            const rowData = cells[checkRow];
            if (!rowData || rowData.length === 0) break;
            // 启发式规则：判断这一行是否像表头
            const isLikelyHeader = this.#isRowLikelyHeader(rowData, checkRow);
            if (isLikelyHeader) {
                extendedHeaderRows++;
            } else {
                break; // 一旦遇到非表头行，停止扩展
            }
        }

        return extendedHeaderRows;
    }

    /**
     * 判断某一行是否像表头行（启发式规则）
     *
     * @param {Array} rowData - 行数据
     * @param {number} rowIndex - 行索引
     * @returns {boolean} 是否像表头
     */
    #isRowLikelyHeader(rowData, rowIndex) {
        if (!rowData || rowData.length === 0) return false;

        let textCount = 0;
        let shortTextCount = 0;
        let nonEmptyCount = 0;

        for (const cell of rowData) {
            if (cell === undefined || cell === null) continue;

            nonEmptyCount++;
            const cellStr = String(cell).trim();

            // 规则1：是字符串类型
            if (typeof cell === "string" || cell instanceof String) {
                textCount++;

                // 规则2：短文本（≤20字符）更可能是标题
                if (cellStr.length <= 20) {
                    shortTextCount++;
                }
            }

            // 排除规则：包含明显的数据特征
            // - 纯数字（且不是年份）
            if (typeof cell === "number" && cell > 1900 && cell < 2100) {
                // 可能是年份，不算作排除条件
            } else if (typeof cell === "number" && cell > 10000) {
                // 大数字（如薪资），不太可能是表头
                return false;
            }

            // - 日期格式
            if (cellStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                return false;
            }
        }

        // 判断标准：
        // 1. 非空单元格占比 > 50%
        // 2. 文本单元格占比 > 70%
        // 3. 短文本占比 > 60%
        const nonEmptyRatio = nonEmptyCount / rowData.length;
        const textRatio = textCount / Math.max(nonEmptyCount, 1);
        const shortTextRatio = shortTextCount / Math.max(nonEmptyCount, 1);

        return nonEmptyRatio > 0.5 && textRatio > 0.7 && shortTextRatio > 0.6;
    }

    /**
     * 从解析后的 Excel 数据中提取嵌套表头结构
     *
     * 将 Excel 的合并单元格信息转换为 Canvas-Sheet 的 nestedHeaders 格式。
     *
     * @param {Object} parsedData - 解析后的 Excel 数据（包含 cells, mergedCells, styles）
     * @param {Object} options - 导入选项
     * @returns {Array|null} nestedHeaders 数组，或 null（如果没有嵌套表头）
     *
     * @example
     * 输入: {
     *   cells: [["基本信息", null, "工作信息", ...], ["姓名", "年龄", ...]],
     *   mergedCells: ["A1:B1", "C1:F1", "E2:F2"],
     *   styles: [{row:0, col:0, style:{...}}, ...]
     * }
     *
     * 输出: [
     *   [
     *     { label: "基本信息", colspan: 2, style: {...} },
     *     { label: "工作信息", colspan: 4, style: {...} }
     *   ],
     *   [
     *     { label: "姓名", style: {...} },
     *     "年龄",
     *     ...
     *   ]
     * ]
     */
    #extractNestedHeaders(parsedData, options) {
        const { mergedCells, cells, styles } = parsedData;

        if (!mergedCells || mergedCells.length === 0 || !cells || cells.length === 0) {
            return null;
        }

        // Step 1: 解析所有合并区域
        const mergeRegions = [];

        for (const mergeRange of mergedCells) {
            const range = this.#parseCellRange(mergeRange);
            if (range) {
                mergeRegions.push({
                    ...mergeRange,
                    startRow: range.startRow,
                    startCol: range.startCol,
                    endRow: range.endRow,
                    endCol: range.endCol,
                    colspan: range.endCol - range.startCol + 1,
                    rowspan: range.endRow - range.startRow + 1,
                    originalRange: mergeRange,
                });
            }
        }

        // Step 2: 确定表头行数（多策略检测）

        // 策略1：基于合并区域的最大行号
        const headerRowsFromMerges = Math.max(...mergeRegions.map((m) => m.endRow), 0) + 1;

        // 策略2：基于用户显式指定
        const headerRowsFromUser = options.headerRows && options.headerRows > 1 ? options.headerRows : 0;

        // 修复：智能选择最大值（确保不遗漏任何表头行）
        let headerRows;

        if (headerRowsFromUser > 0) {
            // 用户明确指定了表头行数，优先使用（但要确保至少覆盖合并区域）
            headerRows = Math.max(headerRowsFromUser, headerRowsFromMerges);
        } else {
            // 未指定时，使用合并区域的行号
            headerRows = headerRowsFromMerges;

            //  额外检查：如果合并区域下方还有非空行，可能是未合并的子标题
            const potentialHeaderRows = this.#detectAdditionalHeaderRows(cells, headerRows, mergedCells);
            if (potentialHeaderRows > headerRows) {
                headerRows = potentialHeaderRows;
            }
        }

        if (headerRows <= 1) {
            return null;
        }

        // Step 3: 为每一行构建嵌套表头结构
        const nestedHeaders = [];

        for (let row = 0; row < headerRows; row++) {
            const rowHeaders = [];
            let col = 0;

            while (col < cells[row].length) {
                // 检查当前位置是否是某个合并区域的起点
                const mergeAtPosition = mergeRegions.find((m) => m.startRow === row && m.startCol === col);

                if (mergeAtPosition) {
                    // 这是一个合并单元格
                    const cellValue = cells[row][col];

                    // 查找该位置的样式
                    const styleInfo = styles.find((s) => s.row === row && s.col === col);
                    let canvasStyle = {};

                    if (styleInfo?.style && options.applyStyles) {
                        canvasStyle = this.#styleConverter?.convertFromExcel(styleInfo.style, "flat") || {};
                    }

                    const headerItem = {
                        label: cellValue || "",
                        colspan: mergeAtPosition.colspan,
                    };

                    // 只在有样式时才添加 style 属性
                    if (Object.keys(canvasStyle).length > 0) {
                        headerItem.style = canvasStyle;
                    }

                    rowHeaders.push(headerItem);

                    // 跳过已合并的列
                    col += mergeAtPosition.colspan;
                } else {
                    // 普通单元格
                    const cellValue = cells[row][col];

                    // 查找样式
                    const styleInfo = styles.find((s) => s.row === row && s.col === col);
                    let canvasStyle = {};

                    if (styleInfo?.style && options.applyStyles) {
                        canvasStyle = this.#styleConverter?.convertFromExcel(styleInfo.style, "flat") || {};
                    }

                    if (typeof cellValue === "string" || typeof cellValue === "number") {
                        if (Object.keys(canvasStyle).length > 0) {
                            rowHeaders.push({
                                label: String(cellValue),
                                style: canvasStyle,
                            });
                        } else {
                            rowHeaders.push(String(cellValue));
                        }
                    } else {
                        rowHeaders.push(""); // 空值或复杂类型
                    }

                    col++;
                }
            }

            nestedHeaders.push(rowHeaders);
        }

        return nestedHeaders;
    }

    /**
     * 计算实际的数据起始行（统一逻辑，供 #applyToSheet 和 #applyStyles 使用）
     *
     * 优先级：dataStartRow > headerRows > _autoDetectedHeaderRows > nestedHeaders.length > firstRowAsHeader
     *
     * @param {Object} options - 导入选项
     * @returns {number} 实际的数据起始行索引
     */
    #calculateDataStartRow(options) {
        const { dataStartRow, headerRows, firstRowAsHeader, _autoDetectedHeaderRows } = options;
        const sheet = this.sheet;

        // 检测嵌套表头行数
        const nestedHeadersCount = sheet?.nestedHeaders && Array.isArray(sheet.nestedHeaders) ? sheet.nestedHeaders.length : 0;

        // 按优先级确定数据起始行
        if (dataStartRow !== undefined && dataStartRow !== null) {
            return dataStartRow;
        }

        if (_autoDetectedHeaderRows && _autoDetectedHeaderRows > 1) {
            return _autoDetectedHeaderRows;
        }

        if (headerRows && headerRows > 1) {
            return headerRows;
        }

        if (nestedHeadersCount > 1) {
            return nestedHeadersCount;
        }

        if (firstRowAsHeader) {
            return 1;
        }

        return 0; // 默认：包含所有行
    }

    /**
     * 验证数据有效性
     *
     * @param {Object} data - 解析后的数据
     * @throws {Error} 当数据无效时抛出异常
     */
    #validateData(data) {
        if (!data || !Array.isArray(data.cells)) {
            throw new Error("数据格式无效：缺少 cells 数组");
        }

        if (data.cells.length === 0) {
            errorHandler.warn(ERROR_CODE.IMPORT_NO_DATA_WARN, "导入的文件没有数据");
        }

        if (this.#cancelled) {
            throw new Error(ERROR_CODE.IMPORT_CANCELLED_BY_USER);
        }
    }

    /**
     * 将数据应用到工作表
     *
     * @param {Object} data - 解析后的数据
     * @param {Object} options - 导入选项
     * @param {number} taskId - 任务 ID
     */
    async #applyToSheet(data, options, taskId) {
        const sheet = this.sheet;
        if (!sheet) {
            errorHandler.throw(ERROR_CODE.IMPORT_FILE_PARSE_ERROR, "当前没有活动工作表");
        }

        const { startRow, startCol, batchSize } = options;

        let actualDataStartRow = this.#calculateDataStartRow(options);

        // 边界检查
        actualDataStartRow = Math.max(0, Math.min(actualDataStartRow, data.cells.length));

        let processedCount = 0;

        for (let r = actualDataStartRow; r < data.cells.length; r++) {
            if (this.#cancelled) {
                throw new Error(ERROR_CODE.IMPORT_CANCELLED_BY_USER);
            }

            const row = data.cells[r];

            for (let c = 0; c < row.length; c++) {
                const value = row[c];

                //  修复：正确计算目标位置（考虑跳过的表头行）
                const targetRow = startRow + (r - actualDataStartRow);
                const targetCol = startCol + c;

                if (value !== undefined && value !== null) {
                    sheet.cellStore.set(targetRow, targetCol, { value });
                }
            }

            processedCount++;

            // 触发行级进度 Hook（每 batchSize 行触发一次）
            if (processedCount % batchSize === 0) {
                this.hooks?.runHooks(HOOKS.IMPORT_ROW_PROCESSED, {
                    rowIndex: r,
                    rowData: row,
                    processedCount,
                    totalCount: data.cells.length - actualDataStartRow, //  修正总数
                });

                // 触发总体进度 Hook（20%-80%）
                const percent = Math.min(80, 20 + (processedCount / (data.cells.length - actualDataStartRow)) * 60);
                this.#emitProgress({
                    percent,
                    stage: "applying",
                    message: `正在写入数据... (${processedCount}/${data.cells.length - actualDataStartRow})`,
                    processedRows: processedCount,
                    totalRows: data.cells.length - actualDataStartRow, // 修正总数
                    taskId,
                });
            }
        }

        // 触发最后一行的进度
        if (processedCount % batchSize !== 0) {
            this.hooks?.runHooks(HOOKS.IMPORT_ROW_PROCESSED, {
                rowIndex: data.cells.length - 1,
                rowData: data.cells[data.cells.length - 1],
                processedCount,
                totalCount: data.cells.length,
            });
        }
    }

    /**
     * 应用样式到工作表
     *
     * @param {Object} data - 解析后的数据
     * @param {Object} options - 导入选项
     * @param {number} taskId - 任务 ID
     */
    async #applyStyles(data, options, taskId) {
        const sheet = this.sheet;
        if (!sheet || !this.#styleConverter) {
            errorHandler.handle(ERROR_CODE.IMPORT_STYLE_CONVERSION_ERROR, "#applyStyles 失败: 缺少必要的依赖", {
                hasSheet: !!sheet,
                hasStyleConverter: !!this.#styleConverter,
            });
            return;
        }

        const { startRow, startCol } = options;
        // 使用统一的计算方法（与 #applyToSheet 保持一致）
        const styleFilterStartRow = this.#calculateDataStartRow(options);
        let appliedCount = 0;
        let successCount = 0;
        let failCount = 0;
        let emptyStyleCount = 0;
        let skippedHeaderStyles = 0; // 跳过的表头样式数

        for (let idx = 0; idx < data.styles.length; idx++) {
            if (this.#cancelled) {
                throw new Error(ERROR_CODE.IMPORT_CANCELLED_BY_USER);
            }

            const styleInfo = data.styles[idx];
            const { row, col, style: excelStyle } = styleInfo;

            try {
                // 使用共享样式转换模块进行转换
                const canvasStyle = this.#styleConverter.convertFromExcel(excelStyle, "flat");

                // 应用样式到单元格（需要过滤表头行的样式）
                if (Object.keys(canvasStyle).length > 0) {
                    // 检查是否应该跳过此样式（表头行）
                    if (row < styleFilterStartRow) {
                        skippedHeaderStyles++;
                        continue; // 跳过表头行的样式
                    }

                    const targetRow = startRow + (row - styleFilterStartRow); // 重新计算目标位置
                    const targetCol = startCol + col;

                    //  使用 Sheet 的标准 API 应用样式（通过公共方法 setCellStyle）
                    // 注意：#styleManager 是私有字段，不能直接访问！
                    try {
                        if (typeof sheet.setCellStyle === "function") {
                            // 方式1：使用 Sheet 的公共方法（推荐）
                            sheet.setCellStyle(targetRow, targetCol, canvasStyle);
                            successCount++;
                        }
                    } catch (error) {
                        failCount++;
                    }
                } else {
                    emptyStyleCount++;
                }

                appliedCount++;
            } catch (warning) {
                failCount++;
                // 触发样式警告 Hook（非致命错误，不影响导入流程）
                this.hooks?.runHooks(HOOKS.IMPORT_STYLE_WARNING, {
                    message: warning.message || "样式转换失败",
                    cellLocation: { row: startRow + row, col: startCol + col },
                    originalStyle: excelStyle,
                    convertedStyle: warning.fallbackStyle || {},
                });
            }
        }
    }

    /**
     * 应用合并单元格到工作表
     *
     * @param {Array<string>} mergedCells - 合并单元格范围数组（如 "B1:C1"）
     * @param {Object} options - 导入选项
     * @param {number} taskId - 任务 ID
     */
    async #applyMergedCells(mergedCells, options, taskId) {
        const sheet = this.sheet;
        if (!sheet || !mergedCells) return;

        const { startRow, startCol } = options;

        // 使用统一的格式转换方法
        const mergeArray = [];
        try {
            this.#normalizeMergesToArray(mergedCells, mergeArray);
        } catch (error) {
            errorHandler.warn(ERROR_CODE.IMPORT_MERGE_WARNING, "合并单元格格式转换失败", { error: error.message });
            return;
        }

        if (mergeArray.length === 0) return;

        // 使用统一的表头行数计算方法
        const headerRowCount = this.#calculateDataStartRow(options);

        let appliedCount = 0;
        let skippedHeaderMerges = 0;
        let failedCount = 0;

        for (let idx = 0; idx < mergeArray.length; idx++) {
            const mergeRange = mergeArray[idx];

            if (this.#cancelled) {
                throw new Error(ERROR_CODE.IMPORT_CANCELLED_BY_USER);
            }

            try {
                // 解析合并范围（如 "B1:D2"）
                const range = this.#parseCellRange(mergeRange);

                if (range) {
                    const { startRow: sRow, startCol: sCol, endRow: eRow, endCol: eCol } = range;

                    //  关键修复：检查是否为表头区域的合并
                    if (headerRowCount > 0 && eRow < headerRowCount) {
                        // 完全在表头区域内 → 跳过（由 nestedHeaders 管理）
                        skippedHeaderMerges++;

                        continue; // 跳过此合并
                    }

                    // 计算调整后的位置
                    let adjustedStartRow, adjustedStartCol, adjustedEndRow, adjustedEndCol;

                    if (headerRowCount > 0) {
                        // 有嵌套表头时：
                        // - 如果起始行在表头内，调整到数据区的开始
                        // - 否则正常偏移
                        if (sRow < headerRowCount) {
                            // 跨越表头和数据区的合并 → 只保留数据区部分
                            adjustedStartRow = startRow; // 从数据区第0行开始
                        } else {
                            // 完全在数据区内 → 正常偏移（减去表头行数）
                            adjustedStartRow = startRow + (sRow - headerRowCount);
                        }

                        adjustedStartCol = startCol + sCol;
                        adjustedEndRow = startRow + Math.max(0, eRow - headerRowCount);
                        adjustedEndCol = startCol + eCol;
                    } else {
                        // 无嵌套表头 → 正常偏移
                        adjustedStartRow = sRow + startRow;
                        adjustedStartCol = sCol + startCol;
                        adjustedEndRow = eRow + startRow;
                        adjustedEndCol = eCol + startCol;
                    }

                    // 调用工作表的合并方法
                    if (sheet.mergeManager && typeof sheet.mergeManager.mergeCells === "function") {
                        sheet.mergeManager.mergeCells(adjustedStartRow, adjustedStartCol, adjustedEndRow, adjustedEndCol);
                        appliedCount++;
                    } else if (typeof sheet.mergeCells === "function") {
                        sheet.mergeCells(adjustedStartRow, adjustedStartCol, adjustedEndRow, adjustedEndCol);
                        appliedCount++;
                    } else {
                        errorHandler.warn(ERROR_CODE.IMPORT_MERGE_WARNING, `无法找到合并单元格方法，跳过: ${mergeRange}`, { mergeRange });
                        failedCount++;
                    }
                } else {
                    failedCount++;
                }
            } catch (error) {
                errorHandler.warn(ERROR_CODE.IMPORT_MERGE_WARNING, `合并单元格失败: ${mergeRange}`, {
                    mergeRange,
                    error: error.message,
                });
                failedCount++;
                // 继续处理其他合并区域，不中断整个导入流程
            }
        }
    }

    /**
     * 应用列宽和行高到工作表
     *
     * @param {Object} data - 解析后的数据（包含 columnWidths 和 rowHeights）
     * @param {Object} options - 导入选项
     * @param {number} taskId - 任务 ID
     */
    async #applyDimensions(data, options, taskId) {
        const sheet = this.sheet;
        if (!sheet) return;

        const { startCol } = options;

        // 应用列宽
        if (data.columnWidths && data.columnWidths.length > 0) {
            for (const colInfo of data.columnWidths) {
                try {
                    const targetCol = colInfo.col + startCol;

                    if (sheet.rowColManager && typeof sheet.rowColManager.setColumnWidth === "function") {
                        sheet.rowColManager.setColumnWidth(targetCol, colInfo.width);
                    } else if (sheet.model?.grid?.setColumnWidth) {
                        sheet.model.grid.setColumnWidth(targetCol, colInfo.width);
                    }
                } catch (error) {
                    errorHandler.warn(ERROR_CODE.IMPORT_DIMENSION_WARNING, `设置列宽失败: 列 ${colInfo.col}`, {
                        col: colInfo.col,
                        error: error.message,
                    });
                }
            }
        }

        // 应用行高
        if (data.rowHeights && data.rowHeights.length > 0) {
            for (const rowInfo of data.rowHeights) {
                try {
                    const targetRow = rowInfo.row + options.startRow;

                    if (sheet.rowColManager && typeof sheet.rowColManager.setRowHeight === "function") {
                        sheet.rowColManager.setRowHeight(targetRow, rowInfo.height);
                    } else if (sheet.model?.grid?.setRowHeight) {
                        sheet.model.grid.setRowHeight(targetRow, rowInfo.height);
                    }
                } catch (error) {
                    errorHandler.warn(ERROR_CODE.IMPORT_DIMENSION_WARNING, `设置行高失败: 行 ${rowInfo.row}`, {
                        row: rowInfo.row,
                        error: error.message,
                    });
                }
            }
        }
    }

    /**
     * 解析 Excel 单元格范围（如 "A1:B2" 或 "$C$3:$D$5"）
     *
     * @param {string} range - 单元格范围字符串
     * @returns {Object|null} 解析后的范围对象 { startRow, startCol, endRow, endCol } (0-based)
     */
    #parseCellRange(range) {
        if (!range || typeof range !== "string") return null;

        try {
            // 移除 $ 符号并分割
            const cleanRange = range.replace(/\$/g, "");
            const parts = cleanRange.split(":");

            if (parts.length !== 2) return null;

            const [startRef, endRef] = parts;

            // 解析起始位置
            const startPos = this.#cellRefToPosition(startRef);
            // 解析结束位置
            const endPos = this.#cellRefToPosition(endRef);

            if (!startPos || !endPos) return null;

            return {
                startRow: startPos.row,
                startCol: startPos.col,
                endRow: endPos.row,
                endCol: endPos.col,
            };
        } catch (error) {
            errorHandler.handle(ERROR_CODE.IMPORT_RANGE_PARSE_ERROR, `无法解析单元格范围: ${range}`, {
                range,
                error: error.message,
            });
            return null;
        }
    }

    /**
     * 将单元格引用转换为行列号（如 "A1" → {row: 0, col: 0}, "B3" → {row: 2, col: 1}）
     *
     * @param {string} cellRef - 单元格引用（如 "A1", "BC42"）
     * @returns {Object|null} 行列号对象 { row, col } (0-based)
     */
    #cellRefToPosition(cellRef) {
        if (!cellRef || typeof cellRef !== "string") return null;

        try {
            const match = cellRef.match(/^([A-Z]+)(\d+)$/i);
            if (!match) return null;

            const [, colStr, rowStr] = match;

            // 转换列字母为数字（A=0, B=1, ..., Z=25, AA=26, ...）
            let col = 0;
            for (let i = 0; i < colStr.length; i++) {
                col = col * 26 + (colStr.charCodeAt(i) - 64); // 'A' 的 ASCII 是 65
            }
            col--; // 转换为 0-based

            // 转换行为数字（0-based）
            const row = parseInt(rowStr, 10) - 1;

            return { row, col };
        } catch (error) {
            errorHandler.handle(ERROR_CODE.IMPORT_RANGE_PARSE_ERROR, `无法解析单元格引用: ${cellRef}`, {
                cellRef,
                error: error.message,
            });
            return null;
        }
    }

    /**
     * 分类错误类型
     *
     * @param {Error} error - 错误对象
     * @returns {string} 错误码（使用 ERROR_CODE 常量）
     */
    #classifyError(error) {
        const message = error.message?.toUpperCase() || "";

        if (message.includes("FILE") || message.includes("READ")) {
            return ERROR_CODE.IMPORT_FILE_READ_ERROR;
        }
        if (message.includes("PARSE") || message.includes("INVALID")) {
            return ERROR_CODE.IMPORT_FILE_PARSE_ERROR;
        }
        if (message.includes("UNSUPPORTED")) {
            return ERROR_CODE.IMPORT_UNSUPPORTED_FORMAT;
        }
        if (message.includes("VALIDATION")) {
            return ERROR_CODE.IMPORT_DATA_VALIDATION_ERROR;
        }
        if (message.includes("STYLE")) {
            return ERROR_CODE.IMPORT_STYLE_CONVERSION_ERROR;
        }
        if (message.includes("CANCELLED")) {
            return ERROR_CODE.IMPORT_CANCELLED_BY_USER;
        }

        return ERROR_CODE.IMPORT_UNKNOWN_ERROR;
    }

    /**
     * 发射进度事件
     *
     * @param {Object} progress - 进度信息
     */
    #emitProgress(progress) {
        this.hooks?.runHooks(HOOKS.IMPORT_PROGRESS, progress);
    }
}

/**
 * @typedef {Object} ImportProgress
 * @property {number} percent - 进度百分比（0-100）
 * @property {string} stage - 当前阶段 ('reading'|'parsing'|'validating'|'applying'|'styling')
 * @property {string} message - 进度描述消息
 * @property {number} [taskId] - 任务 ID
 * @property {number} [processedRows] - 已处理的行数
 * @property {number} [totalRows] - 总行数
 */

/**
 * @typedef {Object} ImportResult
 * @property {boolean} success - 是否成功
 * @property {number} rowCount - 导入的行数
 * @property {number} colCount - 导入的列数
 * @property {number} taskId - 任务 ID
 * @property {Date} timestamp - 完成时间戳
 * @property {Array} [warnings] - 警告列表
 */

/**
 * @typedef {Object} ImportError
 * @property {string} code - 错误码
 * @property {string} message - 错误消息
 * @property {number} taskId - 任务 ID
 * @property {Date} timestamp - 时间戳
 * @property {string} [stack] - 堆栈跟踪
 */

/**
 * @typedef {Object} FilePreview
 * @property {string} fileName - 文件名
 * @property {number} fileSize - 文件大小（字节）
 * @property {string} fileType - MIME 类型
 * @property {number} totalRows - 总行数
 * @property {number} totalCols - 总列数
 * @property {Array<Array<*>>} previewData - 预览数据（前 N 行）
 * @property {string} sheetName - 工作表名称
 * @property {boolean} hasStyles - 是否包含样式
 * @property {boolean} hasMergedCells - 是否包含合并单元格
 * @property {string} [error] - 错误信息（如果预览失败）
 * @property {boolean} [success] - 是否成功
 */
