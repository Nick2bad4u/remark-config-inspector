<script setup lang="ts">
import type { RuleLevel } from "~~/shared/types";
import { computed } from "vue";
import { nth } from "~/composables/strings";

const props = defineProps<{
    level: RuleLevel;
    hasOptions?: boolean;
    hasRedundantOptions?: boolean;
    configIndex?: number;
    showConfigIndex?: boolean;
    class?: string;
}>();

const shouldShowConfigIndex = computed(
    () => props.showConfigIndex && props.configIndex != null
);

const title = computed(() => {
    if (props.configIndex == null) return `Set to '${props.level}'`;
    return `Set to '${props.level}' in the ${nth(props.configIndex + 1)} config item`;
});

const color = computed(
    () =>
        ({
            error: "text-[var(--inspector-error)]",
            warn: "text-[var(--inspector-warning)]",
            off: "color-muted",
        })[props.level]
);

const icon = computed(
    () =>
        ({
            error: "i-ph-warning-circle-duotone",
            warn: "i-ph-warning-duotone",
            off: "i-ph-circle-half-tilt-duotone",
        })[props.level]
);
</script>

<template>
    <span
        relative
        inline-flex
        items-center
        justify-center
        gap-1
        leading-none
        :class="[
            color,
            shouldShowConfigIndex
                ? 'min-w-11 border border-current/28 rounded-md bg-glass px-1.5 py-0.75 text-xs'
                : '',
            props.class,
        ]"
        data-testid="rule-level-icon"
        :title="title"
        :aria-label="title"
    >
        <div
            :class="icon"
            flex-none
            :text="shouldShowConfigIndex ? 'sm' : undefined"
        />
        <span
            v-if="shouldShowConfigIndex"
            class="flex-none leading-none font-mono tabular-nums"
        >
            #{{ configIndex! + 1 }}
        </span>
        <div
            v-if="hasOptions"
            absolute
            right--2px
            top--2px
            h-6px
            w-6px
            rounded-full
            bg-current
            op75
            :class="hasRedundantOptions ? 'text-blue5' : ''"
        />
    </span>
</template>
