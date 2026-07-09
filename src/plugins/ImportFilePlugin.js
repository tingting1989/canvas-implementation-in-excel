import { BasePlugin } from "./BasePlugin.js";
import ExcelJS from "exceljs";
import { StyleConverter } from "../shared/style-converter.js";
import { errorHandler, ERROR_CODE } from "../core/index.js";
import { HOOKS } from "../constants/hookNames.js";

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
     * @param {boolean} [userOptions.firstRowAsHeader=true] - 是否将第一行作为表头
     * @param {boolean} [userOptions.applyStyles=true] - 是否应用单元格样式
     * @param {boolean} [userOptions.overwriteExisting=true] - 是否覆盖已有数据
     * @param {number} [userOptions.batchSize=100] - 每批处理的行数
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
            ...userOptions,
        };

        try {
            // 1️⃣ 触发 BEFORE_IMPORT Hook（导入前拦截/确认点）
            const preview = await this.previewFile(file, { previewRows: 10 });
            const shouldContinue = this.hooks?.runHooksUntil(HOOKS.IMPORT_BEFORE_IMPORT, preview);

            if (shouldContinue === false) {
                throw new Error("IMPORT_CANCELLED_BY_USER");
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

            // 5️⃣ 应用数据到工作表
            this.#emitProgress({ percent: 20, stage: "applying", message: "正在写入数据...", taskId });

            await this.#applyToSheet(parsedData, options, taskId);

            // 6️⃣ 应用样式
            if (options.applyStyles && parsedData.styles.length > 0) {
                this.#emitProgress({ percent: 80, stage: "styling", message: "正在应用样式...", taskId });

                await this.#applyStyles(parsedData, options, taskId);
                console.log(`[ImportFilePlugin] 样式应用完成: ${parsedData.styles.length} 个样式`);
            } else if (options.applyStyles) {
                console.warn("[ImportFilePlugin] 警告: applyStyles=true 但没有提取到样式");
                console.warn("[ImportFilePlugin] 可能原因: #parseExcelFile 中 options.applyStyles 未传递");
            }

            // 7️⃣ 应用合并单元格
            if (parsedData.mergedCells && parsedData.mergedCells.length > 0) {
                this.#emitProgress({ percent: 90, stage: "merging", message: "正在应用合并单元格...", taskId });

                await this.#applyMergedCells(parsedData.mergedCells, options, taskId);
                console.log(`[ImportFilePlugin] 合并单元格应用完成: ${parsedData.mergedCells.length} 个`);
            }

            // 8️⃣ 应用列宽和行高
            await this.#applyDimensions(parsedData, options, taskId);

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
            throw new Error(`不支持的文件格式: ${filename}`);
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);

        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
            throw new Error("工作簿中没有找到工作表");
        }

        const result = {
            cells: [],
            styles: [],
            mergedCells: [],
            columnWidths: [],
            rowHeights: [],
            sheetName: worksheet.name,
        };

        // 提取数据和样式
        worksheet.eachRow((row, rowNumber) => {
            const rowData = [];
            const rowStyles = [];

            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                rowData.push(cell.value);

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

        // 提取合并单元格
        for (const merge of worksheet.model?.merges || []) {
            result.mergedCells.push(merge);
        }

        return result;
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
            console.warn("[ImportFilePlugin] 警告：导入的文件没有数据");
        }

        if (this.#cancelled) {
            throw new Error("IMPORT_CANCELLED_BY_USER");
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
            throw new Error("当前没有活动的工作表");
        }

        const { startRow, startCol, batchSize } = options;
        let processedCount = 0;

        for (let r = 0; r < data.cells.length; r++) {
            if (this.#cancelled) {
                throw new Error("IMPORT_CANCELLED_BY_USER");
            }

            const row = data.cells[r];

            for (let c = 0; c < row.length; c++) {
                const value = row[c];
                const targetRow = startRow + r;
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
                    totalCount: data.cells.length,
                });

                // 触发总体进度 Hook（20%-80%）
                const percent = Math.min(80, 20 + (processedCount / data.cells.length) * 60);
                this.#emitProgress({
                    percent,
                    stage: "applying",
                    message: `正在写入数据... (${processedCount}/${data.cells.length})`,
                    processedRows: processedCount,
                    totalRows: data.cells.length,
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
        if (!sheet || !this.#styleConverter) return;

        const { startRow, startCol } = options;
        let appliedCount = 0;

        for (const styleInfo of data.styles) {
            if (this.#cancelled) {
                throw new Error("IMPORT_CANCELLED_BY_USER");
            }

            const { row, col, style: excelStyle } = styleInfo;

            try {
                // 使用共享样式转换模块进行转换
                const canvasStyle = this.#styleConverter.convertFromExcel(excelStyle, "flat");

                // 应用样式到单元格
                if (Object.keys(canvasStyle).length > 0) {
                    const targetRow = startRow + row;
                    const targetCol = startCol + col;
                    const cell = sheet.cellStore.get(targetRow, targetCol);

                    if (cell) {
                        Object.assign(cell, canvasStyle);
                    }
                }

                appliedCount++;
            } catch (warning) {
                // 触发样式警告 Hook（非致命错误，不影响导入流程）
                this.hooks?.runHooks(HOOKS.IMPORT_STYLE_WARNING, {
                    message: warning.message || "样式转换失败",
                    cellLocation: { row: startRow + row, col: startCol + col },
                    originalStyle: excelStyle,
                    convertedStyle: warning.fallbackStyle || {},
                });
            }
        }

        console.log(`[ImportFilePlugin] 样式应用完成，共 ${appliedCount} 个单元格`);
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
        if (!sheet || !mergedCells || mergedCells.length === 0) return;

        const { startRow, startCol } = options;

        console.log(`[ImportFilePlugin] 开始应用 ${mergedCells.length} 个合并单元格...`);

        for (const mergeRange of mergedCells) {
            if (this.#cancelled) {
                throw new Error("IMPORT_CANCELLED_BY_USER");
            }

            try {
                // 解析合并范围（如 "B1:D2"）
                const range = this.#parseCellRange(mergeRange);

                if (range) {
                    const { startRow: sRow, startCol: sCol, endRow: eRow, endCol: eCol } = range;

                    // 调整偏移量（加上 startRow 和 startCol）
                    const adjustedStartRow = sRow + startRow;
                    const adjustedStartCol = sCol + startCol;
                    const adjustedEndRow = eRow + startRow;
                    const adjustedEndCol = eCol + startCol;

                    // 调用工作表的合并方法
                    if (sheet.mergeManager && typeof sheet.mergeManager.mergeCells === "function") {
                        sheet.mergeManager.mergeCells(adjustedStartRow, adjustedStartCol, adjustedEndRow, adjustedEndCol);
                    } else if (typeof sheet.mergeCells === "function") {
                        sheet.mergeCells(adjustedStartRow, adjustedStartCol, adjustedEndRow, adjustedEndCol);
                    } else {
                        console.warn(`[ImportFilePlugin] 无法找到合并单元格方法，跳过: ${mergeRange}`);
                    }
                }
            } catch (error) {
                console.warn(`[ImportFilePlugin] 合并单元格失败: ${mergeRange}`, error);
                // 继续处理其他合并区域，不中断整个导入流程
            }
        }

        console.log(`[ImportFilePlugin] 合并单元格应用完成`);
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
                    console.warn(`[ImportFilePlugin] 设置列宽失败: 列 ${colInfo.col}`, error);
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
                    console.warn(`[ImportFilePlugin] 设置行高失败: 行 ${rowInfo.row}`, error);
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
            console.error(`[ImportFilePlugin] 无法解析单元格范围: ${range}`, error);
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
            console.error(`[ImportFilePlugin] 无法解析单元格引用: ${cellRef}`, error);
            return null;
        }
    }

    /**
     * 分类错误类型
     *
     * @param {Error} error - 错误对象
     * @returns {string} 错误码
     */
    #classifyError(error) {
        const message = error.message?.toUpperCase() || "";

        if (message.includes("FILE") || message.includes("READ")) {
            return "IMPORT_FILE_READ_ERROR";
        }
        if (message.includes("PARSE") || message.includes("INVALID")) {
            return "IMPORT_FILE_PARSE_ERROR";
        }
        if (message.includes("UNSUPPORTED")) {
            return "IMPORT_UNSUPPORTED_FORMAT";
        }
        if (message.includes("VALIDATION")) {
            return "IMPORT_DATA_VALIDATION_ERROR";
        }
        if (message.includes("STYLE")) {
            return "IMPORT_STYLE_CONVERSION_ERROR";
        }
        if (message.includes("CANCELLED")) {
            return "IMPORT_CANCELLED_BY_USER";
        }

        return "IMPORT_UNKNOWN_ERROR";
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
