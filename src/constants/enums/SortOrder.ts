/**
 * 排序顺序枚举
 * @description 定义数据排序的方式，用于对数据进行升序或降序排列
 * @constant
 */
export type SortOrderValue = "asc" | "desc";

export interface SortOrder {
    /** 升序排列（Ascending），按从小到大的顺序排序（数字、字母、日期等） */
    readonly ASC: "asc";
    /** 降序排列（Descending），按从大到小的顺序排序（数字、字母、日期等） */
    readonly DESC: "desc";
}

export const SORT_ORDER: SortOrder = Object.freeze({
    ASC: "asc",
    DESC: "desc",
});
