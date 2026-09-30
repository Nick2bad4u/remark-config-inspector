<script setup lang="ts">
defineProps<{
    title: string;
    description: string;
}>();
</script>

<template>
    <header class="inspector-page-header">
        <div min-w-0>
            <h1>{{ title }}</h1>
            <p>{{ description }}</p>
        </div>
        <slot />
    </header>
</template>
