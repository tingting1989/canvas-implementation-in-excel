import { describe, it, expect } from 'vitest';
import {
    excelWidthToPixel,
    pixelToExcelWidth,
    excelHeightToPixel,
    pixelToExcelHeight,
    excelFontSizeToPixel,
    pixelToExcelFontSize,
    convertColumnWidthsToPixels,
    convertRowHeightsToPixels,
    EXCEL_UNITS_CONSTANTS,
} from '../../src/utils/excelUnits.js';

describe('excelUnits - Excel单位转换工具', () => {
    
    describe('常量定义', () => {
        it('应该导出正确的DPI和转换常量', () => {
            expect(EXCEL_UNITS_CONSTANTS.STANDARD_DPI).toBe(96);
            expect(EXCEL_UNITS_CONSTANTS.POINTS_PER_INCH).toBe(72);
            expect(EXCEL_UNITS_CONSTANTS.MAX_DIGIT_WIDTH).toBe(7);
            expect(EXCEL_UNITS_CONSTANTS.COLUMN_PADDING).toBe(5);
        });
        
        it('应该导出默认值常量（包括字体相关）', () => {
            expect(EXCEL_UNITS_CONSTANTS.DEFAULT_COL_WIDTH_PX).toBe(100);
            expect(EXCEL_UNITS_CONSTANTS.DEFAULT_ROW_HEIGHT_PX).toBe(28);
            expect(EXCEL_UNITS_CONSTANTS.DEFAULT_EXCEL_COL_WIDTH).toBe(8.43);
            expect(EXCEL_UNITS_CONSTANTS.DEFAULT_EXCEL_ROW_HEIGHT).toBe(15);
            // 字体相关常量
            expect(EXCEL_UNITS_CONSTANTS.MIN_FONT_SIZE_PX).toBe(8);
            expect(EXCEL_UNITS_CONSTANTS.DEFAULT_FONT_SIZE_PX).toBe(12);
            expect(EXCEL_UNITS_CONSTANTS.DEFAULT_EXCEL_FONT_SIZE).toBe(11);
            expect(EXCEL_UNITS_CONSTANTS.MAX_FONT_SIZE_PX).toBe(200);
        });
    });

    describe('excelWidthToPixel() - 字符宽度转像素', () => {
        it('应该正确转换Excel默认列宽', () => {
            expect(excelWidthToPixel(8.43)).toBe(64); // (8.43 * 7) + 5 = 64.01 ≈ 64
        });

        it('应该正确转换常见列宽', () => {
            expect(excelWidthToPixel(10)).toBe(75);   // (10 * 7) + 5 = 75
            expect(excelWidthToPixel(15)).toBe(110);  // (15 * 7) + 5 = 110
            expect(excelWidthToPixel(20)).toBe(145);  // (20 * 7) + 5 = 145
        });

        it('应该处理无效输入并返回默认值', () => {
            expect(excelWidthToPixel(0)).toBe(100);
            expect(excelWidthToPixel(-1)).toBe(100);
            expect(excelWidthToPixel(null)).toBe(100);
            expect(excelWidthToPixel(undefined)).toBe(100);
            expect(excelWidthToPixel('abc')).toBe(100);
        });
    });

    describe('pixelToExcelWidth() - 像素转字符宽度', () => {
        it('应该是excelWidthToPixel的反向转换', () => {
            const originalWidth = 15;
            const pixels = excelWidthToPixel(originalWidth);
            const convertedBack = pixelToExcelWidth(pixels);
            expect(convertedBack).toBeCloseTo(originalWidth, 1);
        });
    });

    describe('excelHeightToPixel() - 磅转像素', () => {
        it('应该正确转换Excel默认行高', () => {
            expect(excelHeightToPixel(15)).toBe(20); // 15 * (96/72) = 20
        });

        it('应该正确转换常见行高', () => {
            expect(excelHeightToPixel(18)).toBe(24); // 18 * 1.333... = 24
            expect(excelHeightToPixel(24)).toBe(32); // 24 * 1.333... = 32
            expect(excelHeightToPixel(30)).toBe(40); // 30 * 1.333... = 40
        });
    });

    describe('pixelToExcelHeight() - 像素转磅', () => {
        it('应该是excelHeightToPixel的反向转换', () => {
            const originalHeight = 15;
            const pixels = excelHeightToPixel(originalHeight);
            const convertedBack = pixelToExcelHeight(pixels);
            expect(convertedBack).toBeCloseTo(originalHeight, 1);
        });
    });

    describe('excelFontSizeToPixel() - Excel字体大小转像素', () => {
        it('应该正确转换Excel默认字体大小（11磅）', () => {
            const result = excelFontSizeToPixel(11);
            // 11 * (96/72) = 14.666... ≈ 15
            expect(result).toBe(15);
        });

        it('应该正确转换常见字体大小', () => {
            expect(excelFontSizeToPixel(9)).toBe(12);   // 9 * 1.333... = 12
            expect(excelFontSizeToPixel(10)).toBe(13);   // 10 * 1.333... = 13.33 ≈ 13
            expect(excelFontSizeToPixel(12)).toBe(16);   // 12 * 1.333... = 16
            expect(excelFontSizeToPixel(14)).toBe(19);   // 14 * 1.333... = 18.67 ≈ 19
            expect(excelFontSizeToPixel(16)).toBe(21);   // 16 * 1.333... = 21.33 ≈ 21
            expect(excelFontSizeToPixel(18)).toBe(24);   // 18 * 1.333... = 24
            expect(excelFontSizeToPixel(20)).toBe(27);   // 20 * 1.333... = 26.67 ≈ 27
        });

        it('应该处理小字号（如注释文字）', () => {
            expect(excelFontSizeToPixel(6)).toBe(8);     // 6 * 1.333... = 8 → 最小值限制
            expect(excelFontSizeToPixel(7)).toBe(9);     // 7 * 1.333... = 9.33 ≈ 9
            expect(excelFontSizeToPixel(8)).toBe(11);    // 8 * 1.333... = 10.67 ≈ 11
        });

        it('应该处理大字号（标题）', () => {
            expect(excelFontSizeToPixel(24)).toBe(32);   // 24 * 1.333... = 32
            expect(excelFontSizeToPixel(36)).toBe(48);   // 36 * 1.333... = 48
            expect(excelFontSizeToPixel(48)).toBe(64);   // 48 * 1.333... = 64
            expect(excelFontSizeToPixel(72)).toBe(96);   // 72 * 1.333... = 96
            expect(excelFontSizeToPixel(150)).toBe(200); // 150 * 1.333... = 200 → 最大值限制
        });

        it('应该处理无效输入并返回默认值', () => {
            expect(excelFontSizeToPixel(0)).toBe(12);      // 默认值
            expect(excelFontSizeToPixel(-10)).toBe(12);    // 默认值
            expect(excelFontSizeToPixel(null)).toBe(12);   // 默认值
            expect(excelFontSizeToPixel(undefined)).toBe(12); // 默认值
            expect(excelFontSizeToPixel('abc')).toBe(12);  // 默认值
            expect(excelFontSizeToPixel(NaN)).toBe(12);    // 默认值
        });

        it('应该支持自定义选项', () => {
            // 自定义默认值
            expect(excelFontSizeToPixel(0, { defaultValue: 14 })).toBe(14);
            
            // 自定义最小值
            expect(excelFontSizeToPixel(6, { minSize: 10 })).toBe(10);
            
            // 自定义最大值
            expect(excelFontSizeToPixel(50, { maxSize: 30 })).toBe(30);
        });

        it('应该应用边界限制', () => {
            // 测试最小边界
            expect(excelFontSizeToPixel(1, { minSize: 6, defaultValue: 10 })).toBe(6);
            
            // 测试最大边界
            expect(excelFontSizeToPixel(300, { maxSize: 72, defaultValue: 10 })).toBe(72);
        });
    });

    describe('pixelToExcelFontSize() - 像素字体大小转Excel格式', () => {
        it('应该是excelFontSizeToPixel的反向转换', () => {
            const testSizes = [9, 11, 12, 14, 16, 18, 20];
            
            testSizes.forEach(points => {
                const pixels = excelFontSizeToPixel(points);
                const convertedBack = pixelToExcelFontSize(pixels);
                expect(convertedBack).toBeCloseTo(points, 0); // 允许±1的误差
            });
        });

        it('应该正确转换Canvas-Sheet默认字体大小', () => {
            const result = pixelToExcelFontSize(12);
            // 12 / 1.333... = 9
            expect(result).toBeCloseTo(9, 0);
        });

        it('应该正确转换常见像素字体大小', () => {
            expect(pixelToExcelFontSize(10)).toBeCloseTo(7.5, 1);  // 10 / 1.333...
            expect(pixelToExcelFontSize(14)).toBeCloseTo(10.5, 1); // 14 / 1.333...
            expect(pixelToExcelFontSize(16)).toBeCloseTo(12, 0);   // 16 / 1.333... = 12
            expect(pixelToExcelFontSize(18)).toBeCloseTo(13.5, 1); // 18 / 1.333...
            expect(pixelToExcelFontSize(24)).toBeCloseTo(18, 0);   // 24 / 1.333... = 18
        });

        it('应该处理无效输入并返回默认值', () => {
            expect(pixelToExcelFontSize(0)).toBe(11);       // Excel默认值
            expect(pixelToExcelFontSize(-5)).toBe(11);      // Excel默认值
            expect(pixelToExcelFontSize(null)).toBe(11);    // Excel默认值
            expect(pixelToExcelFontSize(undefined)).toBe(11); // Excel默认值
        });

        it('应该支持自定义选项', () => {
            // 自定义默认值
            expect(pixelToExcelFontSize(0, { defaultValue: 12 })).toBe(12);
            
            // 自定义边界
            expect(pixelToExcelFontSize(2, { minSize: 5, defaultValue: 10 })).toBe(5);
            expect(pixelToExcelFontSize(500, { maxSize: 72, defaultValue: 10 })).toBe(72);
        });
    });

    describe('批量转换方法', () => {
        describe('convertColumnWidthsToPixels()', () => {
            it('应该批量转换列宽数组', () => {
                const input = [
                    { col: 0, width: 10 },
                    { col: 1, width: 15 },
                    { col: 2, width: 20 },
                ];
                
                const result = convertColumnWidthsToPixels(input);
                
                expect(result).toEqual([
                    { col: 0, width: 75 },
                    { col: 1, width: 110 },
                    { col: 2, width: 145 },
                ]);
            });

            it('应该处理空数组或无效输入', () => {
                expect(convertColumnWidthsToPixels([])).toEqual([]);
                expect(convertColumnWidthsToPixels(null)).toEqual([]);
                expect(convertColumnWidthsToPixels(undefined)).toEqual([]);
            });
        });

        describe('convertRowHeightsToPixels()', () => {
            it('应该批量转换行高数组', () => {
                const input = [
                    { row: 0, height: 15 },
                    { row: 1, height: 18 },
                    { row: 2, height: 24 },
                ];
                
                const result = convertRowHeightsToPixels(input);
                
                expect(result).toEqual([
                    { row: 0, height: 20 },
                    { row: 1, height: 24 },
                    { row: 2, height: 32 },
                ]);
            });
        });
    });

    describe('往返转换一致性测试', () => {
        it('列宽往返转换应该保持一致性', () => {
            const testValues = [8.43, 10, 15, 20, 25, 30];
            
            testValues.forEach(charWidth => {
                const pixels = excelWidthToPixel(charWidth);
                const backToChar = pixelToExcelWidth(pixels);
                expect(backToChar).toBeCloseTo(charWidth, 0);
            });
        });

        it('行高往返转换应该保持一致性', () => {
            const testValues = [15, 18, 20, 24, 30, 40];
            
            testValues.forEach(points => {
                const pixels = excelHeightToPixel(points);
                const backToPoints = pixelToExcelHeight(pixels);
                expect(backToPoints).toBeCloseTo(points, 0);
            });
        });

        it('字体大小往返转换应该保持一致性（允许±1误差）', () => {
            const testValues = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 36];
            
            testValues.forEach(points => {
                const pixels = excelFontSizeToPixel(points);
                const backToPoints = pixelToExcelFontSize(pixels);
                // 由于四舍五入，允许±1的误差
                expect(Math.abs(backToPoints - points)).toBeLessThanOrEqual(1);
            });
        });
    });

    describe('实际应用场景模拟', () => {
        it('应该正确处理典型的Excel导入场景', () => {
            // 模拟从Excel读取的样式数据
            const excelStyle = {
                font: {
                    size: 11,  // Excel默认字体
                    name: 'Calibri',
                    bold: false
                }
            };

            // 转换为Canvas格式
            const canvasFontSize = excelFontSizeToPixel(excelStyle.font.size);
            
            // 验证：11pt → 约15px（接近Canvas默认12px）
            expect(canvasFontSize).toBe(15);
            expect(canvasFontSize).toBeGreaterThan(10);
            expect(canvasFontSize).toBeLessThan(20);
        });

        it('应该正确处理典型的Excel导出场景', () => {
            // 模拟Canvas中的样式数据
            const canvasStyle = {
                fontSize: 12,  // Canvas默认字体
                fontFamily: 'Segoe UI',
                fontWeight: 'normal'
            };

            // 转换为Excel格式
            const excelFontSize = pixelToExcelFontSize(canvasStyle.fontSize);
            
            // 验证：12px → 约9pt（接近Excel默认11pt）
            expect(excelFontSize).toBeCloseTo(9, 0);
            expect(excelFontSize).toBeGreaterThan(6);
            expect(excelFontSize).toBeLessThan(14);
        });

        it('应该保持不同系统间的视觉一致性', () => {
            // 常见字体大小对照表
            const fontMappings = [
                { excel: 8, expectedCanvasRange: [10, 12] },   // 小字
                { excel: 9, expectedCanvasRange: [11, 13] },   // 正文
                { excel: 11, expectedCanvasRange: [14, 16] },  // 标准Excel
                { excel: 12, expectedCanvasRange: [15, 17] },  // 较大文本
                { excel: 14, expectedCanvasRange: [18, 20] },  // 小标题
                { excel: 16, expectedCanvasRange: [20, 22] },  // 中标题
                { excel: 18, expectedCanvasRange: [23, 25] },  // 大标题
            ];

            fontMappings.forEach(({ excel, expectedCanvasRange }) => {
                const canvasSize = excelFontSizeToPixel(excel);
                expect(canvasSize).toBeGreaterThanOrEqual(expectedCanvasRange[0]);
                expect(canvasSize).toBeLessThanOrEqual(expectedCanvasRange[1]);
            });
        });
    });
});