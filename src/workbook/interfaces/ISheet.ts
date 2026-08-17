/**
 * @fileoverview 工作表抽象接口 (ISheet)
 *
 * 设计目的：
 * 1. 解耦 Sheet 与其使用者（RenderEngine、Plugin 等）之间的循环依赖
 * 2. 明确 Sheet 对外暴露的公共 API 契约
 * 3. 支持依赖注入和单元测试中的 Mock 实现
 * 4. 作为类型检查的契约，确保所有实现类提供一致的行为
 */

import type { CellDataAccessor } from "../../model/grid/CellDataAccessor";
import type { RowColManager } from "../../model/grid/RowColManager";
import type { SelectionManager } from "../../model/selection/SelectionManager";
import type { MergeManager } from "../../model/merge/MergeManager";
import type { HistoryStack } from "../../model/history/HistoryStack";
import type { BatchOperationManager } from "../managers/BatchOperationManager";
import type { ChartManager } from "../../model/chart/ChartManager";
import type { EventBus } from "../../core/EventBus";
import type { ChunkedCellStore } from "../../model/store/ChunkedCellStore";
import type { SheetStyleManager } from "../managers/SheetStyleManager";
import type { ColumnTypeManager } from "../managers/ColumnTypeManager";
import type { HeaderLabelManager } from "../managers/HeaderLabelManager";
import type { ConditionalFormatManager } from "../managers/ConditionalFormatManager";
import type { RowColSync } from "../../model/grid/RowColSync";
import type { SheetDataCoordinator } from "../coordinators/SheetDataCoordinator";
import type { SheetStyleCoordinator } from "../coordinators/SheetStyleCoordinator";
import type { SheetMergeCoordinator } from "../coordinators/SheetMergeCoordinator";
import type { SheetOperationCoordinator } from "../coordinators/SheetOperationCoordinator";
import type { SheetMetaCoordinator } from "../coordinators/SheetMetaCoordinator";
import type { BaseColumnType } from "../../types/BaseColumnType";

/**
 * 样式对象
 *
 * 描述单元格的视觉样式属性，所有属性均为可选。
 * 支持通过索引签名扩展任意 CSS 属性。
 */
export interface StyleObject {
    /** 字体粗细，如 "bold"、"normal" */
    fontWeight?: string;
    /** 前景文字颜色，CSS 颜色值 */
    color?: string;
    /** 背景颜色，CSS 颜色值 */
    backgroundColor?: string;
    /** 水平对齐，如 "left"、"center"、"right" */
    textAlign?: string;
    /** 垂直对齐，如 "top"、"middle"、"bottom" */
    verticalAlign?: string;
    /** 字号（px） */
    fontSize?: number;
    /** 字体族，如 "Arial" */
    fontFamily?: string;
    /** 是否斜体 */
    italic?: boolean;
    /** 是否下划线 */
    underline?: boolean;
    /** 文字旋转角度（度） */
    rotation?: number;
    /** 任意扩展 CSS 属性 */
    [key: string]: unknown;
}

/**
 * 合并区域范围
 *
 * 以行列坐标描述一个矩形区域，包含左上角和右下角。
 */
export interface MergeRange {
    /** 左上角行号 */
    topRow: number;
    /** 左上角列号 */
    topCol: number;
    /** 右下角行号 */
    bottomRow: number;
    /** 右下角列号 */
    bottomCol: number;
}

/**
 * 列配置项
 *
 * 描述单列的类型、默认值、宽度、样式等配置。
 * 通过 columns 数组传入，由 ColumnTypeManager 解析应用。
 */
export interface ColumnConfig {
    /** 列类型名称，如 "text"、"number"、"date"、"checkbox" */
    type?: string;
    /** 该列的默认值 */
    defaultValue?: unknown;
    /** 传递给列类型实例的选项 */
    options?: Record<string, unknown>;
    /** 是否只读 */
    readOnly?: boolean;
    /** 列宽（px） */
    width?: number;
    /** 是否禁用 */
    disabled?: boolean;
    /** 列级样式 */
    style?: StyleObject;
    /** 自定义验证函数，返回 true 或错误消息 */
    validator?: (value: unknown) => boolean | string;
    /** 任意扩展属性 */
    [key: string]: unknown;
}

/**
 * 单元格配置项
 *
 * 描述单个单元格的值、样式、类型等静态配置。
 * 通过 cell 数组传入，由 SheetMetaCoordinator.applyCellConfig() 解析应用。
 */
export interface CellConfigItem {
    /** 行号 */
    row: number;
    /** 列号 */
    col: number;
    /** 单元格值 */
    value?: unknown;
    /** 单元格样式 */
    style?: StyleObject;
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否只读 */
    readOnly?: boolean;
    /** 单元格类型名称 */
    type?: string;
    /** 任意扩展属性（如类型选项） */
    [key: string]: unknown;
}

/**
 * 单元格属性解析结果
 *
 * 由 cellsFn(r, c) 动态计算返回，描述单个单元格的运行时属性。
 * 优先级高于静态 cellConfig，用于实现动态禁用/只读/类型等。
 */
export interface CellProperties {
    /** 动态样式 */
    style?: StyleObject;
    /** 是否禁用 */
    disabled?: boolean;
    /** 是否只读 */
    readOnly?: boolean;
    /** 动态值 */
    value?: unknown;
    /** 动态类型名称 */
    type?: string;
    /** 任意扩展属性 */
    [key: string]: unknown;
}

/**
 * 工作表接口 (ISheet)
 *
 * 定义了工作表必须实现的全部公共 API，
 * 用于解耦外部代码与具体实现之间的依赖关系。
 *
 * 属性分组：
 * - **基础属性**：name / visible / readOnly / bus
 * - **存储与管理器**：cellStore / rowColManager / selection / mergeManager / history / batchOp / chartManager
 * - **子管理器**：styleManager / typeManager / headerLabels / conditionalFormat / rowSync / colSync
 * - **协调者**：data / styles / merges / operations / meta
 * - **配置**：cellConfig / cellsFn / cellPadding / textOverflowEllipsis
 */
export interface ISheet {
    /** 工作表名称，作为 Map 键和标签栏显示文本 */
    name: string;
    /** 是否可见（隐藏工作表） */
    visible: boolean;
    /** 是否只读模式 */
    readOnly: boolean;
    /** 工作表级事件总线 */
    bus: EventBus;
    /** 分块单元格存储 */
    cellStore: ChunkedCellStore;
    /** 行列尺寸管理器 */
    rowColManager: RowColManager;
    /** 选区管理器 */
    selection: SelectionManager;
    /** 合并单元格管理器 */
    mergeManager: MergeManager;
    /** 撤销/重做历史栈 */
    history: HistoryStack;
    /** 批量操作管理器 */
    batchOp: BatchOperationManager;
    /** 图表管理器（可选） */
    chartManager: ChartManager | null;

    /** 样式管理器（9 层样式合并） */
    styleManager: SheetStyleManager;
    /** 列类型管理器 */
    typeManager: ColumnTypeManager;
    /** 表头标签管理器 */
    headerLabels: HeaderLabelManager;
    /** 条件格式管理器 */
    conditionalFormat: ConditionalFormatManager;
    /** 行同步器（insert/delete/move 时同步行附属状态） */
    rowSync: RowColSync;
    /** 列同步器（insert/delete/move 时同步列附属状态） */
    colSync: RowColSync;

    /** 数据协调者：单元格值的增删改查 */
    data: SheetDataCoordinator;
    /** 样式协调者：行/列/单元格/区域样式设置 */
    styles: SheetStyleCoordinator;
    /** 合并协调者：合并/取消合并操作 */
    merges: SheetMergeCoordinator;
    /** 操作协调者：撤销/重做、行列插入/删除/移动 */
    operations: SheetOperationCoordinator;
    /** 元数据协调者：表头标签、列类型、单元格配置 */
    meta: SheetMetaCoordinator;

    /** 静态单元格配置数组 */
    cellConfig: CellConfigItem[];
    /** 动态单元格属性计算函数 */
    cellsFn: ((r: number, c: number) => CellProperties | null) | null;
    /** 单元格内边距（px） */
    cellPadding: number;
    /** 是否启用文本溢出省略号 */
    textOverflowEllipsis: boolean;

    /**
     * 检查工作表是否可写（非只读）
     * @returns true 表示可写，false 表示只读
     */
    _ensureWritable(): boolean;
    /** 使所有缓存失效并触发重渲染 */
    _invalidateAll(): void;
    /**
     * 使指定单元格的缓存失效
     * @param r - 行号
     * @param c - 列号
     */
    _invalidateCell(r: number, c: number): void;
    /**
     * 使指定单元格的缓存失效（内部方法，供 FormulaEngine 调用）
     * @param r - 行号
     * @param c - 列号
     */
    _invalidateCellInternal(r: number, c: number): void;
    /** 公开的缓存失效方法 */
    invalidateAll(): void;
    /** 使冻结区域尺寸缓存失效 */
    invalidateFreezeCache(): void;

    /**
     * 设置单元格值（支持公式自动检测）
     * @param r - 行号
     * @param c - 列号
     * @param value - 单元格值，以 "=" 开头时识别为公式
     * @param styleId - 样式 ID（默认 0）
     * @param disabled - 是否禁用（默认 false）
     */
    setCell(r: number, c: number, value: unknown, styleId?: number, disabled?: boolean): void;
    /**
     * 禁用单元格
     * @param r - 行号
     * @param c - 列号
     */
    disableCell(r: number, c: number): void;
    /**
     * 启用单元格
     * @param r - 行号
     * @param c - 列号
     */
    enableCell(r: number, c: number): void;
    /**
     * 检查单元格是否被禁用
     * @param r - 行号
     * @param c - 列号
     * @returns 是否禁用
     */
    isDisabled(r: number, c: number): boolean;
    /**
     * 批量加载数据
     * @param data - 二维数组，data[row][col]
     */
    loadData(data: unknown[][]): void;
    /** 单元格数据访问器（批量遍历接口） */
    cellDataAccessor: CellDataAccessor;

    /**
     * 设置行样式
     * @param row - 行号
     * @param styleObj - 样式对象
     */
    setRowStyle(row: number, styleObj: StyleObject): void;
    /**
     * 设置列样式
     * @param col - 列号
     * @param styleObj - 样式对象
     */
    setColStyle(col: number, styleObj: StyleObject): void;
    /**
     * 设置默认样式
     * @param styleObj - 样式对象
     */
    setDefaultStyle(styleObj: StyleObject): void;
    /**
     * 获取默认样式
     * @returns 默认样式对象
     */
    getDefaultStyle(): StyleObject;
    /**
     * 设置单元格样式
     * @param r - 行号
     * @param c - 列号
     * @param styleObj - 样式对象
     */
    setCellStyle(r: number, c: number, styleObj: StyleObject): void;
    /**
     * 清除单元格样式
     * @param r - 行号
     * @param c - 列号
     */
    clearCellStyle(r: number, c: number): void;
    /**
     * 解析指定位置的最终合并样式
     * @param r - 行号
     * @param c - 列号
     * @returns 合并后的样式对象
     */
    resolveStyle(r: number, c: number): StyleObject;
    /**
     * 批量样式更新，所有操作合并为单个撤销步骤
     * @param fn - 接收 ISheet 引用的操作函数
     */
    batchStyleUpdate(fn: (sheet: ISheet) => void): void;

    /**
     * 设置区域样式
     * @param range - 单元格范围
     * @param styleObj - 样式对象
     */
    setRangeStyle(range: { topRow: number; topCol: number; bottomRow: number; bottomCol: number }, styleObj: StyleObject): void;
    /**
     * 清除区域样式
     * @param range - 单元格范围
     */
    clearRangeStyle(range: { topRow: number; topCol: number; bottomRow: number; bottomCol: number }): void;
    /**
     * 清除行样式
     * @param row - 行号
     */
    clearRowStyle(row: number): void;
    /**
     * 清除列样式
     * @param col - 列号
     */
    clearColStyle(col: number): void;
    /**
     * 获取单元格最终样式
     * @param r - 行号
     * @param c - 列号
     * @returns 样式对象
     */
    getCellStyle(r: number, c: number): StyleObject;

    /**
     * 添加条件格式规则
     * @param options - 条件格式选项
     */
    addConditionalRule(options: Record<string, unknown>): void;
    /** 是否存在条件格式规则 */
    hasConditionalRules(): boolean;
    /** 是否存在数据绑定 */
    hasDataBindings(): boolean;
    /**
     * 匹配条件格式样式
     * @param r - 行号
     * @param c - 列号
     * @param cell - 单元格数据
     * @returns 匹配的样式 ID，未匹配返回 null
     */
    matchConditionalStyle(r: number, c: number, cell: unknown): number | null;
    /**
     * 绑定数据样式映射
     * @param col - 列号
     * @param mapperFn - 值到样式对象的映射函数
     */
    bindDataStyle(col: number, mapperFn: (value: unknown) => StyleObject | null): void;
    /**
     * 获取数据绑定样式 ID
     * @param r - 行号
     * @param c - 列号
     * @returns 样式 ID，未绑定返回 null
     */
    getDataBindStyle(r: number, c: number): number | null;
    /** 数据绑定映射表 */
    dataBindings: Map<number, (value: unknown) => number>;

    /**
     * 合并单元格区域
     * @param topRow - 左上角行号
     * @param topCol - 左上角列号
     * @param bottomRow - 右下角行号
     * @param bottomCol - 右下角列号
     * @returns 是否合并成功
     */
    mergeCells(topRow: number, topCol: number, bottomRow: number, bottomCol: number): boolean;
    /**
     * 取消合并
     * @param row - 行号
     * @param col - 列号
     * @returns 是否取消成功
     */
    unmergeCells(row: number, col: number): boolean;
    /**
     * 获取指定位置的合并区域
     * @param row - 行号
     * @param col - 列号
     * @returns 合并范围，未合并返回 null
     */
    getMerge(row: number, col: number): MergeRange | null;
    /**
     * 判断是否为合并区域左上角
     * @param row - 行号
     * @param col - 列号
     * @returns 是否为左上角
     */
    isMergeTopLeft(row: number, col: number): boolean;
    /**
     * 判断是否处于合并区域内
     * @param row - 行号
     * @param col - 列号
     * @returns 是否被合并
     */
    isMergedCell(row: number, col: number): boolean;

    /** 进入批量操作模式 */
    beginBatch(): void;
    /** 退出批量操作模式，合并暂存命令为单个撤销步骤 */
    endBatch(): void;
    /** 触发重渲染 */
    render(): void;
    /** 撤销上一步操作 */
    undo(): void;
    /** 重做下一步操作 */
    redo(): void;
    /**
     * 在指定位置插入行
     * @param atRow - 插入位置行号
     */
    insertRow(atRow: number): void;
    /**
     * 在指定位置插入列
     * @param atCol - 插入位置列号
     */
    insertCol(atCol: number): void;
    /**
     * 删除指定行
     * @param atRow - 行号
     */
    deleteRow(atRow: number): void;
    /**
     * 删除指定列
     * @param atCol - 列号
     */
    deleteCol(atCol: number): void;
    /**
     * 移动列
     * @param fromCol - 源列号
     * @param toCol - 目标列号
     */
    moveCol(fromCol: number, toCol: number): void;
    /**
     * 移动行
     * @param fromRow - 源行号
     * @param toRow - 目标行号
     */
    moveRow(fromRow: number, toRow: number): void;
    /**
     * 设置行数
     * @param rows - 行数
     */
    setRowCount(rows: number): void;
    /**
     * 设置列数
     * @param cols - 列数
     */
    setColCount(cols: number): void;
    /**
     * 设置网格尺寸
     * @param rows - 行数
     * @param cols - 列数
     */
    setGridSize(rows: number, cols: number): void;

    /**
     * 获取列头标签
     * @param col - 列号
     * @returns 列头文本
     */
    getColHeader(col: number): string;
    /**
     * 获取行头标签
     * @param row - 行号
     * @returns 行头文本
     */
    getRowHeader(row: number): string;
    /** 获取表头高度（px） */
    getHeaderHeight(): number;
    /** 获取表头宽度（px） */
    getHeaderWidth(): number;
    /**
     * 获取列配置
     * @param col - 列号
     * @returns 列配置对象，未配置返回 null
     */
    getColumnConfig(col: number): ColumnConfig | null;
    /**
     * 获取列类型名称
     * @param col - 列号
     * @returns 类型名称，默认 "text"
     */
    getColumnType(col: number): string;
    /**
     * 格式化单元格值为显示文本
     * @param r - 行号
     * @param c - 列号
     * @param value - 原始值
     * @returns 格式化后的字符串
     */
    formatCellValue(r: number, c: number, value: unknown): string;
    /** 应用静态单元格配置（cell 数组） */
    applyCellConfig(): void;
    /**
     * 获取列类型实例
     * @param col - 列号
     * @returns 列类型实例
     */
    getColumnTypeInstance(col: number): BaseColumnType;
    /**
     * 获取单元格类型实例（优先单元格级 → 列级 → 默认 text）
     * @param r - 行号
     * @param c - 列号
     * @returns 类型实例
     */
    getCellTypeInstance(r: number, c: number): BaseColumnType;
    /**
     * 应用列配置数组
     * @param columnsConfig - 列配置数组
     */
    applyColumnsConfig(columnsConfig: Record<string, unknown>[]): void;
    /**
     * 验证单元格值
     * @param r - 行号
     * @param c - 列号
     * @param value - 待验证值
     * @returns true 表示通过，string 表示错误消息
     */
    validateCellValue(r: number, c: number, value: unknown): boolean | string;
    /**
     * 解析用户输入为目标类型值
     * @param r - 行号
     * @param c - 列号
     * @param input - 用户输入字符串
     * @returns 解析后的值
     */
    parseCellValue(r: number, c: number, input: string): unknown;
    /**
     * 解析动态单元格属性
     * @param r - 行号
     * @param c - 列号
     * @returns 属性对象，无动态属性返回 null
     */
    resolveCellProperties(r: number, c: number): CellProperties | null;

    /** 列配置映射表 */
    columnsConfig: Map<number, ColumnConfig & Record<string, unknown>>;
    /** 单元格类型映射表，键为 "r,c" */
    cellTypes: Map<string, { name: string; options: Record<string, unknown> }>;
    /** 列头配置 */
    colHeaders: unknown;
    /** 行头配置 */
    rowHeaders: unknown;
    /** 嵌套表头配置 */
    nestedHeaders: unknown;
    /** 行头宽度（px） */
    rowHeaderWidth: number;
    /** 表头高度（px） */
    headerHeight: number;
    /**
     * 获取列头样式
     * @param col - 列号
     * @returns 样式对象，无样式返回 null
     */
    getColHeaderStyle(col: number): Record<string, unknown> | null;
    /**
     * 获取行头样式
     * @param row - 行号
     * @returns 样式对象，无样式返回 null
     */
    getRowHeaderStyle(row: number): Record<string, unknown> | null;
    /** 获取嵌套表头行数 */
    getNestedHeaderRowCount(): number;
    /**
     * 获取嵌套列头信息
     * @param rowIndex - 嵌套行索引
     * @param col - 列号
     * @returns 标签、跨列数和可选样式
     */
    getNestedColHeader(rowIndex: number, col: number): { label: string; colspan: number; style?: Record<string, unknown> } | null;

    /** 行样式映射表（行号 → 样式 ID） */
    rowStyles: Map<number, number>;
    /** 列样式映射表（列号 → 样式 ID） */
    colStyles: Map<number, number>;

    /** 冻结行数（顶部固定行数） */
    fixedRowsTop: number;
    /** 冻结列数（左侧固定列数） */
    fixedColumnsStart: number;
    /** 冻结行区域总高度（px），带缓存 */
    frozenRowsHeight: number;
    /** 冻结列区域总宽度（px），带缓存 */
    frozenColsWidth: number;
    /**
     * 可见列号转实际列号（无列移动时为恒等映射）
     * @param visibleCol - 可见列号
     * @returns 实际列号
     */
    toRealCol(visibleCol: number): number;
    /**
     * 实际列号转可见列号（无列移动时为恒等映射）
     * @param realCol - 实际列号
     * @returns 可见列号
     */
    toVisibleCol(realCol: number): number;
}
