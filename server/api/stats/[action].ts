import { createError } from "h3";
import { handleStatsAction } from "~~/src/stats/http";
import { getInspectorSession } from "../../utils/inspector";

export default defineEventHandler(async (event) => {
    const action = getRouterParam(event, "action");
    if (action !== "status" && action !== "run" && action !== "cancel")
        throw createError({
            statusCode: 404,
            message: "Unknown stats endpoint.",
        });
    const session = await getInspectorSession();
    const origin = getHeader(event, "origin");
    const host = getHeader(event, "host");
    setHeader(event, "Cache-Control", "no-store");
    return handleStatsAction(session.stats, action, {
        method: event.method,
        protocol: getRequestProtocol(event, { xForwardedProto: false }),
        ...(origin ? { origin } : {}),
        ...(host ? { host } : {}),
    });
});
