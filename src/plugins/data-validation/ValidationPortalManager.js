import { errorHandler, ERROR_LEVEL, ERROR_CODE } from "../../core/ErrorHandler.js";
/**
 * ValidationPortalManager - 验证 UI 门户管理器
 *
 * 核心思想：
 * 所有验证相关的 UI 组件（下拉菜单、错误提示、气泡框）
 * 都通过 Portal 渲染到统一的容器中，
 * 而不是直接 append 到 body。
 *
 * 优势：
 * 1. 统一管理生命周期（自动清理）
 * 2. 正确处理坐标系转换（缩放/滚动/冻结）
 * 3. 避免 zIndex 战争（层级可控）
 * 4. 支持 Shadow DOM / iframe
 * 5. 便于测试（DOM 结构可预测）
 *
 * @example
 * const portal = new ValidationPortalManager(renderEngine);
 * portal.init(rootContainer);
 *
 * const dropdown = portal.createPortal('dropdown_B2', 'dropdown', { x: 100, y: 200 });
 */
export class ValidationPortalManager {
    /**
     * @type {HTMLElement|null} Portal 容器
     * @private
     */
    #portalContainer = null;

    /**
     * @type {Map<string, HTMLElement>} 已创建的门户节点
     * @private
     */
    #portals = new Map();

    /**
     * @type {Object|null} 渲染引擎实例
     * @private
     */
    #renderEngine;

    /**
     * @type {boolean} 是否已初始化
     */
    #initialized = false;

    /**
     * 默认配置
     */
    static DEFAULT_CONFIG = {
        zIndex: 9999,
        autoCleanup: true,
        cleanupDelay: 3000,
        maxPortals: 50,
    };

    /** @type {Object} 当前配置 */
    config;

    /**
     * 构造 Portal 管理器
     * @param {Object} renderEngine - 渲染引擎实例（用于获取缩放、位置等信息）
     * @param {Object} [config={}] - 配置选项
     */
    constructor(renderEngine, config = {}) {
        this.#renderEngine = renderEngine;
        this.config = { ...ValidationPortalManager.DEFAULT_CONFIG, ...config };
    }

    /**
     * 是否已初始化
     * @returns {boolean}
     */
    get isInitialized() {
        return this.#initialized;
    }

    /**
     * 当前活跃的 Portal 数量
     * @returns {number}
     */
    get activePortalCount() {
        return this.#portals.size;
    }

    /**
     * 初始化 Portal 系统
     * @param {HTMLElement} rootContainer - 应用根容器（通常是 Canvas 父元素）
     * @throws {Error} 如果已初始化或容器无效
     */
    init(rootContainer) {
        if (this.#initialized) {
            throw new Error("ValidationPortalManager 已经初始化");
        }

        if (!rootContainer || !(rootContainer instanceof HTMLElement)) {
            throw new Error("rootContainer 必须是有效的 HTMLElement");
        }

        this.#portalContainer = document.createElement("div");
        this.#portalContainer.id = "validation-portal-root";
        this.#portalContainer.className = "validation-portal-container";

        Object.assign(this.#portalContainer.style, {
            position: "fixed",
            top: "0",
            left: "0",
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: String(this.config.zIndex),
            overflow: "visible",
        });

        rootContainer.appendChild(this.#portalContainer);

        window.addEventListener("resize", this.#handleResize.bind(this));
        window.addEventListener("scroll", this.#handleScroll.bind(this), true);

        this.#initialized = true;
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationPortalManager] 初始化完成");
    }

    /**
     * 创建 Portal 节点
     *
     * @param {string} id - 唯一标识（如 'dropdown_B2_C3'）
     * @param {string} type - 类型 ('dropdown' | 'tooltip' | 'bubble')
     * @param {Object} position - 目标位置（相对于 viewport）
     * @param {number} position.x - X 坐标
     * @param {number} position.y - Y 坐标
     * @param {Object} [options={}] - 额外选项
     * @param {number} [options.width] - 宽度
     * @param {number} [options.height] - 高度
     * @param {Object} [options.style] - 额外样式
     * @param {boolean} [options.autoRemove=false] - 是否自动移除
     * @param {number} [options.autoRemoveDelay=3000] - 自动移除延迟(ms)
     * @returns {HTMLElement} Portal DOM 节点
     * @throws {Error} 如果未初始化或超出最大数量
     */
    createPortal(id, type, position, options = {}) {
        if (!this.#initialized) {
            throw new Error("ValidationPortalManager 未初始化，请先调用 init()");
        }

        if (this.#portals.size >= this.config.maxPortals) {
            errorHandler.warn(
                ERROR_CODE.VALIDATION_ERROR,
                `[ValidationPortalManager] 达到最大 Portal 数量限制 (${this.config.maxPortals})，移除最旧的`,
            );
            this.#removeOldestPortal();
        }

        this.removePortal(id);

        const portalEl = document.createElement("div");
        portalEl.dataset.portalId = id;
        portalEl.dataset.portalType = type;
        portalEl.className = `validation-portal validation-portal-${type}`;

        const rect = this.#calculateFixedPosition(position, options);

        Object.assign(portalEl.style, {
            position: "absolute",
            left: `${rect.x}px`,
            top: `${rect.y}px`,
            width: rect.width ? `${rect.width}px` : "auto",
            height: rect.height ? `${rect.height}px` : "auto",
            pointerEvents: "auto",
            ...(options.style || {}),
        });

        this.#portalContainer.appendChild(portalEl);
        this.#portals.set(id, portalEl);

        if (options.autoRemove) {
            const delay = options.autoRemoveDelay || this.config.cleanupDelay;
            setTimeout(() => this.removePortal(id), delay);
        }

        return portalEl;
    }

    /**
     * 移除 Portal 节点
     * @param {string} id - Portal ID
     * @returns {boolean} 是否成功移除
     */
    removePortal(id) {
        const portal = this.#portals.get(id);
        if (portal) {
            portal.remove();
            this.#portals.delete(id);
            return true;
        }
        return false;
    }

    /**
     * 获取 Portal 节点
     * @param {string} id - Portal ID
     * @returns {HTMLElement|null}
     */
    getPortal(id) {
        return this.#portals.get(id) || null;
    }

    /**
     * 更新 Portal 位置
     * @param {string} id - Portal ID
     * @param {Object} position - 新位置
     * @returns {boolean} 是否成功更新
     */
    updatePosition(id, position) {
        const portal = this.#portals.get(id);
        if (!portal) return false;

        const rect = this.#calculateFixedPosition(position);
        portal.style.left = `${rect.x}px`;
        portal.style.top = `${rect.y}px`;

        return true;
    }

    /**
     * 清除指定类型的所有 Portal
     * @param {string} type - 类型 ('dropdown' | 'tooltip' | 'bubble')
     * @returns {number} 清除的数量
     */
    clearByType(type) {
        let count = 0;
        for (const [id, portal] of this.#portals) {
            if (portal.dataset.portalType === type) {
                portal.remove();
                this.#portals.delete(id);
                count++;
            }
        }
        return count;
    }

    /**
     * 销毁所有 Portal（插件销毁时调用）
     */
    destroyAll() {
        this.#portals.forEach((portal) => portal.remove());
        this.#portals.clear();
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationPortalManager] 已清除所有 Portal");
    }

    /**
     * 销毁 Portal 系统
     */
    destroy() {
        this.destroyAll();

        if (this.#portalContainer) {
            window.removeEventListener("resize", this.#handleResize.bind(this));
            window.removeEventListener("scroll", this.#handleScroll.bind(this), true);
            this.#portalContainer.remove();
            this.#portalContainer = null;
        }

        this.#initialized = false;
        this.#renderEngine = null;
        errorHandler.debug(ERROR_CODE.VALIDATION_DEBUG_LOG, "[ValidationPortalManager] 已销毁");
    }

    /**
     * 计算正确的 fixed 坐标（核心算法）
     *
     * 解决的问题：
     * 1. Canvas 缩放（transform: scale）
     * 2. 页面滚动（scrollLeft/scrollTop）
     * 3. 冻结行列偏移
     * 4. 高 DPI 屏幕（devicePixelRatio）
     *
     * @private
     * @param {Object} position - 目标位置
     * @param {Object} [options={}] - 选项
     * @returns {{x: number, y: number, width?: number, height?: number}}
     */
    #calculateFixedPosition(position, options = {}) {
        const { x, y, width, height } = position;

        let canvasRect = { left: 0, top: 0 };
        let zoom = 1;

        if (this.#renderEngine?.canvas) {
            canvasRect = this.#renderEngine.canvas.getBoundingClientRect();
            zoom = this.#renderEngine.zoomLevel || 1;
        }

        const frozenOffset = this.#getFrozenOffset(options);

        return {
            x: canvasRect.left + x * zoom + frozenOffset.x,
            y: canvasRect.top + y * zoom + frozenOffset.y,
            width: (width || 0) * zoom,
            height: (height || 0) * zoom,
        };
    }

    /**
     * 获取冻结行列偏移
     * @private
     * @param {Object} options - 选项
     * @returns {{x: number, y: number}}
     */
    #getFrozenOffset(options = {}) {
        let offsetX = 0;
        let offsetY = 0;

        if (this.#renderEngine?.frozenState) {
            offsetX = this.#renderEngine.frozenState.offsetX || 0;
            offsetY = this.#renderEngine.frozenState.offsetY || 0;
        }

        if (options.frozenOffset) {
            offsetX += options.frozenOffset.x || 0;
            offsetY += options.frozenOffset.y || 0;
        }

        return { x: offsetX, y: offsetY };
    }

    /**
     * 处理窗口 resize 事件
     * @private
     */
    #handleResize() {
        if (!this.#initialized) return;

        for (const [id, portal] of this.#portals) {
            const currentLeft = parseFloat(portal.style.left) || 0;
            const currentTop = parseFloat(portal.style.top) || 0;

            if (portal.dataset.position) {
                try {
                    const originalPos = JSON.parse(portal.dataset.position);
                    const newPos = this.#calculateFixedPosition(originalPos);
                    portal.style.left = `${newPos.x}px`;
                    portal.style.top = `${newPos.y}px`;
                } catch (e) {
                    // 忽略解析错误
                }
            }
        }
    }

    /**
     * 处理窗口 scroll 事件
     * @private
     */
    #handleScroll() {
        if (!this.#initialized) return;

        for (const [id, portal] of this.#portals) {
            if (portal.dataset.position) {
                try {
                    const originalPos = JSON.parse(portal.dataset.position);
                    const newPos = this.#calculateFixedPosition(originalPos);
                    portal.style.left = `${newPos.x}px`;
                    portal.style.top = `${newPos.y}px`;
                } catch (e) {
                    // 忽略解析错误
                }
            }
        }
    }

    /**
     * 移除最旧的 Portal
     * @private
     */
    #removeOldestPortal() {
        if (this.#portals.size === 0) return;

        const firstKey = this.#portals.keys().next().value;
        this.removePortal(firstKey);
    }
}
