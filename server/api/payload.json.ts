import { getInspectorSession } from "../utils/inspector";

export default lazyEventHandler(async () => {
    const ws = await getInspectorSession();

    return defineEventHandler(() => {
        return ws.getData();
    });
});
