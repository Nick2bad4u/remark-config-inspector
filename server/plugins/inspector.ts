export default defineNitroPlugin((nitro) => {
    if (import.meta.dev) {
        nitro.hooks.hook("close", async () => {
            const { closeInspectorSession } =
                await import("../utils/inspector");
            await closeInspectorSession();
        });
    }
});
