/**
 * 单元格渲染上下文（CellRenderContext）
 *
 * 封装 Canvas 渲染单元格所需的全部信息，作为自定义列类型 render() 方法的
 * 唯一参数传递。是渲染管线中「渲染器」与「数据源」之间的解耦层。
 *
 * ## 设计原则
 *
 * - **纯只读数据容器**：不实现任何业务逻辑，仅持有和暴露数据
 * - **坐标系统**：x/y 为瓦片局部坐标（非视口全局坐标），由 TileRenderer 在创建时计算
 * - **行号直接使用实际行号**：无需额外转换，可直接用于访问 Sheet 数据
 *
 * @module types/CellRenderContext
 * @see BaseColumnType 自定义列类型基类，render(context) 接收本类实例
 * @see TileRenderer 瓦片渲染器，创建 CellRenderContext 实例
 */

import { CONFIG } from "../constants/config.js";
import { calcCenteredTextY } from "../utils/canvasUtils.js";

export interface MergeInfo {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
}

export interface CellRenderContextParams {
    ctx: CanvasRenderingContext2D;
    x: number;
    y: number;
    width: number;
    height: number;
    value: any;
    displayValue: string;
    style: Record<string, any>;
    sheet?: any | null;
    row: number;
    col: number;
    isSelected?: boolean;
    isDisabled?: boolean;
    isMerged?: boolean;
    mergeInfo?: MergeInfo | null;
}

export class CellRenderContext {
    private _ctx: CanvasRenderingContext2D;
    private _x: number;
    private _y: number;
    private _width: number;
    private _height: number;
    private _value: any;
    private _displayValue: string;
    private _style: Record<string, any>;
    private _sheet: any | null;
    private _row: number;
    private _col: number;
    private _isSelected: boolean;
    private _isDisabled: boolean;
    private _isMerged: boolean;
    private _mergeInfo: MergeInfo | null;

    /** 标记是否需要继续更新（动画用） */
    needsUpdate?: boolean;

    constructor({
        ctx,
        x,
        y,
        width,
        height,
        value,
        displayValue,
        style,
        sheet = null,
        row,
        col,
        isSelected = false,
        isDisabled = false,
        isMerged = false,
        mergeInfo = null,
    }: CellRenderContextParams) {
        this._ctx = ctx;
        this._x = x;
        this._y = y;
        this._width = width;
        this._height = height;
        this._value = value;
        this._displayValue = displayValue;
        this._style = style;
        this._sheet = sheet;
        this._row = row;
        this._col = col;
        this._isSelected = isSelected;
        this._isDisabled = isDisabled;
        this._isMerged = isMerged;
        this._mergeInfo = mergeInfo;
    }

    get ctx(): CanvasRenderingContext2D {
        return this._ctx;
    }

    get x(): number {
        return this._x;
    }

    get y(): number {
        return this._y;
    }

    get width(): number {
        return this._width;
    }

    get height(): number {
        return this._height;
    }

    get value(): any {
        return this._value;
    }

    get displayValue(): string {
        return this._displayValue;
    }

    get style(): Record<string, any> {
        return this._style;
    }

    get sheet(): any | null {
        return this._sheet;
    }

    get row(): number {
        return this._row;
    }

    get col(): number {
        return this._col;
    }

    get isSelected(): boolean {
        return this._isSelected;
    }

    get isDisabled(): boolean {
        return this._isDisabled;
    }

    get isMerged(): boolean {
        return this._isMerged;
    }

    get mergeInfo(): MergeInfo | null {
        return this._mergeInfo;
    }

    getPadding(sheet?: any): number {
        return sheet?.cellPadding || CONFIG.CELL_PADDING;
    }

    getCenterX(): number {
        return Math.round(this._x + this._width / 2);
    }

    getCenterY(): number {
        return Math.round(this._y + this._height / 2);
    }

    getBaselineY(fontOrSize?: string | number): number {
        if (fontOrSize === undefined) {
            fontOrSize = this._style?.fontSize || CONFIG.DEFAULT_FONT_SIZE || 14;
        }
        return calcCenteredTextY(this._y, this._height, fontOrSize!);
    }

    drawRoundedRect(x: number, y: number, w: number, h: number, radius: number): void {
        const ctx = this._ctx;
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }
}
