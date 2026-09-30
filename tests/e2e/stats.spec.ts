import type { Page } from "@playwright/test";
import type { StatsJob } from "../../shared/stats";
import { expect, test } from "@playwright/test";
import { MOCK_PAYLOAD, mockPayload } from "./fixtures/mock-payload";
import { STATS_REPORT } from "./fixtures/stats";

const idle: StatsJob = {
    status: "idle",
    progress: { completedFiles: 0, discoveredFiles: 0 },
};

async function mockStats(page: Page, initial: StatsJob = idle) {
    const livePayload = {
        ...MOCK_PAYLOAD,
        meta: { ...MOCK_PAYLOAD.meta, statsAvailable: true },
    };
    await mockPayload(page, livePayload);
    let job = initial;
    const actions: string[] = [];
    await page.route("**/api/stats/*", async (route) => {
        const action = new URL(route.request().url()).pathname
            .split("/")
            .at(-1)!;
        actions.push(action);
        if (action === "run") {
            expect(route.request().method()).toBe("POST");
            job = {
                status: "running",
                progress: {
                    completedFiles: 1,
                    discoveredFiles: 2,
                    currentFile: "readme.md",
                },
            };
        }
        if (action === "cancel") {
            expect(route.request().method()).toBe("POST");
            job = { ...idle, status: "cancelled" };
        }
        await route.fulfill({ json: job });
    });
    return {
        actions,
        setJob: (value: StatsJob) => {
            job = value;
        },
    };
}

test("runs, polls, ranks, searches, sorts and expands measurements", async ({
    page,
}) => {
    const api = await mockStats(page);
    await page.goto("/stats");
    await page
        .getByRole("button", { name: "Run analysis", exact: true })
        .click();
    await expect(
        page.getByRole("status", { name: "Analysis status" })
    ).toContainText("1 / 2 completed");
    api.setJob({
        status: "complete",
        progress: { completedFiles: 2, discoveredFiles: 2 },
        report: STATS_REPORT,
    });
    await expect(
        page.getByRole("button", { name: "Re-run analysis" })
    ).toBeVisible();
    const bodyRows = page.getByRole("table").locator("tbody tr");
    await expect(bodyRows.first()).toContainText("links");
    await expect(bodyRows.first()).toContainText("38 ms");
    await page.getByLabel("Sort", { exact: true }).selectOption("duration-asc");
    await expect(bodyRows.first()).toContainText("headings");
    await page.getByLabel("Search", { exact: true }).fill("readme");
    await expect(bodyRows).toHaveCount(1);
    await bodyRows.first().locator("summary").click();
    await expect(
        bodyRows.first().getByText("readme.md", { exact: true })
    ).toBeVisible();
    await page.getByLabel("Search", { exact: true }).fill("no-such-file");
    await expect(bodyRows).toContainText("No measurements match your search.");
    await page.getByLabel("Search", { exact: true }).clear();
    await page
        .getByRole("button", { name: "Slow Plugins", exact: true })
        .click();
    await expect(bodyRows).toHaveCount(2);
    await page.getByRole("button", { name: "Slow Files", exact: true }).click();
    await expect(bodyRows).toHaveCount(2);
    await page.getByRole("button", { name: "Slow Tasks", exact: true }).click();
    await expect(bodyRows).toHaveCount(3);
    expect(api.actions).toContain("run");
});

test("reconnects an active analysis after navigation and cancels it", async ({
    page,
}) => {
    const api = await mockStats(page);
    await page.goto("/stats");
    await page
        .getByRole("button", { name: "Run analysis", exact: true })
        .click();
    await expect(
        page.getByRole("status", { name: "Analysis status" })
    ).toContainText("Analyzing");
    await page.getByTestId("nav-link-files").click();
    await page.getByTestId("nav-link-stats").click();
    await expect(
        page.getByRole("status", { name: "Analysis status" })
    ).toContainText("Analyzing");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
        page.getByRole("status", { name: "Analysis status" })
    ).toContainText("Analysis cancelled");
    expect(api.actions).toContain("cancel");
});

test("recovers a connection failure with an explicit retry", async ({
    page,
}) => {
    await mockStats(page);
    await page.route("**/api/stats/status", async (route) =>
        route.fulfill({ status: 503, json: { error: "Unavailable" } })
    );
    await page.goto("/stats");
    await expect(page.getByRole("alert")).toContainText("Could not reach");
    await page.unroute("**/api/stats/status");
    await page.getByRole("button", { name: "Retry connection" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
});

test("shows actionable analysis failures and permits another run", async ({
    page,
}) => {
    await mockStats(page, {
        ...idle,
        status: "failed",
        error: "Cannot load plugin example",
    });
    await page.goto("/stats");
    await expect(page.getByRole("alert")).toContainText(
        "Cannot load plugin example"
    );
    await page
        .getByRole("button", { name: "Run analysis", exact: true })
        .click();
    await expect(
        page.getByRole("status", { name: "Analysis status" })
    ).toContainText("Analyzing");
});

test("renders partial and empty reports", async ({ page }) => {
    const partialReport = structuredClone(STATS_REPORT);
    partialReport.partial = true;
    const failedFile = partialReport.files[0]!;
    failedFile.filePath = "docs/broken.md";
    failedFile.failed = true;
    failedFile.warnings = 0;
    partialReport.warningCount = 1;
    failedFile.messages = [
        {
            fatal: true,
            reason: "Could not read referenced document",
            source: "remark-lint",
            ruleId: "links",
            line: 4,
            column: 2,
        },
    ];
    await mockStats(page, {
        ...idle,
        status: "partial",
        report: partialReport,
    });
    await page.goto("/stats");
    await expect(page.getByRole("alert")).toContainText("Partial results");
    await expect(page.getByRole("alert")).toContainText("docs/broken.md");
    await expect(page.getByRole("alert")).toContainText(
        "Could not read referenced document"
    );
    await page.getByRole("button", { name: "Slow Files", exact: true }).click();
    const failedRow = page
        .getByRole("row")
        .filter({ hasText: "docs/broken.md" });
    await expect(failedRow.locator("summary")).toContainText("Failed");
    await failedRow.locator("summary").click();
    await expect(
        failedRow.getByRole("list", { name: "File diagnostics" })
    ).toContainText(
        "Error · line 4:2 · remark-lint:links · Could not read referenced document"
    );
    await page.unroute("**/api/stats/*");
    await mockStats(page, {
        ...idle,
        status: "complete",
        report: { ...STATS_REPORT, files: [], durationMs: 0 },
    });
    await page.reload();
    await expect(
        page.getByRole("status", { name: "Analysis status" })
    ).toContainText("No Markdown files were found");
});

test("browses a saved snapshot without contacting stats endpoints", async ({
    page,
}) => {
    const savedPayload = { ...MOCK_PAYLOAD, stats: STATS_REPORT };
    await mockPayload(page, savedPayload);
    const requests: string[] = [];
    page.on("request", (request) => {
        if (request.url().includes("/api/stats/")) requests.push(request.url());
    });
    await page.goto("/stats");
    await expect(
        page.getByText("Saved snapshot", { exact: true })
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(
        page.getByRole("button", { name: /Run analysis|Re-run analysis/ })
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Slow Files", exact: true }).click();
    expect(requests).toEqual([]);
});

test("explains how to generate stats for an older static payload", async ({
    page,
}) => {
    await mockPayload(page);
    await page.goto("/stats");
    await expect(
        page.getByRole("heading", { name: "No stats in this snapshot" })
    ).toBeVisible();
    await expect(
        page.getByText("remark-config-inspector build --stats", { exact: true })
    ).toBeVisible();
});

test("operates every ranking and its details with the keyboard", async ({
    page,
}) => {
    await mockPayload(page, { ...MOCK_PAYLOAD, stats: STATS_REPORT });
    await page.goto("/stats");
    const rankings = [
        {
            name: "Slow Rules",
            label: "links",
            detail: "docs/slow.md",
            time: "38 ms",
        },
        {
            name: "Slow Plugins",
            label: "remark-lint-links",
            detail: "docs/slow.md",
            time: "38 ms",
        },
        {
            name: "Slow Files",
            label: "docs/slow.md",
            detail: "Initialization",
            time: "80 ms",
        },
        {
            name: "Slow Tasks",
            label: "docs/slow.md · remark-lint-links",
            detail: "remark-lint-links",
            time: "30 ms",
        },
    ];
    for (const ranking of rankings) {
        const button = page.getByRole("button", {
            name: ranking.name,
            exact: true,
        });
        await button.focus();
        await page.keyboard.press("Enter");
        await expect(button).toHaveAttribute("aria-pressed", "true");
        await expect(
            page
                .getByRole("group", { name: "Ranking view" })
                .locator('[aria-pressed="true"]')
        ).toHaveCount(1);
        const table = page.getByRole("table", {
            name: ranking.name,
            exact: true,
        });
        const row = table.locator("tbody tr").first();
        const summary = row.locator("summary");
        await expect(summary).toHaveText(ranking.label);
        await expect(row.locator("td").nth(1)).toContainText(ranking.time);
        await summary.focus();
        await page.keyboard.press("Enter");
        await expect(row.locator("details")).toHaveAttribute("open", "");
        await expect(
            row.getByText(ranking.detail, { exact: true })
        ).toBeVisible();
        await page.keyboard.press("Space");
        await expect(row.locator("details")).not.toHaveAttribute("open", "");
    }
    const sort = page.getByLabel("Sort", { exact: true });
    await sort.focus();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(sort).toHaveValue("name");
    await expect(
        page.getByRole("table").locator("tbody summary").first()
    ).toHaveText("docs/slow.md · remark-lint-headings");
});

test("keeps long stats paths and numeric measurements usable on mobile", async ({
    page,
}) => {
    const report = structuredClone(STATS_REPORT);
    const longPath = `docs/${"deeply-nested-project-folder/".repeat(8)}long-file-name.md`;
    report.files[0]!.filePath = longPath;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() =>
        localStorage.setItem(
            "stateStorage",
            JSON.stringify({ fontScale: "lg" })
        )
    );
    await mockPayload(page, { ...MOCK_PAYLOAD, stats: report });
    await page.goto("/stats");
    for (const name of [
        "Slow Files",
        "Slow Plugins",
        "Slow Tasks",
    ]) {
        await page.getByRole("button", { name, exact: true }).click();
        const row = page.getByRole("table").locator("tbody tr").first();
        await row.locator("summary").click();
        await expect(row).toContainText(longPath);
        const geometry = await row.evaluate((element) => {
            const cells = [...element.querySelectorAll<HTMLElement>("td")];
            const scroller = element.closest<HTMLElement>(
                ".stats-table-scroll"
            )!;
            return {
                documentWidth: document.documentElement.scrollWidth,
                viewportWidth: window.innerWidth,
                scrollable: getComputedStyle(scroller).overflowX,
                rightEdge: scroller.getBoundingClientRect().right,
                clippedCells: cells.filter(
                    (cell) => cell.scrollWidth > cell.clientWidth + 1
                ).length,
            };
        });
        expect(geometry.documentWidth).toBeLessThanOrEqual(
            geometry.viewportWidth
        );
        expect(geometry.rightEdge).toBeLessThanOrEqual(geometry.viewportWidth);
        expect(geometry.scrollable).toMatch(/auto|scroll/);
        expect(geometry.clippedCells).toBe(0);
    }
});
