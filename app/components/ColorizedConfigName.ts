import { computed, defineComponent, h } from "vue";
import { getPluginColor } from "../composables/color";

const CONFIG_NAME_SPLIT_RE = /([:/])/g;

export default defineComponent({
    props: {
        name: {
            type: String,
        },
        index: {
            type: Number,
        },
    },
    setup(props) {
        const parts = computed(() =>
            props.name?.split(CONFIG_NAME_SPLIT_RE).filter(Boolean)
        );

        function getPartStyle(part: string, index: number) {
            if (part === ":" || part === "/")
                return { style: { opacity: 0.35, margin: "0 1px" } };

            const isLastPart = index === (parts.value?.length ?? 0) - 1;
            if (isLastPart) return null;

            return { style: { color: getPluginColor(part) } };
        }

        function renderAnonymousIndexTag() {
            if (typeof props.index !== "number") return null;

            return h("span", { class: "op50 text-sm" }, ` #${props.index + 1}`);
        }

        return () => {
            if (parts.value) {
                return h(
                    "span",
                    parts.value.map((part, i) =>
                        h("span", getPartStyle(part, i), part)
                    )
                );
            } else {
                return h("span", [
                    h("span", { class: "op50 italic" }, "anonymous"),
                    renderAnonymousIndexTag(),
                ]);
            }
        };
    },
});

// @unocss-include
