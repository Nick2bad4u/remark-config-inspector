<script setup lang="ts">
import { version } from "~~/package.json";

withDefaults(
    defineProps<{
        showVersion?: boolean;
    }>(),
    {
        showVersion: true,
    }
);
</script>

<template>
    <div class="flex flex-col gap-1">
        <a
            href="https://github.com/Nick2bad4u/remark-config-inspector"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-3 rounded-md"
        >
            <span
                class="flex flex-none items-center justify-center rounded-md bg-active p-2"
            >
                <img
                    src="/remark/logo-square.png"
                    alt="remarklint logo"
                    class="h-8 w-8"
                />
            </span>

            <span class="flex flex-col gap-0.5">
                <span class="flex items-center gap-2">
                    <span class="text-lg font-semibold"
                        >Remark Config Inspector</span
                    >
                </span>
                <span class="text-sm color-muted">
                    Configuration, rules, and performance
                </span>
            </span>
        </a>
        <a
            v-if="showVersion"
            class="ml-2 inline-block text-0.6em font-200 font-mono op55"
            :href="`https://github.com/Nick2bad4u/remark-config-inspector/releases/tag/v${version}`"
            target="_blank"
            rel="noopener noreferrer"
        >
            v{{ version }}
        </a>
    </div>
</template>
