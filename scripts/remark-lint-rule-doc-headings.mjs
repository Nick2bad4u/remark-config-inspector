/**
 * Temporary compatibility plugin for copied remark configs that reference
 * `./scripts/remark-lint-rule-doc-headings.mjs`.
 *
 * The original project-specific rule implementation is not part of this repo.
 * This no-op plugin keeps config loading functional for the inspector.
 */

/**
 * @param {unknown} _options
 * @returns {(tree: unknown) => void}
 */
export default function remarkLintRuleDocHeadings(_options = undefined) {
    return function noopRuleDocHeadings(_tree) {
        // Intentionally no-op for config inspection.
    };
}
