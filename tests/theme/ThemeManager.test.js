
import { ThemeManager } from '../../src/theme/ThemeManager.js';
import { defaultThemeConfig, darkThemeConfig } from '../../src/theme/config.js';

describe('ThemeManager', () => {
    let themeManager;

    beforeEach(() => {
        // 清除 localStorage
        localStorage.clear();
        themeManager = new ThemeManager({ persist: true });
    });

    describe('constructor', () => {
        it('should create instance with default theme', () => {
            expect(themeManager.getCurrentTheme()).toBe('default');
        });

        it('should create instance with specified default theme', () => {
            const manager = new ThemeManager({ defaultTheme: 'dark' });
            expect(manager.getCurrentTheme()).toBe('dark');
        });
    });

    describe('getTheme', () => {
        it('should return theme config for existing theme', () => {
            const theme = themeManager.getTheme('default');
            expect(theme).toBeDefined();
            expect(theme.name).toBe('default');
        });

        it('should return null for non-existing theme', () => {
            const theme = themeManager.getTheme('nonexistent');
            expect(theme).toBeNull();
        });
    });

    describe('registerTheme', () => {
        it('should register a new theme', () => {
            const customConfig = {
                name: 'custom',
                displayName: '自定义主题',
                version: '1.0.0',
                config: {
                    cell: {
                        default: { color: '#ff0000' }
                    }
                }
            };

            themeManager.registerTheme('custom', customConfig);
            const theme = themeManager.getTheme('custom');
            expect(theme).toEqual(customConfig);
        });

        it('should throw error when registering existing theme', () => {
            expect(() => {
                themeManager.registerTheme('default', defaultThemeConfig);
            }).toThrow('Theme "default" already exists');
        });

        it('should throw error for invalid config', () => {
            expect(() => {
                themeManager.registerTheme('invalid', {});
            }).toThrow();
        });
    });

    describe('setTheme', () => {
        it('should switch to existing theme', () => {
            const result = themeManager.setTheme('dark');
            expect(result).toBe(true);
            expect(themeManager.getCurrentTheme()).toBe('dark');
        });

        it('should throw error when switching to non-existing theme', () => {
            expect(() => {
                themeManager.setTheme('nonexistent');
            }).toThrow('Theme "nonexistent" does not exist');
        });

        it('should persist theme to localStorage', () => {
            themeManager.setTheme('dark');
            const saved = localStorage.getItem('canvas-sheet-theme');
            expect(saved).toBe('dark');
        });
    });

    describe('getStyle', () => {
        it('should return default style for cell.default', () => {
            const style = themeManager.getStyle('cell.default');
            expect(style).toBeDefined();
            expect(style.color).toBe('#000');
        });

        it('should return hyperlink style for cell.hyperlink', () => {
            const style = themeManager.getStyle('cell.hyperlink');
            expect(style).toBeDefined();
            expect(style.color).toBe('#1a73e8');
        });

        it('should return header style for cell.header', () => {
            const style = themeManager.getStyle('cell.header');
            expect(style).toBeDefined();
            expect(style.backgroundColor).toBe('#4CAF50');
        });
    });

    describe('getStyleId', () => {
        it('should return style ID for cell types', () => {
            const id = themeManager.getStyleId('cell.default');
            expect(id).toBeDefined();
            expect(typeof id).toBe('number');
        });
    });

    describe('getThemes', () => {
        it('should return list of registered themes', () => {
            const themes = themeManager.getThemes();
            expect(Array.isArray(themes)).toBe(true);
            expect(themes).toContain('default');
            expect(themes).toContain('dark');
        });

        it('should include newly registered themes', () => {
            themeManager.registerTheme('custom', {
                name: 'custom',
                displayName: '自定义',
                version: '1.0.0',
                config: { cell: { default: {} } }
            });

            const themes = themeManager.getThemes();
            expect(themes).toContain('custom');
        });
    });

    describe('removeTheme', () => {
        it('should remove existing theme', () => {
            themeManager.registerTheme('custom', {
                name: 'custom',
                displayName: '自定义',
                version: '1.0.0',
                config: { cell: { default: {} } }
            });

            const result = themeManager.removeTheme('custom');
            expect(result).toBe(true);
            expect(themeManager.getTheme('custom')).toBeNull();
        });

        it('should return false for non-existing theme', () => {
            const result = themeManager.removeTheme('nonexistent');
            expect(result).toBe(false);
        });

        it('should throw error when removing current theme', () => {
            expect(() => {
                themeManager.removeTheme('default');
            }).toThrow('Cannot remove the currently active theme');
        });
    });

    describe('persistence', () => {
        it('should load theme from localStorage', () => {
            localStorage.setItem('canvas-sheet-theme', 'dark');
            const manager = new ThemeManager({ persist: true });
            expect(manager.getCurrentTheme()).toBe('dark');
        });

        it('should load custom themes from localStorage', () => {
            const customTheme = {
                name: 'saved-custom',
                displayName: '保存的自定义主题',
                version: '1.0.0',
                config: { cell: { default: { color: '#ff0000' } } }
            };
            localStorage.setItem('canvas-sheet-themes', JSON.stringify({ 'saved-custom': customTheme }));
            
            const manager = new ThemeManager({ persist: true });
            const theme = manager.getTheme('saved-custom');
            expect(theme).toEqual(customTheme);
        });
    });

    describe('dark theme', () => {
        it('should have dark theme styles', () => {
            themeManager.setTheme('dark');
            
            const defaultStyle = themeManager.getStyle('cell.default');
            expect(defaultStyle.color).toBe('#fff');
            expect(defaultStyle.backgroundColor).toBe('#333');

            const hyperlinkStyle = themeManager.getStyle('cell.hyperlink');
            expect(hyperlinkStyle.color).toBe('#64B5F6');
        });
    });
});