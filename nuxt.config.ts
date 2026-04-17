interface NuxtLike {
    options: {
        experimental: Record<string, unknown>;
    };
}

function forcePayloadExtraction(_options: unknown, nuxt: NuxtLike) {
    nuxt.options.experimental.payloadExtraction = true;
}

export default defineNuxtConfig({
    ssr: false,

    modules: [
        forcePayloadExtraction,
        "@vueuse/nuxt",
        "@unocss/nuxt",
        "@nuxt/eslint",
        "nuxt-eslint-auto-explicit-import",
    ],

    eslint: {
        config: {
            standalone: false,
            stylistic: false,
        },
    },

    experimental: {
        typedPages: true,
        clientNodeCompat: true,
        componentIslands: false,
    },

    features: {
        inlineStyles: false,
    },

    css: ["@unocss/reset/tailwind.css"],

    nitro: {
        preset: "static",
        storage: {
            "internal:nuxt:prerender": {
                driver: "fs",
                base: "./.nuxt/cache/nitro/prerender",
            },
        },
        output: {
            dir: "./dist",
        },
        routeRules: {
            "/": {
                prerender: true,
            },
            "/200.html": {
                prerender: true,
            },
            "/404.html": {
                prerender: true,
            },
            "/*": {
                prerender: false,
            },
        },
        sourceMap: false,
    },

    app: {
        baseURL: "./",
        head: {
            viewport: "width=device-width,initial-scale=1",
            meta: [
                { name: "theme-color", content: "#D80303" },
                {
                    name: "apple-mobile-web-app-title",
                    content: "Remark Inspector",
                },
            ],
            link: [
                {
                    rel: "icon",
                    type: "image/svg+xml",
                    href: "/remark/remarklint.svg",
                },
                {
                    rel: "alternate icon",
                    type: "image/svg+xml",
                    href: "/remark/remarklint2.svg",
                },
                {
                    rel: "alternate icon",
                    type: "image/png",
                    href: "/favicon.svg",
                },
                {
                    rel: "apple-touch-icon",
                    href: "/favicon.svg",
                },
            ],
            title: "Remark Config Inspector",
        },
    },

    vite: {
        base: "./",
    },

    devtools: {
        enabled: false,
    },

    compatibilityDate: "2024-07-17",
});
