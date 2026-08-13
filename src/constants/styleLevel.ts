/**
 * 样式优先级常量定义
 *
 * 数值越大，优先级越高，会覆盖低优先级的样式。
 * THEME(100) < COL(200) < ROW(300) < CELL(400) < CONDITIONAL(500) < DATA_BINDING(600)
 */
export interface StyleLevel {
    /** 主题级样式（最低优先级） */
    readonly THEME: 100;
    /** 列级样式 */
    readonly COL: 200;
    /** 行级样式 */
    readonly ROW: 300;
    /** 单元格级样式 */
    readonly CELL: 400;
    /** 条件格式样式 */
    readonly CONDITIONAL: 500;
    /** 数据绑定样式（最高优先级） */
    readonly DATA_BINDING: 600;
}

export const STYLE_LEVEL: StyleLevel = Object.freeze({
    THEME: 100,
    COL: 200,
    ROW: 300,
    CELL: 400,
    CONDITIONAL: 500,
    DATA_BINDING: 600,
});
