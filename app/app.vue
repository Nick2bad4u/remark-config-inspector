<script setup lang="ts">
import { useRouter } from "#app/composables/router";
import { useRuntimeConfig } from "#app/nuxt";
import { onBeforeUnmount, ref } from "vue";
import { errorInfo, init, isLoading } from "~/composables/payload";

import "floating-vue/dist/style.css";
import "./styles/global.css";
import "./composables/dark";

const config = useRuntimeConfig();
const router = useRouter();
const isRouteNavigating = ref(false);
let routeSpinnerTimeout: ReturnType<typeof setTimeout> | undefined;

const removeBeforeEach = router.beforeEach(() => {
    if (routeSpinnerTimeout) clearTimeout(routeSpinnerTimeout);

    isRouteNavigating.value = true;
});

const removeAfterEach = router.afterEach(() => {
    routeSpinnerTimeout = setTimeout(() => {
        isRouteNavigating.value = false;
    }, 150);
});

const removeRouteError = router.onError(() => {
    if (routeSpinnerTimeout) clearTimeout(routeSpinnerTimeout);

    isRouteNavigating.value = false;
});

onBeforeUnmount(() => {
    removeBeforeEach();
    removeAfterEach();
    removeRouteError();
});

init(config.app.baseURL);
</script>

<template>
    <NuxtLoadingIndicator
        :height="3"
        :throttle="0"
        color="repeating-linear-gradient(90deg, #d80303 0px, #f97373 32px, #d80303 64px)"
    />

    <div
        v-if="isRouteNavigating && !isLoading && !errorInfo"
        class="pointer-events-none fixed right-3 top-3 z-60 inline-flex items-center gap-2 border border-primary/45 rounded-full bg-zinc-950/86 px-3 py-1.5 text-xs text-zinc-200 shadow-lg backdrop-blur-sm"
    >
        <div i-svg-spinners-90-ring-with-bg text-sm />
        Loading view...
    </div>

    <div
        v-if="errorInfo"
        grid
        h-full
        w-full
        place-content-center
        whitespace-pre-line
        p4
    >
        <ConfigInspectorBadge mb6 text-xl font-200 />

        <div text-2xl text-red5 font-bold>
            Failed to resolve remark config<br />
        </div>

        <div text-lg text-red font-mono>
            {{ errorInfo.error }}
        </div>

        <div mt6 op50>
            Note that
            <a
                href="https://github.com/remarkjs/remark-lint#configuration"
                target="_blank"
                hover:underline
                >remark-lint configuration</a
            >
            must be discoverable for the selected target file.
        </div>
    </div>
    <div
        v-else-if="isLoading"
        flex="~ col"
        h-full
        w-full
        items-center
        justify-center
        p4
    >
        <div flex="~ gap-2 items-center" flex-auto animate-pulse text-xl>
            <div i-svg-spinners-90-ring-with-bg />
            Loading config...
        </div>
        <ConfigInspectorBadge mt6 text-xl font-200 :show-version="false" />
    </div>
    <div v-else px4 py6 lg:px14 lg:py10>
        <NavBar />
        <NuxtPage />
    </div>
</template>
