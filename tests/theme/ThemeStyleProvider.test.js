
import { ThemeStyleProvider, themeStyleProvider } from '../../src/theme/ThemeStyleProvider.js';

describe('ThemeStyleProvider', () => {
    let provider;

    beforeEach(() => {
        localStorage.clear();
        provider = new ThemeStyleProvider();
    });

    describe('constructor', () => {
        it('should create instance', () => {
            expect(provider).toBeDefined();
        });
    });

    describe('getCellStyle', () => {
        it('should return header style for header row', () => {
            const style = provider.getCellStyle(0, 0, 'text');
            expect(style.backgroundColor).toBe('#4CAF50');
            expect(style.color).toBe('#fff');
        });

        it('should return hyperlink style for hyperlink cell type', () => {
            const style = provider.getCellStyle(1, 0, 'hyperlink');
            expect(style.color).toBe('#1a73e8');
            expect(style.textDecoration).toBe('underline');
        });

        it('should return default style for regular cells', () => {
            const style = provider.getCellStyle(1, 0, 'text');
            expect(style.color).toBe('#000');
            expect(style.backgroundColor).toBe('transparent');
        });
    });

    describe('getCellStyleId', () => {
        it('should return style ID for header row', () => {
            const id = provider.getCellStyleId(0, 0, 'text');
            expect(typeof id).toBe('number');
            expect(id).toBeGreaterThan(0);
        });

        it('should return style ID for hyperlink cell', () => {
            const id = provider.getCellStyleId(1, 0, 'hyperlink');
            expect(typeof id).toBe('number');
            expect(id).toBeGreaterThan(0);
        });
    });

    describe('getStyle', () => {
        it('should return cell.default style', () => {
            const style = provider.getStyle('cell.default');
            expect(style).toBeDefined();
            expect(style.fontFamily).toBe('Microsoft YaHei');
        });

        it('should return cell.hyperlink style', () => {
            const style = provider.getStyle('cell.hyperlink');
            expect(style).toBeDefined();
            expect(style.cursor).toBe('pointer');
        });
    });

    describe('getStyleId', () => {
        it('should return style ID for valid type', () => {
            const id = provider.getStyleId('cell.default');
            expect(typeof id).toBe('number');
        });
    });

    describe('getCurrentTheme', () => {
        it('should return current theme name', () => {
            expect(provider.getCurrentTheme()).toBe('default');
        });
    });

    describe('setTheme', () => {
        it('should switch theme', () => {
            provider.setTheme('dark');
            expect(provider.getCurrentTheme()).toBe('dark');
        });

        it('should update styles after theme switch', () => {
            provider.setTheme('dark');
            const style = provider.getCellStyle(1, 0, 'text');
            expect(style.color).toBe('#fff');
            expect(style.backgroundColor).toBe('#333');
        });
    });

    describe('registerTheme', () => {
        it('should register new theme', () => {
            provider.registerTheme('custom', {
                name: 'custom',
                displayName: '自定义',
                version: '1.0.0',
                config: {
                    cell: {
                        default: { color: '#ff0000', backgroundColor: '#00ff00' },
                        hyperlink: { color: '#0000ff' }
                    }
                }
            });

            expect(provider.getThemes()).toContain('custom');
        });
    });

    describe('getThemes', () => {
        it('should return all registered themes', () => {
            const themes = provider.getThemes();
            expect(themes).toContain('default');
            expect(themes).toContain('dark');
        });
    });

    describe('singleton', () => {
        it('should have a singleton instance', () => {
            expect(themeStyleProvider).toBeDefined();
            expect(themeStyleProvider instanceof ThemeStyleProvider).toBe(true);
        });

        it('should share state across singleton instances', () => {
            themeStyleProvider.setTheme('dark');
            expect(themeStyleProvider.getCurrentTheme()).toBe('dark');
        });
    });
});