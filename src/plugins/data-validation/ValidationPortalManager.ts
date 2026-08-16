import { errorHandler } from "../../core/ErrorHandler.js";
import { ERROR_CODE } from "../../constants/errorCodes.js";
import { DOMComponent } from "../../core/DOMComponent.js";

interface PortalPosition {
    x: number;
    y: number;
    width?: number;
    height?: number;
}

interface PortalOptions {
    width?: number;
    height?: number;
    style?: Partial<CSSStyleDeclaration>;
    autoRemove?: boolean;
    autoRemoveDelay?: number;
    frozenOffset?: { x: number; y: number };
}

interface PortalConfig {
    zIndex: number;
    autoCleanup: boolean;
    cleanupDelay: number;
    maxPortals: number;
}

/**
 * 验证 UI 门户管理器
 *
 * 所有验证相关的 UI 组件（下拉菜单、错误提示、气泡框）
 * 都通过 Portal 渲染到统一的容器中，而不是直接 append 到 body。
 *
 * 优势：
 * 1. 统一管理生命周期（自动清理）
 * 2. 正确处理坐标系转换（缩放/滚动/冻结）
 * 3. 避免 zIndex 战争（层级可控）
 * 4. 支持 Shadow DOM / iframe
 * 5. 便于测试（DOM 结构可预测）
 */
export class ValidationPortalManager extends DOMComponent {
    #portalContainer: HTMLElement | null = null;
    #portals: Map<string, HTMLElement> = new Map();
    #renderEngine: any;
    #initialized: boolean = false;
    config: PortalConfig;

    static DEFAULT_CONFIG: PortalConfig = {
        zIndex: 9999,
        autoCleanup: true,
        cleanupDelay: 3000,
        maxPortals: 50,
    };

    constructor(renderEngine: any, config: Partial<PortalConfig> = {}) {
        super();
        this.#renderEngine = renderEngine;
        this.config = { ...ValidationPortalManager.DEFAULT_CONFIG, ...config };
    }

    get isInitialized(): boolean {
        return this.#initialized;
    }

    get activePortalCount(): number {
        return this.#portals.size;
    }

    init(rootContainer: HTMLElement): void {
        if (this.#initialized) {
            throw new Error("ValidationPortalManager 已经初始化");
        }

        if (!rootContainer || !(rootContainer instanceof HTMLElement)) {
            throw new Error("rootContainer 必须是有效的 HTMLElement");
        }

        this.#portalContainer = this.createElement("div", {
            className: "validation-portal-container",
            style: {
                position: "fixed",
                top: "0",
                left: "0",
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                zIndex: String(this.config.zIndex),
                overflow: "visible",
            },
        });
        this.#portalContainer.id = "validation-portal-root";

        rootContainer.appendChild(this.#portalContainer);

        this.trackEvent(window, "resize", () => this.#handleResize());
        this.trackEvent(window, "scroll", () => this.#handleScroll(), true);

        this.#initialized = true;
    }

    createPortal(id: string, type: string, position: PortalPosition, options: PortalOptions = {}): HTMLElement {
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

        this.#portalContainer!.appendChild(portalEl);
        this.#portals.set(id, portalEl);

        if (options.autoRemove) {
            const delay = options.autoRemoveDelay || this.config.cleanupDelay;
            setTimeout(() => this.removePortal(id), delay);
        }

        return portalEl;
    }

    removePortal(id: string): boolean {
        const portal = this.#portals.get(id);
        if (portal) {
            portal.remove();
            this.#portals.delete(id);
            return true;
        }
        return false;
    }

    getPortal(id: string): HTMLElement | null {
        return this.#portals.get(id) || null;
    }

    updatePosition(id: string, position: PortalPosition): boolean {
        const portal = this.#portals.get(id);
        if (!portal) return false;

        const rect = this.#calculateFixedPosition(position);
        portal.style.left = `${rect.x}px`;
        portal.style.top = `${rect.y}px`;

        return true;
    }

    clearByType(type: string): number {
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

    destroyAll(): void {
        this.#portals.forEach((portal) => portal.remove());
        this.#portals.clear();
    }

    destroy(): void {
        super.destroy();
    }

    onDestroy(): void {
        this.destroyAll();
        this.#initialized = false;
        this.#renderEngine = null;
        this.#portalContainer = null;
    }

    #calculateFixedPosition(position: PortalPosition, options: PortalOptions = {}): { x: number; y: number; width: number; height: number } {
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

    #getFrozenOffset(options: PortalOptions = {}): { x: number; y: number } {
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

    #handleResize(): void {
        if (!this.#initialized) return;

        for (const [id, portal] of this.#portals) {
            if (portal.dataset.position) {
                try {
                    const originalPos = JSON.parse(portal.dataset.position);
                    const newPos = this.#calculateFixedPosition(originalPos);
                    portal.style.left = `${newPos.x}px`;
                    portal.style.top = `${newPos.y}px`;
                } catch (e) {
                    // ignore
                }
            }
        }
    }

    #handleScroll(): void {
        if (!this.#initialized) return;

        for (const [id, portal] of this.#portals) {
            if (portal.dataset.position) {
                try {
                    const originalPos = JSON.parse(portal.dataset.position);
                    const newPos = this.#calculateFixedPosition(originalPos);
                    portal.style.left = `${newPos.x}px`;
                    portal.style.top = `${newPos.y}px`;
                } catch (e) {
                    // ignore
                }
            }
        }
    }

    #removeOldestPortal(): void {
        if (this.#portals.size === 0) return;
        const firstKey = this.#portals.keys().next().value;
        if (firstKey !== undefined) this.removePortal(firstKey);
    }
}
