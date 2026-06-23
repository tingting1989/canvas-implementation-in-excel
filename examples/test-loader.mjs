import { URL } from "url";

export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") || specifier.startsWith("/")) {
        const url = new URL(specifier, context.parentURL);
        const pathname = decodeURIComponent(url.pathname);
        if (!pathname.match(/\.[m]?[jt]s$/) && !pathname.endsWith("/")) {
            if (pathname.includes("/src/") || pathname.includes("\\src\\")) {
                return nextResolve(url.pathname + ".js", context);
            }
        }
    }
    return nextResolve(specifier, context);
}