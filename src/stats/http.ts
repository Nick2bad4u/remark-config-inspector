import type { StatsJob } from "../../shared/stats";
import type { StatsService } from "./service";
import { createError } from "h3";

export type StatsAction =
    | "status"
    | "run"
    | "cancel";

/** Shared method/origin checks for both HTTP hosts. */
export function handleStatsAction(
    service: StatsService,
    action: StatsAction,
    request: {
        method: string;
        origin?: string;
        host?: string;
        protocol?: string;
    }
): StatsJob {
    const expected = action === "status" ? "GET" : "POST";
    if (request.method !== expected)
        throw createError({
            statusCode: 405,
            message: `Use ${expected} for this endpoint.`,
        });
    if (action !== "status" && request.origin) {
        let origin: string;
        let expectedOrigin: string;
        try {
            origin = new URL(request.origin).origin;
            expectedOrigin = new URL(
                `${request.protocol ?? "http"}://${request.host}`
            ).origin;
        } catch {
            throw createError({
                statusCode: 403,
                message: "Invalid request origin.",
            });
        }
        if (origin !== expectedOrigin)
            throw createError({
                statusCode: 403,
                message: "Stats requests must come from this inspector.",
            });
    }
    switch (action) {
        case "status":
            return service.getStatus();
        case "run":
            return service.run();
        case "cancel":
            return service.cancel();
    }
}
