import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SheetTabBarElement } from "@/ui/sheetTab/SheetTabBarElement.js";
import { SHEET_TAB_EVENTS } from "@/ui/sheetTab/sheetTabEvents.js";
import { EVENT_NAMES } from "@/constants/eventNames.js";

describe("SheetTabBarElement Web Component", () => {
    let element;

    beforeEach(() => {
        element = document.createElement("sheet-tab-bar");
        document.body.appendChild(element);
    });

    afterEach(() => {
        element.destroy();
        element.remove();
    });

    it("STBE-01: 渲染 Shadow DOM — 包含 nav-group, tabs-scroll, tabs, add-btn", () => {
        const navGroup = element.shadowRoot.querySelector(".nav-group");
        const scrollWrap = element.shadowRoot.querySelector(".tabs-scroll");
        const tabsContainer = element.shadowRoot.querySelector(".tabs");
        const addBtn = element.shadowRoot.querySelector(".add-btn.in-scroll");

        expect(navGroup).not.toBeNull();
        expect(scrollWrap).not.toBeNull();
        expect(tabsContainer).not.toBeNull();
        expect(addBtn).not.toBeNull();
    });

    it("STBE-02: 导航组包含前进和后退按钮", () => {
        const prevBtn = element.shadowRoot.querySelector(".nav-btn.prev");
        const nextBtn = element.shadowRoot.querySelector(".nav-btn.next");

        expect(prevBtn).not.toBeNull();
        expect(nextBtn).not.toBeNull();
    });

    it("STBE-03: 添加按钮文本为 +", () => {
        const addBtn = element.shadowRoot.querySelector(".add-btn.in-scroll");
        expect(addBtn.textContent).toBe("+");
    });

    it("STBE-04: 添加按钮在 tabs-scroll 内部", () => {
        const addBtn = element.shadowRoot.querySelector(".add-btn.in-scroll");
        expect(addBtn).not.toBeNull();

        const scrollWrap = element.shadowRoot.querySelector(".tabs-scroll");
        expect(scrollWrap.contains(addBtn)).toBe(true);
    });

    it("STBE-05: refresh 根据 sheets 创建标签", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tabs = element.shadowRoot.querySelectorAll(".tab");
        expect(tabs.length).toBe(2);
    });

    it("STBE-06: 活动工作表标签有 active 类", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tabs = element.shadowRoot.querySelectorAll(".tab");
        const activeTab = Array.from(tabs).find((t) => t.classList.contains("active"));
        expect(activeTab).not.toBeNull();
        expect(activeTab.dataset.name).toBe("Sheet1");
    });

    it("STBE-07: 标签不包含 close-btn", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const closeBtns = element.shadowRoot.querySelectorAll(".close-btn");
        expect(closeBtns.length).toBe(0);
    });

    it("STBE-08: 标签不包含 closable 类", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tabs = element.shadowRoot.querySelectorAll(".tab");
        tabs.forEach((tab) => {
            expect(tab.classList.contains("closable")).toBe(false);
        });
    });

    it("STBE-09: 点击添加按钮派发 add 事件", () => {
        const addSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.ADD, addSpy);

        const addBtn = element.shadowRoot.querySelector(".add-btn.in-scroll");
        addBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(addSpy).toHaveBeenCalledTimes(1);

        element.removeEventListener(SHEET_TAB_EVENTS.ADD, addSpy);
    });

    it("STBE-10: 点击标签派发 switch 事件", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const switchSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet2"]');
        tab.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(switchSpy).toHaveBeenCalledTimes(1);
        expect(switchSpy.mock.calls[0][0].detail.name).toBe("Sheet2");

        element.removeEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);
    });

    it("STBE-11: 双击标签触发重命名流程", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        const label = tab.querySelector(".label");
        label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

        const renameInput = tab.querySelector(".rename-input");
        expect(renameInput).not.toBeNull();
    });

    it("STBE-12: 右键标签切换工作表并显示上下文菜单", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const switchSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        tab.dispatchEvent(
            new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: 100,
                clientY: 50,
            }),
        );

        expect(switchSpy).toHaveBeenCalledTimes(1);
        expect(switchSpy.mock.calls[0][0].detail.name).toBe("Sheet1");

        const menu = element.shadowRoot.querySelector(".context-menu");
        expect(menu).not.toBeNull();
        expect(menu.getRootNode()).toBe(element.shadowRoot);

        element.removeEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);
    });

    it("STBE-13: 上下文菜单包含重命名、删除、复制、隐藏选项", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        tab.dispatchEvent(
            new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: 100,
                clientY: 50,
            }),
        );

        const items = element.shadowRoot.querySelectorAll(".context-menu-item");
        expect(items.length).toBe(4);

        const actions = Array.from(items).map((i) => i.dataset.action);
        expect(actions).toContain("rename");
        expect(actions).toContain("delete");
        expect(actions).toContain("copy");
        expect(actions).toContain("hide");
    });

    it("STBE-14: 多工作表时删除选项为 danger 样式", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        tab.dispatchEvent(
            new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: 100,
                clientY: 50,
            }),
        );

        const deleteItem = element.shadowRoot.querySelector('.context-menu-item[data-action="delete"]');
        expect(deleteItem.classList.contains("danger")).toBe(true);
        expect(deleteItem.classList.contains("disabled")).toBe(false);
    });

    it("STBE-15: 单工作表时删除选项为 disabled", () => {
        const sheets = new Map([["Sheet1", { name: "Sheet1" }]]);
        element.refresh(sheets, "Sheet1");

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        tab.dispatchEvent(
            new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: 100,
                clientY: 50,
            }),
        );

        const deleteItem = element.shadowRoot.querySelector('.context-menu-item[data-action="delete"]');
        expect(deleteItem.classList.contains("disabled")).toBe(true);
    });

    it("STBE-16: 点击删除菜单项派发 close 事件", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const closeSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.CLOSE, closeSpy);

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        tab.dispatchEvent(
            new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: 100,
                clientY: 50,
            }),
        );

        const deleteItem = element.shadowRoot.querySelector('.context-menu-item[data-action="delete"]');
        deleteItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(closeSpy.mock.calls[0][0].detail.name).toBe("Sheet1");

        element.removeEventListener(SHEET_TAB_EVENTS.CLOSE, closeSpy);
    });

    it("STBE-17: 点击重命名菜单项触发重命名流程", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        tab.dispatchEvent(
            new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: 100,
                clientY: 50,
            }),
        );

        const renameItem = element.shadowRoot.querySelector('.context-menu-item[data-action="rename"]');
        renameItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        const renameInput = element.shadowRoot.querySelector(".rename-input");
        expect(renameInput).not.toBeNull();
    });

    it("STBE-18: 点击复制菜单项派发 copy 事件", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const copySpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.COPY, copySpy);

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        tab.dispatchEvent(
            new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: 100,
                clientY: 50,
            }),
        );

        const copyItem = element.shadowRoot.querySelector('.context-menu-item[data-action="copy"]');
        copyItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(copySpy).toHaveBeenCalledTimes(1);
        expect(copySpy.mock.calls[0][0].detail.name).toBe("Sheet1");

        element.removeEventListener(SHEET_TAB_EVENTS.COPY, copySpy);
    });

    it("STBE-19: 点击隐藏菜单项派发 hide 事件", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const hideSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.HIDE, hideSpy);

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        tab.dispatchEvent(
            new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: 100,
                clientY: 50,
            }),
        );

        const hideItem = element.shadowRoot.querySelector('.context-menu-item[data-action="hide"]');
        hideItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(hideSpy).toHaveBeenCalledTimes(1);
        expect(hideSpy.mock.calls[0][0].detail.name).toBe("Sheet1");

        element.removeEventListener(SHEET_TAB_EVENTS.HIDE, hideSpy);
    });

    it("STBE-20: 点击菜单外区域关闭上下文菜单", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        tab.dispatchEvent(
            new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: 100,
                clientY: 50,
            }),
        );

        expect(element.shadowRoot.querySelector(".context-menu")).not.toBeNull();

        const outsideClick = new MouseEvent("click", { bubbles: true, composed: true });
        document.dispatchEvent(outsideClick);

        expect(element.shadowRoot.querySelector(".context-menu")).toBeNull();
    });

    it("STBE-21: 按 Escape 关闭上下文菜单", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        tab.dispatchEvent(
            new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: 100,
                clientY: 50,
            }),
        );

        expect(element.shadowRoot.querySelector(".context-menu")).not.toBeNull();

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        expect(element.shadowRoot.querySelector(".context-menu")).toBeNull();
    });

    it("STBE-22: 点击前进按钮向右滚动标签", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const nextBtn = element.shadowRoot.querySelector(".nav-btn.next");
        nextBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        const scrollWrap = element.shadowRoot.querySelector(".tabs-scroll");
        expect(scrollWrap.scrollLeft).toBeGreaterThanOrEqual(0);
    });

    it("STBE-23: 点击后退按钮向左滚动标签", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const nextBtn = element.shadowRoot.querySelector(".nav-btn.next");
        nextBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        const prevBtn = element.shadowRoot.querySelector(".nav-btn.prev");
        prevBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        const scrollWrap = element.shadowRoot.querySelector(".tabs-scroll");
        expect(scrollWrap.scrollLeft).toBeDefined();
    });

    it("STBE-24: refresh 销毁旧标签并创建新标签", () => {
        const sheets2 = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets2, "Sheet1");
        expect(element.shadowRoot.querySelectorAll(".tab").length).toBe(2);

        const sheets3 = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
            ["Sheet3", { name: "Sheet3" }],
        ]);
        element.refresh(sheets3, "Sheet3");
        expect(element.shadowRoot.querySelectorAll(".tab").length).toBe(3);
    });

    it("STBE-25: 标签只包含 label 子元素", () => {
        const sheets = new Map([["Sheet1", { name: "Sheet1" }]]);
        element.refresh(sheets, "Sheet1");

        const tab = element.shadowRoot.querySelector(".tab");
        expect(tab.querySelector(".label")).not.toBeNull();
        expect(tab.querySelector(".close-btn")).toBeNull();
    });

    it("STBE-26: 标签 label 文本与 name 一致", () => {
        const sheets = new Map([["MySheet", { name: "MySheet" }]]);
        element.refresh(sheets, "MySheet");

        const label = element.shadowRoot.querySelector(".tab .label");
        expect(label.textContent).toBe("MySheet");
    });

    it("STBE-27: destroy 后组件标记为已销毁", () => {
        element.destroy();
        expect(element.isDestroyed).toBe(true);
    });

    it("STBE-28: destroy 后 refresh 不再操作 DOM", () => {
        element.destroy();

        const sheets = new Map([["Sheet1", { name: "Sheet1" }]]);
        expect(() => element.refresh(sheets, "Sheet1")).not.toThrow();
    });

    it("STBE-29: refresh 后滚动偏移重置为 0", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const scrollWrap = element.shadowRoot.querySelector(".tabs-scroll");
        expect(scrollWrap.scrollLeft).toBe(0);
    });

    it("STBE-30: 重命名输入 Enter 后派发 rename 事件", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const renameSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.RENAME, renameSpy);

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        const label = tab.querySelector(".label");
        label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

        const renameInput = tab.querySelector(".rename-input");
        renameInput.value = "NewName";
        renameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        renameInput.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

        expect(renameSpy).toHaveBeenCalledTimes(1);
        expect(renameSpy.mock.calls[0][0].detail.oldName).toBe("Sheet1");
        expect(renameSpy.mock.calls[0][0].detail.newName).toBe("NewName");

        element.removeEventListener(SHEET_TAB_EVENTS.RENAME, renameSpy);
    });

    it("STBE-31: 重命名输入 Escape 后取消重命名", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const renameSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.RENAME, renameSpy);

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        const label = tab.querySelector(".label");
        label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

        const renameInput = tab.querySelector(".rename-input");
        renameInput.value = "NewName";
        renameInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        expect(renameSpy).not.toHaveBeenCalled();

        element.removeEventListener(SHEET_TAB_EVENTS.RENAME, renameSpy);
    });

    it("STBE-32: 重命名输入框无边框无轮廓", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        const label = tab.querySelector(".label");
        label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

        const style = element.shadowRoot.querySelector("style");
        const cssText = style.textContent;
        expect(cssText).toContain(".rename-input");
        expect(cssText).toContain("border: none");
        expect(cssText).toContain("outline: none");
    });

    it("STBE-33: 重命名输入框有 min-width", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        const label = tab.querySelector(".label");
        label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

        const style = element.shadowRoot.querySelector("style");
        const cssText = style.textContent;
        expect(cssText).toContain("min-width: 40px");
    });

    it("STBE-34: wheel 事件不触发滚动", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const scrollWrap = element.shadowRoot.querySelector(".tabs-scroll");
        const beforeScroll = scrollWrap.scrollLeft;

        element.dispatchEvent(
            new WheelEvent(EVENT_NAMES.WHEEL, { deltaX: 50, bubbles: true }),
        );

        expect(scrollWrap.scrollLeft).toBe(beforeScroll);
    });

    it("STBE-35: 导航按钮包含 SVG 图标", () => {
        const prevBtn = element.shadowRoot.querySelector(".nav-btn.prev");
        const nextBtn = element.shadowRoot.querySelector(".nav-btn.next");

        expect(prevBtn.querySelector("svg")).not.toBeNull();
        expect(nextBtn.querySelector("svg")).not.toBeNull();
    });

    it("STBE-36: 使用模块级 template 渲染 Shadow DOM", () => {
        const style = element.shadowRoot.querySelector("style");
        const tabs = element.shadowRoot.querySelector(".tabs");
        expect(style).not.toBeNull();
        expect(tabs).not.toBeNull();
    });

    it("STBE-37: 激活标签文字颜色为 Excel 绿色", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const style = element.shadowRoot.querySelector("style");
        const cssText = style.textContent;
        expect(cssText).toContain(".tab.active");
        expect(cssText).toContain("color: #217346");
    });

    it("STBE-38: 标签间有竖线分隔且上下留边距", () => {
        const style = element.shadowRoot.querySelector("style");
        const cssText = style.textContent;
        expect(cssText).toContain(".tab + .tab::before");
        expect(cssText).toContain("top: 5px");
        expect(cssText).toContain("bottom: 5px");
    });

    it("STBE-39: 激活标签与相邻标签间无竖线", () => {
        const style = element.shadowRoot.querySelector("style");
        const cssText = style.textContent;
        expect(cssText).toContain(".tab.active + .tab::before");
        expect(cssText).toContain(".tab + .tab.active::before");
        expect(cssText).toContain("display: none");
    });

    it("STBE-40: hover 未激活标签为淡绿色", () => {
        const style = element.shadowRoot.querySelector("style");
        const cssText = style.textContent;
        expect(cssText).toContain(".tab:hover");
        expect(cssText).toContain("background: #e2f0da");
    });

    it("STBE-41: 上下文菜单每项独占一行", () => {
        const style = element.shadowRoot.querySelector("style");
        const cssText = style.textContent;
        expect(cssText).toContain(".context-menu-item");
        expect(cssText).toContain("white-space: nowrap");
    });

    it("STBE-42: 上下文菜单项点击后菜单关闭", () => {
        const sheets = new Map([
            ["Sheet1", { name: "Sheet1" }],
            ["Sheet2", { name: "Sheet2" }],
        ]);
        element.refresh(sheets, "Sheet1");

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        tab.dispatchEvent(
            new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: 100,
                clientY: 50,
            }),
        );

        const copyItem = element.shadowRoot.querySelector('.context-menu-item[data-action="copy"]');
        copyItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(element.shadowRoot.querySelector(".context-menu")).toBeNull();
    });

    it("STBE-43: disabled 菜单项点击不派发事件", () => {
        const sheets = new Map([["Sheet1", { name: "Sheet1" }]]);
        element.refresh(sheets, "Sheet1");

        const closeSpy = vi.fn();
        element.addEventListener(SHEET_TAB_EVENTS.CLOSE, closeSpy);

        const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
        tab.dispatchEvent(
            new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: 100,
                clientY: 50,
            }),
        );

        const deleteItem = element.shadowRoot.querySelector('.context-menu-item[data-action="delete"]');
        expect(deleteItem.classList.contains("disabled")).toBe(true);
        deleteItem.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(closeSpy).not.toHaveBeenCalled();

        element.removeEventListener(SHEET_TAB_EVENTS.CLOSE, closeSpy);
    });

    describe("readOnly 模式", () => {
        it("STBE-34: readOnly=true 时隐藏新增按钮", () => {
            const sheets = new Map([
                ["Sheet1", { name: "Sheet1" }],
            ]);
            element.refresh(sheets, "Sheet1");

            const addBtn = element.shadowRoot.querySelector(".add-btn.in-scroll");
            expect(addBtn.style.display).not.toBe("none");

            element.readOnly = true;
            expect(addBtn.style.display).toBe("none");
        });

        it("STBE-35: readOnly=false 时显示新增按钮", () => {
            const sheets = new Map([
                ["Sheet1", { name: "Sheet1" }],
            ]);
            element.refresh(sheets, "Sheet1");

            element.readOnly = true;
            const addBtn = element.shadowRoot.querySelector(".add-btn.in-scroll");
            expect(addBtn.style.display).toBe("none");

            element.readOnly = false;
            expect(addBtn.style.display).not.toBe("none");
        });

        it("STBE-36: readOnly=true 时右键不弹出菜单", () => {
            const sheets = new Map([
                ["Sheet1", { name: "Sheet1" }],
                ["Sheet2", { name: "Sheet2" }],
            ]);
            element.refresh(sheets, "Sheet1");
            element.readOnly = true;

            const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
            tab.dispatchEvent(
                new MouseEvent("contextmenu", {
                    bubbles: true,
                    clientX: 100,
                    clientY: 50,
                }),
            );

            const menu = element.shadowRoot.querySelector(".context-menu");
            expect(menu).toBeNull();
        });

        it("STBE-37: readOnly=true 时双击不触发重命名", () => {
            const sheets = new Map([
                ["Sheet1", { name: "Sheet1" }],
                ["Sheet2", { name: "Sheet2" }],
            ]);
            element.refresh(sheets, "Sheet1");
            element.readOnly = true;

            const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet1"]');
            const label = tab.querySelector(".label");
            label.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

            const renameInput = tab.querySelector(".rename-input");
            expect(renameInput).toBeNull();
        });

        it("STBE-38: readOnly=true 时点击标签仍可切换工作表", () => {
            const sheets = new Map([
                ["Sheet1", { name: "Sheet1" }],
                ["Sheet2", { name: "Sheet2" }],
            ]);
            element.refresh(sheets, "Sheet1");
            element.readOnly = true;

            const switchSpy = vi.fn();
            element.addEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);

            const tab = element.shadowRoot.querySelector('.tab[data-name="Sheet2"]');
            tab.dispatchEvent(new MouseEvent("click", { bubbles: true }));

            expect(switchSpy).toHaveBeenCalledTimes(1);
            expect(switchSpy.mock.calls[0][0].detail.name).toBe("Sheet2");

            element.removeEventListener(SHEET_TAB_EVENTS.SWITCH, switchSpy);
        });

        it("STBE-39: readOnly 默认为 false", () => {
            expect(element.readOnly).toBe(false);
        });

        it("STBE-40: readOnly 切换后 add-btn 可见性同步更新", () => {
            const sheets = new Map([
                ["Sheet1", { name: "Sheet1" }],
            ]);
            element.refresh(sheets, "Sheet1");

            const addBtn = element.shadowRoot.querySelector(".add-btn.in-scroll");

            element.readOnly = true;
            expect(addBtn.style.display).toBe("none");

            element.readOnly = false;
            expect(addBtn.style.display).not.toBe("none");

            element.readOnly = true;
            expect(addBtn.style.display).toBe("none");
        });
    });
});