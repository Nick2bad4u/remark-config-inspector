#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import process from "node:process";

const MIME_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
};
const SAFE_REQUEST_PATH =
    /^\/(?:[A-Za-z0-9_~-][A-Za-z0-9._~-]*\/)*(?:[A-Za-z0-9_~-][A-Za-z0-9._~-]*)?$/u;

function parseArgs(argv) {
    const options = {
        dir: "dist/public",
        host: "127.0.0.1",
        port: 4173,
    };

    function getArgValue(index, flag) {
        const value = argv[index + 1];
        if (!value) throw new Error(`Missing value for ${flag}`);
        return value;
    }

    function applyArgValue(flag, value) {
        if (flag === "--host") {
            options.host = value;
            return;
        }

        if (flag === "--dir") {
            options.dir = value;
            return;
        }

        if (flag === "--port") {
            const parsedPort = Number.parseInt(value, 10);
            if (!Number.isFinite(parsedPort) || parsedPort <= 0)
                throw new Error("Invalid value for --port");
            options.port = parsedPort;
        }
    }

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--host" || arg === "--port" || arg === "--dir") {
            const value = getArgValue(index, arg);
            applyArgValue(arg, value);
            index += 1;
        }
    }

    return options;
}

function sanitizeRequestPath(pathname) {
    const withoutQuery = (pathname ?? "/").split("?")[0] ?? "/";
    let decoded;

    try {
        decoded = decodeURIComponent(withoutQuery);
    } catch {
        return undefined;
    }

    const normalizedPath = decoded.replaceAll("\\", "/");
    const absoluteRequestPath = normalizedPath.startsWith("/")
        ? normalizedPath
        : `/${normalizedPath}`;
    if (!SAFE_REQUEST_PATH.test(absoluteRequestPath)) {
        return undefined;
    }

    return absoluteRequestPath;
}

function getContentType(filePath) {
    return (
        MIME_TYPES[extname(filePath).toLowerCase()] ??
        "application/octet-stream"
    );
}

async function readStaticFile(rootPath, requestPath) {
    if (!SAFE_REQUEST_PATH.test(requestPath)) return undefined;

    const requested = requestPath === "/" ? "/index.html" : requestPath;
    const absolutePath = resolve(join(rootPath, requested));
    const rootPrefix = rootPath.endsWith(sep) ? rootPath : `${rootPath}${sep}`;
    let filePath;

    // Reject lexical traversal before resolving filesystem links. The second
    // containment check below then rejects symlinks and junctions that escape.
    if (!absolutePath.startsWith(rootPrefix)) return undefined;

    try {
        const canonicalPath = realpathSync(absolutePath);
        if (!canonicalPath.startsWith(rootPrefix)) return undefined;

        const info = await stat(canonicalPath);
        if (info.isFile()) filePath = canonicalPath;
    } catch {
        // Continue to SPA fallback handling.
    }

    if (!filePath) {
        const looksLikeAsset = extname(requestPath).length > 0;
        if (looksLikeAsset) return undefined;

        try {
            const fallbackPath = realpathSync(
                resolve(join(rootPath, "index.html"))
            );
            if (!fallbackPath.startsWith(rootPrefix)) return undefined;
            filePath = fallbackPath;
        } catch {
            return undefined;
        }
    }

    return { content: await readFile(filePath), filePath };
}

const { dir, host, port } = parseArgs(process.argv.slice(2));
const rootPath = resolve(process.cwd(), dir);

async function main() {
    try {
        const rootInfo = await stat(rootPath);
        if (!rootInfo.isDirectory()) {
            throw new Error(`${rootPath} is not a directory`);
        }
        const canonicalRootPath = realpathSync(rootPath);

        const server = createServer(async (request, response) => {
            const pathname = sanitizeRequestPath(request.url ?? "/");
            let staticFile;

            try {
                staticFile = pathname
                    ? await readStaticFile(canonicalRootPath, pathname)
                    : undefined;
            } catch {
                response.statusCode = 500;
                response.setHeader("Content-Type", "text/plain; charset=utf-8");
                response.end("Failed to read file");
                return;
            }

            if (!staticFile) {
                response.statusCode = 404;
                response.setHeader("Content-Type", "text/plain; charset=utf-8");
                response.end("Not Found");
                return;
            }

            response.statusCode = 200;
            response.setHeader(
                "Content-Type",
                getContentType(staticFile.filePath)
            );
            response.end(staticFile.content);
        });

        server.listen(port, host, () => {
            console.log(`Serving ${rootPath} at http://${host}:${port}`);
        });
    } catch {
        console.error(`Static assets directory does not exist: ${rootPath}`);
        console.error(
            "Run `npm run build` before starting the static test server."
        );
        process.exit(1);
    }
}

await main();
