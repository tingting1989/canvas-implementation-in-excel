import { BasePlugin } from "./BasePlugin.js";
import { errorHandler, ERROR_CODE, ERROR_LEVEL } from "../core/ErrorHandler.js";
import { CONFIG } from "@/constants/config";

class ImportFilePlugin extends BasePlugin {

    init(options = {}) {
        super.init(options);
        errorHandler.debug(ERROR_CODE.DEBUG_LOG, "ImportFilePlugin 初始化", { options });
    }

    async importFromFile(file) {
        if (!file) {
            errorHandler.throw(ERROR_CODE.IMPORT_FILE_READ_ERROR, "文件对象不能为空");
            return;
        }

        const extension = file.name.split('.').pop().toLowerCase();
        errorHandler.info(ERROR_CODE.DEBUG_LOG, "开始导入文件", { fileName: file.name, fileType: extension });

        try {
            if (!this.#isSupportedFormat(extension)) {
                errorHandler.handle(ERROR_CODE.IMPORT_UNSUPPORTED_FORMAT, `不支持的文件格式: ${extension}`, { supportedFormats: this.#getSupportedFormats() });
                return;
            }

            const content = await this.#readFile(file);
            errorHandler.debug(ERROR_CODE.DEBUG_LOG, "文件读取成功", { fileSize: file.size });

            const data = this.#parseContent(content, extension);
            errorHandler.info(ERROR_CODE.DEBUG_LOG, "文件解析完成", { rowCount: data?.length });

            return data;

        } catch (error) {
            errorHandler.handle(ERROR_CODE.IMPORT_FILE_READ_ERROR, `导入文件时出错: ${error.message}`, { error, fileName: file.name });
            throw error;
        }
    }

    #isSupportedFormat(format) {
        const supported = ['csv', 'xlsx', 'xls'];
        return supported.includes(format);
    }

    #getSupportedFormats() {
        return ['csv', 'xlsx', 'xls'];
    }

    async #readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                resolve(event.target.result);
            };

            reader.onerror = (error) => {
                errorHandler.handle(ERROR_CODE.IMPORT_FILE_READ_ERROR, "文件读取失败", { error, fileName: file.name });
                reject(error);
            };

            reader.readAsText(file);
        });
    }

    #parseContent(content, format) {
        try {
            if (format === 'csv') {
                return this.#parseCSV(content);
            }

            errorHandler.warn(ERROR_CODE.IMPORT_FILE_PARSE_ERROR, `格式解析器尚未完全实现: ${format}`);
            return [];

        } catch (error) {
            errorHandler.handle(ERROR_CODE.IMPORT_FILE_PARSE_ERROR, `解析${format}格式失败`, { error });
            throw error;
        }
    }

    #parseCSV(content) {
        const lines = content.split('\n').filter(line => line.trim());
        const data = [];

        for (let i = 0; i < lines.length; i++) {
            try {
                const row = this.#parseCSVLine(lines[i]);
                data.push(row);

                if (i % 1000 === 0 && i > 0) {
                    errorHandler.debug(ERROR_CODE.DEBUG_LOG, `CSV 解析进度`, { currentLine: i, totalLines: lines.length });
                }

            } catch (error) {
                errorHandler.warn(ERROR_CODE.IMPORT_DATA_VALIDATION_ERROR, `第 ${i + 1} 行 CSV 解析警告`, { line: lines[i], error });
                data.push([]);
            }
        }

        return data;
    }

    #parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    }

    destroy() {
        errorHandler.debug(ERROR_CODE.DEBUG_LOG, "ImportFilePlugin 销毁");
        super.destroy();
    }
}

export { ImportFilePlugin };