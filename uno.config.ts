import {
    defineConfig,
    presetAttributify,
    presetIcons,
    presetTypography,
    presetWind3,
    transformerDirectives,
    transformerVariantGroup,
} from "unocss";

export default defineConfig({
    shortcuts: {
        "color-base": "text-[var(--inspector-text)]",
        "color-muted": "text-[var(--inspector-muted)]",
        "bg-base": "bg-[var(--inspector-background)]",
        "border-base": "border-[var(--inspector-border)]",

        "bg-tooltip": "bg-[var(--inspector-surface-strong)]",
        "bg-glass": "bg-[var(--inspector-surface)]",
        "bg-code": "bg-[var(--inspector-surface-hover)]",
        "bg-hover": "bg-[var(--inspector-surface-hover)]",

        "color-active": "text-[var(--inspector-accent)]",
        "border-active": "border-[var(--inspector-accent)]",
        "bg-active": "bg-[var(--inspector-accent-soft)]",

        "btn-action":
            "border border-base rounded-md inline-flex gap-2 items-center justify-center px3 py1.5 font-medium text-sm hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50",
        "btn-action-sm": "btn-action text-sm",
        "btn-action-active": "color-active border-active! bg-active op100!",

        badge: "border border-base rounded-md inline-flex items-center max-w-full break-words px2",
        "badge-active":
            "badge text-[var(--inspector-warning)] bg-[var(--inspector-warning-soft)]",
        "btn-badge": "badge hover:bg-active",
    },
    theme: {
        fontFamily: {
            mono: '"Space Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            sans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
        colors: {
            neutral: {
                25: "#FCFCFD",
                50: "#F9FAFB",
                100: "#F2F4F7",
                200: "#E4E7EC",
                300: "#D0D5DD",
                400: "#98A2B3",
                500: "#667085",
                600: "#475467",
                700: "#344054",
                800: "#1D2939",
                900: "#101828",
            },

            primary: {
                DEFAULT: "#D80303",
                25: "#FFEBEB",
                50: "#FFD9D9",
                100: "#FFC2C2",
                200: "#FF9A9A",
                300: "#FF7373",
                400: "#F24C4C",
                500: "#E12626",
                600: "#D80303",
                700: "#B30000",
                800: "#8F0000",
                900: "#690000",
            },

            warning: {
                25: "#FFFCF5",
                50: "#FFFAEB",
                100: "#FEF0C7",
                200: "#FEDF89",
                300: "#FEC84B",
                400: "#FDB022",
                500: "#F79009",
                600: "#DC6803",
                700: "#B54708",
                800: "#93370D",
                900: "#7A2E0E",
            },

            success: {
                25: "#F6FEF9",
                50: "#ECFDF3",
                100: "#D1FADF",
                200: "#A6F4C5",
                300: "#6CE9A6",
                400: "#32D583",
                500: "#12B76A",
                600: "#039855",
                700: "#027A48",
                800: "#05603A",
                900: "#054F31",
            },

            rose: {
                25: "#FFF5F6",
                50: "#FFF1F3",
                100: "#FFE4E8",
                200: "#FECDD6",
                300: "#FEA3B4",
                400: "#FD6F8E",
                500: "#F63D68",
                600: "#E31B54",
                700: "#C01048",
                800: "#A11043",
                900: "#89123E",
            },
        },
    },
    presets: [
        presetWind3(),
        presetAttributify(),
        presetIcons({
            scale: 1.2,
        }),
        presetTypography(),
    ],
    transformers: [transformerDirectives(), transformerVariantGroup()],
});
