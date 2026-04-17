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
            class="inline-flex items-center gap-3 border border-primary/45 rounded-2xl bg-zinc-950/80 px-3 py-2 shadow-sm hover:border-primary/70 hover:bg-zinc-900/90"
        >
            <span
                class="flex items-center justify-center border border-primary/45 rounded-full bg-zinc-900/85 p-2"
            >
                <img
                    src="/remark/remarklint.svg"
                    alt="remarklint logo"
                    class="h-1.15em w-auto"
                />
            </span>

            <span class="flex flex-col gap-0.5">
                <span class="flex items-center gap-2">
                    <img
                        src="/remark/remarklint2.svg"
                        alt="remarklint"
                        class="h-0.95em w-auto"
                    />
                    <span class="text-xs font-medium op70"
                        >Config Inspector</span
                    >
                </span>
                <span class="text-xs font-medium op70">
                    Rule + config explorer
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
