import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "../core/ErrorHandler.js";

/**
 * 分页插件
 * 参考 Handsontable Pagination API 设计
 * https://handsontable.com/docs/javascript-data-grid/api/pagination/
 *
 * 核心原理：
 *   通过 RowColManager 的 setPaginationBounds(startRow, endRow) 限制可视行范围，
 *   所有上层代码（渲染、选区、编辑）自动基于页内坐标工作，
 *   Sheet.toRealRow / toPageRow 负责页内行号与实际行号的双向转换。
 *
 * 分页状态流转：
 *   setPage / setPageSize / refresh
 *     → #updateTotalRows()          计算总行数
 *     → #applyPageBounds()          设置 RowColManager 分页边界 → 重置滚动 → 重渲染
 *     → runHooks(AFTER_PAGE_CHANGE) 通知外部监听者
 *
 * 使用示例：
 * ```js
 * const pg = workbook.getPlugin('pagination');
 * pg.setPage(3);           // 跳转到第 3 页
 * pg.setPageSize(100);     // 每页 100 行
 * pg.nextPage();           // 下一页
 * pg.getPaginationData();  // 获取分页状态快照
 * ```
 */
import { BasePlugin } from "./BasePlugin.js";
import { HOOKS } from "../constants/hookNames.js";
import { CONFIG } from "../constants/config.js";

/** 默认每页行数 */
const DEFAULT_PAGE_SIZE = 50;

export class PaginationPlugin extends BasePlugin {
    static get PLUGIN_NAME() {
        return "pagination";
    }

    /** 每页行数 */
    #pageSize = DEFAULT_PAGE_SIZE;

    /** 当前页码（从 1 开始） */
    #currentPage = 1;

    /** 总行数（取 allocatedRowCount 与最大数据行号的较大值） */
    #totalRows = 0;

    /** 是否根据视口高度自动计算每页行数 */
    #autoPageSize = false;

    /** 可选的每页行数列表，供 UI 下拉框使用 */
    #pageSizeList = [10, 25, 50, 100, 200];

    /** 分页是否处于激活状态 */
    #active = false;

    /**
     * 初始化分页插件
     * @param {object} [options] - 分页配置
     * @param {number}  [options.pageSize=50]       - 每页行数
     * @param {number[]} [options.pageSizeList]     - 可选的每页行数列表
     * @param {boolean} [options.autoPageSize=false] - 是否自动计算每页行数
     */
    init(options = {}) {
        super.init(options);

        if (options.pageSize > 0) this.#pageSize = options.pageSize;
        if (Array.isArray(options.pageSizeList)) this.#pageSizeList = options.pageSizeList;
        if (options.autoPageSize) this.#autoPageSize = true;

        this.#active = true;
        this.#updateTotalRows();
        this.#applyPageBounds();

        this.addHook(HOOKS.AFTER_CHANGE, () => this.#onDataChange());
    }

    /** 分页是否激活 */
    get active() {
        return this.#active;
    }

    /** 每页行数 */
    get pageSize() {
        return this.#pageSize;
    }

    /** 当前页码（从 1 开始） */
    get currentPage() {
        return this.#currentPage;
    }

    /** 可选的每页行数列表（返回副本） */
    get pageSizeList() {
        return [...this.#pageSizeList];
    }

    /** 是否自动计算每页行数 */
    get autoPageSize() {
        return this.#autoPageSize;
    }

    /** 总页数 */
    get totalPages() {
        return this.#pageSize > 0 ? Math.max(1, Math.ceil(this.#totalRows / this.#pageSize)) : 1;
    }

    /** 当前页在总数据中的起始行偏移量 */
    get rowOffset() {
        return (this.#currentPage - 1) * this.#pageSize;
    }

    /** 当前页实际显示的行数（最后一页可能不足 pageSize） */
    get pageRowCount() {
        if (this.#totalRows <= 0) return 0;
        return this.#currentPage < this.totalPages ? this.#pageSize : Math.max(0, this.#totalRows - this.rowOffset);
    }

    /**
     * 重新计算总行数
     * 取 allocatedRowCount（已分配行）与 maxDataRow+1（最大数据行）的较大值，
     * 确保空表格也能显示已分配的行，加载大量数据后也能正确分页
     */
    #updateTotalRows() {
        const sheet = this.sheet;
        if (!sheet) {
            this.#totalRows = 0;
            return;
        }

        const actualRowCount = sheet.rowColManager.rowCount;
        const allocated = sheet.rowColManager.allocatedRowCount;
        // getMaxRow() 现在已返回精确值（遍历实际单元格，而非 Chunk 范围估算）
        const maxDataRow = sheet.cellStore.getMaxRow();
        const explicitlySized = sheet.rowColManager.isExplicitlySized;

        if (explicitlySized) {
            // 用户显式配置了行列数：严格使用配置值，不扩展
            // 这样可以确保 maxRows/maxCols 配置始终生效
            this.#totalRows = actualRowCount;
            errorHandler.debug(
                ERROR_CODE.DEBUG_LOG,
                `[PaginationPlugin] #updateTotalRows: explicitlySized → using config=${actualRowCount} (data=${maxDataRow})`,
            );
        } else {
            // 未显式配置：使用传统逻辑（允许根据数据自动扩展）
            this.#totalRows = Math.max(allocated, maxDataRow >= 0 ? maxDataRow + 1 : 0);
            errorHandler.debug(ERROR_CODE.DEBUG_LOG, `[PaginationPlugin] #updateTotalRows: not explicitlySized → total=${this.#totalRows}`);
        }
    }

    /**
     * 数据变更回调
     * 仅在总行数变化时才重新应用分页边界，避免不必要的重渲染
     */
    #onDataChange() {
        const oldTotal = this.#totalRows;
        this.#updateTotalRows();
        if (this.#totalRows !== oldTotal) {
            if (this.#currentPage > this.totalPages) {
                this.#currentPage = this.totalPages;
            }
            this.#applyPageBounds();
        }
    }

    /**
     * 将当前分页边界应用到 RowColManager
     * 流程：计算 autoPageSize → 设置分页边界 → 重置滚动位置 → 重渲染
     */
    #applyPageBounds() {
        const sheet = this.sheet;
        if (!sheet) return;

        if (this.#autoPageSize) this.#computeAutoPageSize();

        const offset = this.rowOffset;
        const count = this.pageRowCount;
        sheet.rowColManager.setPaginationBounds(offset, offset + count);

        this.renderEngine?.scrollMgr?.setScrollPosition(0, 0);
        this.renderEngine?.invalidateAll();
        this.render();
    }

    /**
     * 根据视口可用高度自动计算每页行数
     * 可用高度 = 视口高度 - 表头高度，每页行数 = 可用高度 / 默认行高
     */
    #computeAutoPageSize() {
        const viewH = this.renderEngine?.viewH;
        if (!viewH) return;
        const available = viewH - CONFIG.HEADER_HEIGHT;
        if (available <= 0) return;
        const autoSize = Math.max(1, Math.floor(available / CONFIG.DEFAULT_ROW_HEIGHT));
        if (autoSize !== this.#pageSize) {
            this.#pageSize = autoSize;
        }
    }

    /**
     * 跳转到指定页码
     * @param {number} page - 目标页码（自动钳位到 [1, totalPages]）
     * @fires afterPageChange
     */
    setPage(page) {
        page = Math.max(1, Math.min(page, this.totalPages));
        if (page === this.#currentPage) return;

        const oldPage = this.#currentPage;
        this.#currentPage = page;

        this.#applyPageBounds();

        // 翻页时重置选区到当前页的第一个数据单元格
        this.#resetSelectionToFirstCell();

        this.hooks?.runHooks(HOOKS.AFTER_PAGE_CHANGE, oldPage, page);
    }

    /**
     * 重置选区到当前页的第一个数据单元格
     *
     * 翻页后，旧的选区（基于实际行号）可能不在当前可视范围内，
     * 导致选框显示位置错误或消失。本方法将选区设置为新页面的
     * 第一个单元格，确保用户体验一致。
     *
     * 第一个单元格的行号 = pageStartRow（包含冻结行）
     */
    #resetSelectionToFirstCell() {
        const sheet = this.sheet;

        if (!sheet || !sheet.selection) {
            return;
        }

        const pageStartRow = sheet.rowColManager.pageStartRow;

        if (pageStartRow < 0) {
            return;
        }
        // 使用 pageStartRow 作为第一行的行号
        // 这样无论是否有冻结行，选框都会在正确的位置显示
        const targetRow = pageStartRow;
        const targetCol = 0;
        sheet.selection.setActive(targetRow, targetCol);
    }

    /**
     * 设置每页行数，同时重置到第 1 页
     * @param {number} size - 每页行数（必须 > 0）
     * @fires afterPageSizeChange
     */
    setPageSize(size) {
        if (size <= 0 || size === this.#pageSize) return;

        this.#pageSize = size;
        this.#currentPage = 1;
        this.#applyPageBounds();

        this.hooks?.runHooks(HOOKS.AFTER_PAGE_SIZE_CHANGE, size);
    }

    /** 跳转到下一页 */
    nextPage() {
        this.setPage(this.#currentPage + 1);
    }

    /** 跳转到上一页 */
    prevPage() {
        this.setPage(this.#currentPage - 1);
    }

    /** 跳转到第一页 */
    firstPage() {
        this.setPage(1);
    }

    /** 跳转到最后一页 */
    lastPage() {
        this.setPage(this.totalPages);
    }

    /**
     * 手动刷新分页状态
     * 在批量数据操作（如 loadData、loadMillionData）后调用，
     * 重新计算总行数并应用分页边界
     */
    refresh() {
        this.#updateTotalRows();
        if (this.#currentPage > this.totalPages) {
            this.#currentPage = this.totalPages;
        }
        this.#applyPageBounds();
    }

    /**
     * 获取当前页的二维数组数据
     * @returns {Array<Array<string>>} 当前页数据，空单元格返回空字符串
     */
    getCurrentPageData() {
        const sheet = this.sheet;
        if (!sheet) return [];

        const offset = this.rowOffset;
        const count = this.pageRowCount;
        const maxCol = sheet.cellStore.getMaxCol();
        const colCount = maxCol >= 0 ? maxCol + 1 : 0;

        const data = [];
        for (let r = offset, end = offset + count; r < end; r++) {
            const row = [];
            for (let c = 0; c < colCount; c++) {
                const cell = sheet.cellStore.get(r, c);
                row.push(cell ? cell.value : "");
            }
            data.push(row);
        }
        return data;
    }

    /**
     * 获取分页状态快照
     * @returns {{ currentPage: number, totalPages: number, pageSize: number,
     *             totalRows: number, rowOffset: number, pageRowCount: number,
     *             pageSizeList: number[], autoPageSize: boolean }}
     */
    getPaginationData() {
        return {
            currentPage: this.#currentPage,
            totalPages: this.totalPages,
            pageSize: this.#pageSize,
            totalRows: this.#totalRows,
            rowOffset: this.rowOffset,
            pageRowCount: this.pageRowCount,
            pageSizeList: [...this.#pageSizeList],
            autoPageSize: this.#autoPageSize,
        };
    }

    /** 启用分页，应用分页边界 */
    enable() {
        super.enable();
        this.#active = true;
        this.#applyPageBounds();
    }

    /** 禁用分页，清除 RowColManager 的分页边界，恢复全量显示 */
    disable() {
        super.disable();
        this.#active = false;

        const sheet = this.sheet;
        if (sheet) {
            sheet.rowColManager.clearPaginationBounds();
        }
        this.renderEngine?.invalidateAll();
        this.render();
    }

    /** 销毁插件，先禁用分页再清理基类资源 */
    destroy() {
        this.disable();
        super.destroy();
    }
}
