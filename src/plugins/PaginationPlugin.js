import {BasePlugin} from "./BasePlugin.js";
import {HOOKS} from "../constants/hookNames.js";

const DEFAULT_PAGE_SIZE = 50;

export class PaginationPlugin extends BasePlugin {
    static get PLUGIN_NAME() { return 'pagination'; }

    #pageSize = DEFAULT_PAGE_SIZE;
    #currentPage = 1;
    #totalRows = 0;
    #autoPageSize = false;
    #pageSizeList = [10, 25, 50, 100, 200];
    #active = false;

    init(options = {}) {
        super.init(options);

        if (options.pageSize && options.pageSize > 0) {
            this.#pageSize = options.pageSize;
        }
        if (Array.isArray(options.pageSizeList)) {
            this.#pageSizeList = options.pageSizeList;
        }
        if (options.autoPageSize) {
            this.#autoPageSize = true;
        }

        this.#active = true;
        this.#updateTotalRows();
        this.#applyPageBounds();

        this.addHook(HOOKS.AFTER_CHANGE, () => this.#onDataChange());
    }

    get active() { return this.#active; }
    get pageSize() { return this.#pageSize; }
    get currentPage() { return this.#currentPage; }
    get pageSizeList() { return [...this.#pageSizeList]; }
    get autoPageSize() { return this.#autoPageSize; }

    get totalPages() {
        if (this.#pageSize <= 0) return 1;
        return Math.max(1, Math.ceil(this.#totalRows / this.#pageSize));
    }

    get rowOffset() {
        return (this.#currentPage - 1) * this.#pageSize;
    }

    get pageRowCount() {
        if (this.#currentPage < this.totalPages) return this.#pageSize;
        const remainder = this.#totalRows - this.rowOffset;
        return Math.max(0, remainder);
    }

    #updateTotalRows() {
        const sheet = this.sheet;
        if (!sheet) { this.#totalRows = 0; return; }

        const allocated = sheet.rowColManager.allocatedRowCount;

        let maxDataRow = -1;
        for (const chunk of sheet.cellStore.chunks()) {
            for (const {row} of chunk.iterate()) {
                if (row > maxDataRow) maxDataRow = row;
            }
        }

        this.#totalRows = Math.max(allocated, maxDataRow >= 0 ? maxDataRow + 1 : 0);
    }

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

    #applyPageBounds() {
        const sheet = this.sheet;
        if (!sheet) return;

        const offset = this.rowOffset;
        const count = this.pageRowCount;

        sheet.rowColManager.setPaginationBounds(offset, offset + count);

        if (this.#autoPageSize && this.renderEngine) {
            const viewH = this.renderEngine.viewH;
            const headerH = 28;
            const available = viewH - headerH;
            if (available > 0) {
                const autoSize = Math.max(1, Math.floor(available / 25));
                if (autoSize !== this.#pageSize) {
                    this.#pageSize = autoSize;
                    sheet.rowColManager.setPaginationBounds(offset, offset + this.pageRowCount);
                }
            }
        }

        this.renderEngine?.scrollMgr?.setScrollPosition(0, 0);
        this.renderEngine?.invalidateAll();
        this.render();
    }

    setPage(page) {
        page = Math.max(1, Math.min(page, this.totalPages));
        if (page === this.#currentPage) return;

        const oldPage = this.#currentPage;
        this.#currentPage = page;
        this.#applyPageBounds();

        this.hooks?.runHooks('afterPageChange', oldPage, page);
    }

    setPageSize(size) {
        if (size <= 0) return;
        if (size === this.#pageSize) return;

        this.#pageSize = size;
        this.#currentPage = 1;
        this.#applyPageBounds();

        this.hooks?.runHooks('afterPageSizeChange', size);
    }

    nextPage() {
        if (this.#currentPage < this.totalPages) {
            this.setPage(this.#currentPage + 1);
        }
    }

    prevPage() {
        if (this.#currentPage > 1) {
            this.setPage(this.#currentPage - 1);
        }
    }

    firstPage() {
        this.setPage(1);
    }

    lastPage() {
        this.setPage(this.totalPages);
    }

    refresh() {
        this.#updateTotalRows();
        if (this.#currentPage > this.totalPages) {
            this.#currentPage = this.totalPages;
        }
        this.#applyPageBounds();
    }

    getCurrentPageData() {
        const sheet = this.sheet;
        if (!sheet) return [];

        const offset = this.rowOffset;
        const count = this.pageRowCount;

        let maxCol = 0;
        for (const chunk of sheet.cellStore.chunks()) {
            for (const {col} of chunk.iterate()) {
                if (col > maxCol) maxCol = col;
            }
        }
        maxCol += 1;

        const data = [];
        for (let r = offset; r < offset + count; r++) {
            const row = [];
            for (let c = 0; c < maxCol; c++) {
                const cell = sheet.cellStore.get(r, c);
                row.push(cell ? cell.value : "");
            }
            data.push(row);
        }
        return data;
    }

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

    enable() {
        super.enable();
        this.#active = true;
        this.#applyPageBounds();
    }

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

    destroy() {
        this.disable();
        super.destroy();
    }
}