#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
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
    const decoded = decodeURIComponent(pathname ?? "/");
    const withoutQuery = decoded.split("?")[0] ?? "/";
    const normalizedPath = withoutQuery.replaceAll("\\", "/");
    return normalizedPath.startsWith("/")
        ? normalizedPath
        : `/${normalizedPath}`;
}

function isInsideRoot(rootPath, filePath) {
    const normalizedRoot = normalize(rootPath);
    const normalizedFilePath = normalize(filePath);
    return (
        normalizedFilePath === normalizedRoot ||
        normalizedFilePath.startsWith(`${normalizedRoot}\\`) ||
        normalizedFilePath.startsWith(`${normalizedRoot}/`)
    );
}

function getContentType(filePath) {
    return (
        MIME_TYPES[extname(filePath).toLowerCase()] ??
        "application/octet-stream"
    );
}

async function resolveFilePath(rootPath, requestPath) {
    const requested = requestPath === "/" ? "/index.html" : requestPath;
    const absolutePath = resolve(join(rootPath, requested));

    if (!isInsideRoot(rootPath, absolutePath)) return undefined;

    try {
        const info = await stat(absolutePath);
        if (info.isFile()) return absolutePath;
    } catch {
        // Continue to SPA fallback handling.
    }

    const looksLikeAsset = extname(requestPath).length > 0;
    if (looksLikeAsset) return undefined;

    const fallbackPath = resolve(join(rootPath, "index.html"));
    if (!isInsideRoot(rootPath, fallbackPath)) return undefined;
    return fallbackPath;
}

const { dir, host, port } = parseArgs(process.argv.slice(2));
const rootPath = resolve(process.cwd(), dir);

void stat(rootPath)
    .then((rootInfo) => {
        if (!rootInfo.isDirectory()) {
            throw new Error(`${rootPath} is not a directory`);
        }

        const server = createServer(async (request, response) => {
            const pathname = sanitizeRequestPath(request.url ?? "/");
            const filePath = await resolveFilePath(rootPath, pathname);

            if (!filePath) {
                response.statusCode = 404;
                response.setHeader("Content-Type", "text/plain; charset=utf-8");
                response.end("Not Found");
                return;
            }

            try {
                const content = await readFile(filePath);
                response.statusCode = 200;
                response.setHeader("Content-Type", getContentType(filePath));
                response.end(content);
            } catch {
                response.statusCode = 500;
                response.setHeader("Content-Type", "text/plain; charset=utf-8");
                response.end("Failed to read file");
            }
        });

        server.listen(port, host, () => {
            console.log(`Serving ${rootPath} at http://${host}:${port}`);
        });
    })
    .catch(() => {
        console.error(`Static assets directory does not exist: ${rootPath}`);
        console.error(
            "Run `npm run build` before starting the static test server."
        );
        process.exit(1);
    });
