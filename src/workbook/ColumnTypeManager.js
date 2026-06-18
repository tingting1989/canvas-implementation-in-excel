import { stylePool } from "../styles/index.js";
import { getColumnTypeFromConfig, resolveCellType } from "../types/index.js";

export class ColumnTypeManager {
    #sheet;

    constructor(sheet) {
        this.#sheet = sheet;
    }

    getColumnConfig(col) {
        return this.#sheet.columnsConfig.get(col) || null;
    }

    getColumnType(col) {
        return this.#sheet.columnsConfig.get(col)?.type || "text";
    }

    checkColumnTypeConsistency(topCol, bottomCol) {
        const firstType = this.getColumnType(topCol);
        for (let c = topCol + 1; c <= bottomCol; c++) {
            if (this.getColumnType(c) !== firstType) return false;
        }
        return true;
    }

    getColumnTypeInstance(col) {
        return getColumnTypeFromConfig(this.#sheet.columnsConfig.get(col));
    }

    getCellTypeInstance(r, c) {
        const realR = this.#sheet.toRealRow(r);
        return resolveCellType(realR, c, this.#sheet.cellTypes, this.#sheet.columnsConfig);
    }

    applyColumnsConfig(columnsConfig) {
        if (!Array.isArray(columnsConfig)) return;

        for (let c = 0; c < columnsConfig.length; c++) {
            let config = columnsConfig[c];

            if (typeof config === "function") {
                try {
                    config = config(c);
                } catch {
                    continue;
                }
            }

            if (!config || typeof config !== "object") continue;

            this.#sheet.columnsConfig.set(c, config);

            if (config.width != null) {
                this.#sheet.rowColManager.setColWidth(c, config.width);
            }

            if (config.style) {
                this.#sheet.colStyles.set(c, stylePool.getStyleId(config.style));
            }

            if (config.disabled === true || config.readOnly === true) {
                this.#sheet.rowColManager.ensureSize(1, c + 1);
            }
        }
    }

    formatCellValue(r, c, value) {
        if (value === undefined || value === null) return "";
        const cellType = this.getCellTypeInstance(r, c);
        return cellType ? cellType.format(value) : String(value);
    }

    validateCellValue(r, c, value) {
        const cellType = this.getCellTypeInstance(r, c);
        if (cellType) {
            const result = cellType.validate(value);
            if (result !== true) return result;
        }

        const colConfig = this.#sheet.columnsConfig.get(c);
        if (colConfig && typeof colConfig.validator === "function") {
            try {
                return colConfig.validator(value);
            } catch {
                return false;
            }
        }

        return true;
    }

    parseCellValue(r, c, input) {
        if (input === "" || input === undefined || input === null) return "";
        const cellType = this.getCellTypeInstance(r, c);
        return cellType ? cellType.parse(input) : input;
    }
}