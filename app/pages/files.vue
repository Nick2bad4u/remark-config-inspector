<script setup lang="ts">
import { ref } from "vue";
import { testIds } from "~~/shared/test-ids";
import { payload } from "~/composables/payload";
import { fileGroupsOpenState, stateStorage } from "../composables/state";

const listFilesOpen = ref(true);

function expandAll() {
    fileGroupsOpenState.value = fileGroupsOpenState.value.map(() => true);
}

function collapseAll() {
    fileGroupsOpenState.value = fileGroupsOpenState.value.map(() => false);
}

function setListFilesOpen(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLDetailsElement) listFilesOpen.value = target.open;
}
</script>

<template>
    <div flex="~ col gap-4" my4>
        <div class="inspector-experimental-pill">
            <div i-ph-flask-duotone flex-none />
            <span>Experimental file match preview</span>
        </div>
        <template v-if="payload.filesResolved">
            <div flex="~ gap-2 items-center">
                <div class="inspector-segmented-control">
                    <button
                        type="button"
                        :aria-pressed="stateStorage.viewFilesTab === 'list'"
                        :class="
                            stateStorage.viewFilesTab === 'list'
                                ? 'btn-action-active'
                                : 'op50'
                        "
                        :data-testid="testIds.files.viewListButton"
                        btn-action
                        border-none
                        @click="stateStorage.viewFilesTab = 'list'"
                    >
                        <div i-ph-files-duotone />
                        <span>List</span>
                    </button>
                    <div border="l base" />
                    <button
                        type="button"
                        :aria-pressed="stateStorage.viewFilesTab === 'group'"
                        :class="
                            stateStorage.viewFilesTab === 'group'
                                ? 'btn-action-active'
                                : 'op50'
                        "
                        :data-testid="testIds.files.viewGroupsButton"
                        btn-action
                        border-none
                        @click="stateStorage.viewFilesTab = 'group'"
                    >
                        <div i-ph-rows-duotone />
                        <span>File Groups</span>
                    </button>
                </div>
                <div flex-auto />
                <template v-if="stateStorage.viewFilesTab === 'group'">
                    <button type="button" btn-action px3 @click="expandAll">
                        Expand All
                    </button>
                    <button type="button" btn-action px3 @click="collapseAll">
                        Collapse All
                    </button>
                </template>
            </div>

            <div
                v-if="stateStorage.viewFilesTab === 'group'"
                flex="~ gap-2 col"
            >
                <FileGroupItem
                    v-for="(group, idx) of payload.filesResolved.groups"
                    :key="group.id"
                    v-model:open="fileGroupsOpenState[idx]"
                    :group="group"
                    :index="idx"
                />
            </div>
            <div v-else>
                <details
                    :open="listFilesOpen"
                    :data-testid="testIds.files.matchedListDetails"
                    class="inspector-panel p3"
                    @toggle="setListFilesOpen"
                >
                    <summary
                        :data-testid="testIds.files.matchedListSummary"
                        flex="~ gap-2 items-center wrap"
                        cursor-pointer
                        select-none
                    >
                        <div
                            class="[details[open]_&]:rotate-90"
                            i-ph-caret-right
                            op50
                            transition
                        />
                        <div i-ph-files-duotone flex-none text-sky5 />
                        <div>
                            Matched Local Files ({{
                                payload.filesResolved.list.length
                            }})
                        </div>
                    </summary>
                    <div flex="~ col gap-1" py4 font-mono>
                        <FileItem
                            v-for="file of payload.filesResolved.list"
                            :key="file"
                            :filepath="file"
                        />
                    </div>
                </details>
            </div>
        </template>
        <div v-else class="inspector-empty-state" text-sm>
            File matching data is unavailable in the current payload. In CLI
            mode, enable file matching with <code font-mono>--files</code> to
            populate this tab.
        </div>
    </div>
</template>
