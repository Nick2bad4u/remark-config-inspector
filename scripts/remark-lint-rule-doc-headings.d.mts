export interface RemarkLintRuleDocHeadingsOptions {
    headings?: Record<string, boolean>;
    helperDocPathPattern?: RegExp;
    requirePackageDocumentation?: boolean;
    requirePackageDocumentationLabel?: boolean;
    requireRuleCatalogId?: boolean;
    packageDocumentationLabelPattern?: RegExp;
    ruleCatalogIdLinePattern?: RegExp;
    ruleNamespaceAliases?: string[];
}

export default function remarkLintRuleDocHeadings(
    options?: RemarkLintRuleDocHeadingsOptions
): (tree: unknown) => void;
