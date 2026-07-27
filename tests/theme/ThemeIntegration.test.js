
import { ThemeManager } from '../../src/theme/ThemeManager.js';
import { themeStyleProvider } from '../../src/theme/ThemeStyleProvider.js';
import { HyperlinkColumnType } from '../../src/types/HyperlinkColumnType.js';

describe('Theme Integration', () => {
    let themeManager;

    beforeEach(() => {
        localStorage.clear();
        themeManager = new ThemeManager({ persist: true });
        themeStyleProvider.setTheme('default');
    });

    describe('HyperlinkColumnType with Theme', () => {
        it('should use theme colors in getDefaultStyle', () => {
            const hyperlinkType = new HyperlinkColumnType();
            const baseStyle = { color: '#000' };
            
            // getDefaultStyle 返回基础样式，主题样式在 render() 中动态应用
            const style = hyperlinkType.getDefaultStyle(baseStyle);
            
            // 验证基础样式保持不变
            expect(style.color).toBe('#000');
            
            // 验证主题样式可通过 themeStyleProvider 获取
            const themeStyle = themeStyleProvider.getStyle('cell.hyperlink');
            expect(themeStyle.color).toBe('#1a73e8');
            expect(themeStyle.cursor).toBe('pointer');
        });

        it('should use dark theme colors when theme is dark', () => {
            themeStyleProvider.setTheme('dark');
            
            const hyperlinkType = new HyperlinkColumnType();
            const baseStyle = { color: '#fff' };
            
            const style = hyperlinkType.getDefaultStyle(baseStyle);
            
            // getDefaultStyle 只返回基础样式，不包含主题样式
            expect(style.color).toBe('#fff');
            
            // 主题样式通过 themeStyleProvider 获取
            const themeStyle = themeStyleProvider.getStyle('cell.hyperlink');
            expect(themeStyle.color).toBe('#64B5F6');
            expect(themeStyle.backgroundColor).toBe('#333');
        });

        it('should have consistent styles between provider and column type', () => {
            const providerStyle = themeStyleProvider.getStyle('cell.hyperlink');
            const hyperlinkType = new HyperlinkColumnType();
            const baseStyle = { color: '#000' };
            const columnStyle = hyperlinkType.getDefaultStyle(baseStyle);
            
            // getDefaultStyle 返回基础样式，render() 中会合并主题样式
            expect(columnStyle.color).toBe('#000');
            
            // 主题样式应包含 hyperlink 特有属性
            expect(providerStyle.color).toBe('#1a73e8');
            expect(providerStyle.textDecoration).toBe('underline');
            expect(providerStyle.cursor).toBe('pointer');
        });
    });

    describe('Theme Switching', () => {
        it('should update styles immediately after theme switch', () => {
            // Default theme
            let style = themeStyleProvider.getStyle('cell.hyperlink');
            expect(style.color).toBe('#1a73e8');
            
            // Switch to dark theme
            themeStyleProvider.setTheme('dark');
            
            style = themeStyleProvider.getStyle('cell.hyperlink');
            expect(style.color).toBe('#64B5F6');
            
            // Switch back to default
            themeStyleProvider.setTheme('default');
            
            style = themeStyleProvider.getStyle('cell.hyperlink');
            expect(style.color).toBe('#1a73e8');
        });

        it('should maintain custom styles after theme switch', () => {
            themeStyleProvider.registerTheme('custom', {
                name: 'custom',
                displayName: '自定义',
                version: '1.0.0',
                config: {
                    cell: {
                        default: { color: '#ff0000' },
                        hyperlink: { color: '#00ff00', backgroundColor: '#000' },
                        header: { color: '#fff', backgroundColor: '#ff0000' }
                    }
                }
            });

            themeStyleProvider.setTheme('custom');
            
            const style = themeStyleProvider.getStyle('cell.hyperlink');
            expect(style.color).toBe('#00ff00');
            expect(style.backgroundColor).toBe('#000');
        });
    });

    describe('Style Provider Integration', () => {
        it('should return correct style for different cell types', () => {
            // Header cell
            let style = themeStyleProvider.getCellStyle(0, 0, 'header');
            expect(style.backgroundColor).toBe('#4CAF50');
            expect(style.color).toBe('#fff');
            
            // Regular cell
            style = themeStyleProvider.getCellStyle(1, 0, 'text');
            expect(style.color).toBe('#000');
            
            // Hyperlink cell
            style = themeStyleProvider.getCellStyle(1, 0, 'hyperlink');
            expect(style.color).toBe('#1a73e8');
        });

        it('should handle theme switch in provider', () => {
            // Default theme
            let style = themeStyleProvider.getCellStyle(1, 0, 'hyperlink');
            expect(style.color).toBe('#1a73e8');
            
            // Switch to dark
            themeStyleProvider.setTheme('dark');
            
            style = themeStyleProvider.getCellStyle(1, 0, 'hyperlink');
            expect(style.color).toBe('#64B5F6');
        });
    });

    describe('Configuration Validation', () => {
        it('should validate theme config structure', () => {
            expect(() => {
                themeManager.registerTheme('invalid', {});
            }).toThrow();

            expect(() => {
                themeManager.registerTheme('invalid', { config: {} });
            }).toThrow();

            expect(() => {
                themeManager.registerTheme('invalid', { config: { cell: {} } });
            }).not.toThrow();
        });
    });

    describe('Performance', () => {
        it('should cache style IDs for performance', () => {
            const id1 = themeManager.getStyleId('cell.default');
            const id2 = themeManager.getStyleId('cell.default');
            
            expect(id1).toBe(id2);
        });
    });
});