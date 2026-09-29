import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import process from "node:process";
import c from "ansis";

import { cac } from "cac";
import { getPort } from "get-port-please";
import open from "open";
import { relative, resolve } from "pathe";
import { glob } from "tinyglobby";
import { rewriteStaticHtmlWithBase } from "./build-static-html";
import { normalizeCliInspectorOptions } from "./cli-options";
import { readConfig } from "./configs";
import { MARK_CHECK, MARK_ERROR, MARK_INFO } from "./constants";
import { distDir } from "./dirs";
import { ConfigInspectorError } from "./errors";
import { createHostServer } from "./server";
import { runStats } from "./stats/runner";

const RE_CONSECUTIVE_SLASHES = /\/+/g;

const cli = cac("remark-config-inspector");

cli.command(
    "build",
    "Build inspector with current config file for static hosting"
)
    .option("--config <configFile>", "Config file path")
    .option("--files", "Include matched file paths in payload", {
        default: true,
    })
    .option("--file <filePath>", "Alias of --target")
    .option(
        "--target <filePath>",
        "Target file path used to resolve effective config"
    )
    .option(
        "--basePath <basePath>",
        "Base directory for globs to resolve. Default to directory of config file if not provided"
    )
    // Build specific options
    .option("--stats", "Include a full-pipeline performance snapshot", {
        default: false,
    })
    .option("--base <baseURL>", "Base URL for deployment", { default: "/" })
    .option("--outDir <dir>", "Output directory", {
        default: ".remark-config-inspector",
    })
    // Action
    .action(async (rawOptions) => {
        const options = normalizeCliInspectorOptions(rawOptions);

        console.log(MARK_INFO, "Building static remark config inspector...");

        const cwd = process.cwd();
        const outDir = resolve(cwd, options.outDir);

        let configs;
        try {
            configs = await readConfig({
                cwd,
                userConfigPath: options.config,
                userBasePath: options.basePath,
                globMatchedFiles: options.files,
                targetFilePath: options.target,
            });
        } catch (error) {
            if (error instanceof ConfigInspectorError) {
                error.prettyPrint();
                process.exit(1);
            }
            throw error;
        }

        if (options.stats) {
            console.log(MARK_INFO, "Profiling the remark pipeline...");
            const report = await runStats({
                cwd,
                userConfigPath: options.config,
                userBasePath: options.basePath,
                targetFilePath: options.target,
            });
            if (report.partial) {
                const failures = report.files.filter((file) => file.failed);
                const details = failures.slice(0, 5).map((file) => {
                    const reasons = file.messages
                        .filter((message) => message.fatal)
                        .map((message) => message.reason)
                        .join("; ");
                    return `${file.filePath}: ${reasons || "Processing failed"}`;
                });
                if (failures.length > 5)
                    details.push(
                        `And ${failures.length - 5} more failed files.`
                    );
                throw new Error(
                    `Stats analysis was incomplete. Resolve these file processing failures before building a stats snapshot:\n${details.join("\n")}`
                );
            }
            configs.payload.stats = report;
        }

        let baseURL = options.base;
        if (!baseURL.endsWith("/")) baseURL += "/";
        if (!baseURL.startsWith("/")) baseURL = `/${baseURL}`;
        baseURL = baseURL.replaceAll(RE_CONSECUTIVE_SLASHES, "/");

        if (existsSync(outDir)) await fs.rm(outDir, { recursive: true });
        await fs.mkdir(outDir, { recursive: true });
        await fs.cp(distDir, outDir, { recursive: true });
        const htmlFiles = await glob("**/*.html", {
            cwd: distDir,
            onlyFiles: true,
            expandDirectories: false,
        });
        // Rewrite HTML files with base URL
        if (baseURL !== "/") {
            for (const file of htmlFiles) {
                if (!file) continue;
                const content = await fs.readFile(
                    resolve(distDir, file),
                    "utf-8"
                );
                const newContent = rewriteStaticHtmlWithBase(content, baseURL);
                await fs.writeFile(resolve(outDir, file), newContent, "utf-8");
            }
        }
        await fs.mkdir(resolve(outDir, "api"), { recursive: true });

        configs.payload.meta.configPath = "";
        configs.payload.meta.basePath = "";
        await fs.writeFile(
            resolve(outDir, "api/payload.json"),
            JSON.stringify(configs.payload, null, 2),
            "utf-8"
        );

        console.log(MARK_CHECK, `Built to ${relative(cwd, outDir)}`);
        console.log(
            MARK_INFO,
            `You can use static server like \`npx serve ${relative(cwd, outDir)}\` to serve the inspector`
        );
    });

cli.command("", "Start dev inspector")
    .option("--config <configFile>", "Config file path")
    .option("--files", "Include matched file paths in payload", {
        default: true,
    })
    .option("--file <filePath>", "Alias of --target")
    .option(
        "--target <filePath>",
        "Target file path used to resolve effective config"
    )
    .option(
        "--basePath <basePath>",
        "Base directory for globs to resolve. Default to directory of config file if not provided"
    )
    // Dev specific options
    .option("--host <host>", "Host", {
        default: process.env["HOST"] || "127.0.0.1",
    })
    .option("--port <port>", "Port", { default: process.env["PORT"] || 9999 })
    .option("--open", "Open browser", { default: true })
    // Action
    .action(async (rawOptions) => {
        const options = normalizeCliInspectorOptions(rawOptions);

        const host = options.host;
        const port = await getPort({
            port: options.port,
            portRange: [9999, 12000],
            host,
        });

        console.log(
            MARK_INFO,
            `Starting remark config inspector at`,
            c.green`http://${host === "127.0.0.1" ? "localhost" : host}:${port}`,
            "\n"
        );

        const cwd = process.cwd();
        const server = await createHostServer({
            cwd,
            userConfigPath: options.config,
            userBasePath: options.basePath,
            globMatchedFiles: options.files,
            targetFilePath: options.target,
        });

        server.listen(port, host, async () => {
            if (options.open) {
                await open(
                    `http://${host === "127.0.0.1" ? "localhost" : host}:${port}`
                );
            }
        });
    });

cli.help();

async function main(): Promise<void> {
    // CAC's parse() does not await async command actions. Run the matched
    // action explicitly so worker and static-build failures reach this handler.
    cli.parse(process.argv, { run: false });
    if (cli.matchedCommand?.name === "" && cli.options["stats"] !== undefined) {
        throw new ConfigInspectorError(
            "--stats is a build option. Use `remark-config-inspector build --stats` for a saved report, or start the live inspector without --stats and choose Stats > Run analysis."
        );
    }
    await cli.runMatchedCommand();
}

void main().catch((error: unknown) => {
    if (error instanceof ConfigInspectorError) error.prettyPrint();
    else
        console.error(
            MARK_ERROR,
            error instanceof Error ? error.message : String(error)
        );
    process.exitCode = 1;
});
