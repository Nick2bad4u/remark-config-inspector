<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
    defineProps<{
        icon: string;
        number: number;
        color: string;
        title: string;
        clickable?: boolean;
    }>(),
    {
        clickable: false,
    }
);

const emit = defineEmits<{
    click: [];
}>();

const rootTag = computed(() => (props.clickable ? "button" : "div"));
const tooltip = computed(() => ({
    content: `${props.number} ${props.title}`,
    placement: "top",
}));
</script>

<template>
    <component
        :is="rootTag"
        class="inline-flex items-center gap-1.5 text-left leading-none"
        :class="[
            props.number ? props.color : 'op25',
            props.clickable ? 'cursor-pointer transition hover:op100' : '',
        ]"
        @click="emit('click')"
    >
        <div
            v-tooltip="tooltip"
            :class="props.icon"
            class="h-4 w-4 flex-none text-center"
        />
        <span
            inline-block
            min-w="1.75ch"
            text-right
            font-mono
            tabular-nums
            :class="props.color"
            >{{ props.number || "" }}</span
        >
    </component>
</template>
