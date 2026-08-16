/** 视口坐标矩形 */
interface ViewRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** 命中测试结果 */
interface HitResult {
    type: string;
    [key: string]: unknown;
}

/**
 * 视口服务接口（ViewportService）
 *
 * 抽象视口查询与操作，将策略/编辑器与 RenderEngine 解耦。
 *
 * ## 设计动机
 *
 * 之前所有策略（MouseStrategy、KeyboardStrategy 等）和编辑器（CellEditor）
 * 都直接引用 RenderEngine 来执行视口操作，导致强耦合。
 * ViewportService 作为接口（抽象类），具体实现由 RenderEngineViewportService 提供。
 *
 * Canvas DOM 访问和渲染控制已拆分到 CanvasContext 接口，
 * ViewportService 仅保留纯视口查询与操作语义。
 *
 * @module render/ViewportService
 */
export class ViewportService {
    /** 当前水平滚动偏移（数据坐标） */
    get scrollX(): any {
        throw new Error("ViewportService.scrollX must be implemented");
    }

    /** 当前垂直滚动偏移（数据坐标） */
    get scrollY(): any {
        throw new Error("ViewportService.scrollY must be implemented");
    }

    /** 视口宽度（CSS 像素） */
    get viewW(): any {
        throw new Error("ViewportService.viewW must be implemented");
    }

    /** 视口高度（CSS 像素） */
    get viewH(): any {
        throw new Error("ViewportService.viewH must be implemented");
    }

    /** 最大水平滚动偏移 */
    get maxScrollX(): any {
        throw new Error("ViewportService.maxScrollX must be implemented");
    }

    /** 最大垂直滚动偏移 */
    get maxScrollY(): any {
        throw new Error("ViewportService.maxScrollY must be implemented");
    }

    /**
     * 获取单元格在视口中的矩形位置
     *
     * @param row - 行号
     * @param col - 列号
     * @param mergeInfo - 合并单元格信息
     * @returns 视口坐标矩形
     */
    getCellRect(row: number, col: number, mergeInfo: Record<string, unknown> | null = null): ViewRect {
        throw new Error("ViewportService.getCellRect must be implemented");
    }

    /**
     * 命中测试：将客户端坐标转换为表格元素类型
     *
     * @param clientX - 客户端 X 坐标
     * @param clientY - 客户端 Y 坐标
     * @returns 命中结果 { type, row?, col?, index? }
     */
    hitTest(clientX: number, clientY: number): HitResult | null {
        throw new Error("ViewportService.hitTest must be implemented");
    }

    /**
     * 表头命中测试：检测是否点击在行/列调整大小的区域
     *
     * @param clientX - 客户端 X 坐标
     * @param clientY - 客户端 Y 坐标
     * @returns 命中结果 { type, index }
     */
    headerHitTest(clientX: number, clientY: number): HitResult | null {
        throw new Error("ViewportService.headerHitTest must be implemented");
    }

    /**
     * 填充手柄命中测试
     *
     * @param clientX - 客户端 X 坐标
     * @param clientY - 客户端 Y 坐标
     * @returns 是否命中填充柄
     */
    fillHandleHitTest(clientX: number, clientY: number): boolean {
        throw new Error("ViewportService.fillHandleHitTest must be implemented");
    }

    /**
     * 滚动到指定单元格使其可见
     *
     * @param row - 行号
     * @param col - 列号
     */
    scrollToCell(row: number, col: number): void {
        throw new Error("ViewportService.scrollToCell must be implemented");
    }

    /**
     * 判断单元格是否在可视区域内
     *
     * @param row - 行号
     * @param col - 列号
     * @param canvasW - Canvas 逻辑宽度
     * @param canvasH - Canvas 逻辑高度
     * @param tabH - 标签栏高度
     * @returns 单元格是否可见
     */
    isCellVisible(row: number, col: number, canvasW: number, canvasH: number, tabH: number = 0): boolean {
        throw new Error("ViewportService.isCellVisible must be implemented");
    }

    /**
     * 设置调整大小参考线
     *
     * @param type - "row" 或 "col"
     * @param index - 行/列索引
     * @param position - 像素位置
     */
    setResizeLine(type: string, index: number, position: number): void {
        throw new Error("ViewportService.setResizeLine must be implemented");
    }

    /** 清除调整大小参考线 */
    clearResizeLine(): void {
        throw new Error("ViewportService.clearResizeLine must be implemented");
    }

    /** 标记全部内容为脏（需要重绘） */
    invalidateAll(): void {
        throw new Error("ViewportService.invalidateAll must be implemented");
    }
}
