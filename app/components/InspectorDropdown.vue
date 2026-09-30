<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";
import { Dropdown } from "floating-vue";
import { nextTick, ref } from "vue";

defineOptions({ inheritAttrs: false });

const dropdown = ref<ComponentPublicInstance | null>(null);
const popupContent = ref<HTMLElement | null>(null);
let opener: HTMLElement | null = null;
let openGeneration = 0;
let isOpen = false;

function rememberOpener(): void {
    openGeneration++;
    isOpen = true;
    const root: unknown = dropdown.value?.$el;
    const active = document.activeElement;
    opener =
        root instanceof HTMLElement &&
        active instanceof HTMLElement &&
        root.contains(active)
            ? active
            : null;
}

function markClosed(): void {
    isOpen = false;
    openGeneration++;
}

async function focusPopup(): Promise<void> {
    const generation = openGeneration;
    await nextTick();
    if (
        isOpen &&
        generation === openGeneration &&
        (document.activeElement === opener ||
            document.activeElement === document.body)
    ) {
        popupContent.value?.focus({ preventScroll: true });
    }
}

async function closeWithFocus(hide: () => void): Promise<void> {
    hide();
    await nextTick();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
}
</script>

<template>
    <!-- Own focus timing so a pending show animation cannot steal restored focus. -->
    <Dropdown
        ref="dropdown"
        v-bind="$attrs"
        no-auto-focus
        @show="rememberOpener"
        @apply-show="focusPopup"
        @hide="markClosed"
    >
        <template #default="slotProps">
            <slot v-bind="slotProps" />
        </template>
        <template #popper="slotProps">
            <div
                ref="popupContent"
                tabindex="-1"
                @keyup.esc.stop="closeWithFocus(slotProps.hide)"
            >
                <slot name="popper" v-bind="slotProps" />
            </div>
        </template>
    </Dropdown>
</template>
