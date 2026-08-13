interface Window {
    __CANVAS_SHEET_CONFIG__?: {
        debug?: boolean;
        locale?: string;
        theme?: string;
    };
}

declare module "*.css" {
    const content: string;
    export default content;
}

declare module "*.svg" {
    const content: string;
    export default content;
}
