import { useColorMode } from "@vueuse/core";
import { computed, watch } from "vue";
import { stateStorage } from "./state";

const colorMode = useColorMode();

export const isDark = computed({
    get: () => colorMode.value === "dark",
    set: (value: boolean) => {
        colorMode.value = value ? "dark" : "light";
    },
});

/** Synchronize the viewer preference with the existing VueUse theme storage. */
export function initializeTheme(): void {
    if (stateStorage.theme !== "auto") {
        colorMode.store.value = stateStorage.theme;
    } else {
        stateStorage.theme = colorMode.store.value;
    }

    watch(colorMode.store, (value) => {
        stateStorage.theme = value;
    });
    watch(
        () => stateStorage.theme,
        (value) => {
            colorMode.store.value = value;
        }
    );
}

export function toggleDark() {
    isDark.value = !isDark.value;
}
