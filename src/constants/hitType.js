/**
 * 点击命中类型常量定义
 *
 * 定义鼠标点击在表格不同区域的命中类型，用于精确识别用户交互位置。
 * 这些常量在碰撞检测（hit testing）中使用，帮助系统判断用户点击的具体区域。
 *
 * 使用场景：
 * - 鼠标事件处理：根据点击位置执行不同的操作
 * - 光标样式切换：根据区域显示不同的鼠标指针
 * - 上下文菜单：根据右键位置显示相关菜单项
 * - 拖拽操作：判断是否触发行列大小调整
 *
 * 区域划分示意图：
 * ┌─────────────────────────────────────┐
 * │  corner  │     column headers       │
 * ├──────────┼──────────────────────────┤
 * │ row      │                          │
 * │ headers  │        cells             │
 * │          │                          │
 * └──────────┴──────────────────────────┘
 *
 * @module constants/hitType
 * @example
 * import { HIT_TYPE } from './constants/hitType.js';
 *
 * function handleMouseClick(x, y) {
 *     const hitType = hitTest(x, y);
 *     switch (hitType) {
 *         case HIT_TYPE.CELL:
 *             selectCell(x, y);
 *             break;
 *         case HIT_TYPE.COL_RESIZE:
 *             startColumnResize(x);
 *             break;
 *     }
 * }
 */
export const HIT_TYPE = {
    /**
     * 左上角全选按钮区域
     * 位于行标题和列标题的交叉处，点击可选中所有单元格
     * 通常显示一个空白方块或全选图标
     */
    CORNER: "corner",

    /**
     * 列标题区域
     * 表格顶部的列标识区域（A, B, C...）
     * 点击可选整列，拖拽可调整列宽
     */
    COL_HEADER: "col-header",

    /**
     * 行标题区域
     * 表格左侧的行号标识区域（1, 2, 3...）
     * 点击可选整行，拖拽可调整行高
     */
    ROW_HEADER: "row-header",

    /**
     * 单元格区域
     * 表格的主要内容显示区域
     * 用户进行数据输入、编辑的主要区域
     */
    CELL: "cell",

    /**
     * 列宽调整区域
     * 列标题之间的边界线附近
     * 拖拽可调整对应列的宽度
     * 鼠标通常会变成左右调整箭头样式
     */
    COL_RESIZE: "col-resize",

    /**
     * 行高调整区域
     * 行标题之间的边界线附近
     * 拖拽可调整对应行的高度
     * 鼠标通常会变成上下调整箭头样式
     */
    ROW_RESIZE: "row-resize",
};
