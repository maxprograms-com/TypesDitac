/*
 * Portions Copyright (c) 2018-2026 XMLmind Software. All rights reserved.
 * Author: Hussein Shafie
 *
 * Portions Copyright (c) 2026 Maxprograms SAS.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import MarkdownIt from "markdown-it";
import abbrPlugin from "markdown-it-abbr";
import insPlugin from "markdown-it-ins";
import { Catalog } from "typesxml";
import { DiagnosticLog } from "../../utils/DiagnosticLog.js";
import { DocumentLoader } from "../../preprocess/DocumentLoader.js";
import { DocumentLoaderFactory } from "../../preprocess/DocumentLoaderFactory.js";
import { ListingCleaner } from "../../preprocess/ListingCleaner.js";
import { FootnoteExtension } from "./FootnoteExtension.js";
import { AdmonitionExtension } from "./AdmonitionExtension.js";
import { AttributesExtension } from "./AttributesExtension.js";
import { DefinitionListExtension } from "./DefinitionListExtension.js";
import { KeyrefExtension } from "./KeyrefExtension.js";
import mediaTagsPlugin from "./MediaTagsExtension.js";
import { ScriptExtension } from "./ScriptExtension.js";
import { TableExtension } from "./TableExtension.js";
import { MDITALoader } from "./MDITALoader.js";
import { MarkdownItInstance, RenderRule, Token } from "./MarkdownItTypes.js";

export interface MDITAOptions {
    readonly mediaTags?: boolean;
}

export class MDITALoaderFactory implements DocumentLoaderFactory {
    private static readonly EXTENSIONS: string[] = ["md", "markdown", "mdown", "mkdn", "mdwn", "mkd", "rmd"];

    getName(): string {
        return "mdita";
    }

    getExtensions(): string[] {
        return MDITALoaderFactory.EXTENSIONS;
    }

    createLoader(catalog: Catalog, diagnostics: DiagnosticLog, options: MDITAOptions = {}): DocumentLoader {
        return new MDITALoader(catalog, diagnostics, MDITALoaderFactory.createParser(options));
    }

    static createParser(options: MDITAOptions = {}): MarkdownItInstance {
        const md: MarkdownItInstance = new MarkdownIt({ html: true, typographer: true });

        md.use(abbrPlugin);
        md.use(DefinitionListExtension.plugin);
        md.use(ScriptExtension.plugin);
        md.use(TableExtension.plugin);
        md.use(insPlugin);
        md.use(FootnoteExtension.plugin);
        md.use(KeyrefExtension.plugin);
        md.use(AdmonitionExtension.plugin);
        md.use(AttributesExtension.plugin);
        if (options.mediaTags === true) {
            md.use(mediaTagsPlugin);
        }

        MDITALoaderFactory.applyGuillemets(md);
        MDITALoaderFactory.applyExtraTypographic(md);
        MDITALoaderFactory.applyLinkResolver(md);
        MDITALoaderFactory.applyTableBorder(md);
        MDITALoaderFactory.applyStrikethrough(md);
        MDITALoaderFactory.applyFenceRenderer(md);

        return md;
    }

    private static applyStrikethrough(md: MarkdownItInstance): void {
        const renderDel: NonNullable<RenderRule> = (tokens: Token[], idx: number, opts, _env, self): string => {
            tokens[idx].tag = "del";
            return self.renderToken(tokens, idx, opts);
        };
        md.renderer.rules.s_open = renderDel;
        md.renderer.rules.s_close = renderDel;
    }

    private static applyGuillemets(md: MarkdownItInstance): void {
        // Must run before autolink/html_inline: with html enabled, "<<some text>>" would
        // otherwise be parsed as an inline <some> tag before any text rule sees it.
        md.inline.ruler.before("autolink", "guillemets", (state, silent): boolean => {
            if (state.src.charCodeAt(state.pos) !== 0x3C || state.src.charCodeAt(state.pos + 1) !== 0x3C) {
                return false;
            }
            const match: RegExpExecArray | null = /^<<([^<>]+)>>/.exec(state.src.slice(state.pos, state.posMax));
            if (match === null) {
                return false;
            }
            if (!silent) {
                const token: Token = state.push("text", "", 0);
                token.content = "«" + match[1] + "»";
            }
            state.pos += match[0].length;
            return true;
        });
    }

    private static applyExtraTypographic(md: MarkdownItInstance): void {
        md.core.ruler.after("linkify", "extra_typographic", (state): void => {
            for (const token of state.tokens) {
                if (token.type === "inline" && token.children !== null) {
                    for (const child of token.children) {
                        if (child.type === "text") {
                            child.content = child.content.replace(/\s\.\s\.\s\./g, " …");
                        }
                    }
                }
            }
        });
    }

    private static applyLinkResolver(md: MarkdownItInstance): void {
        const defaultRender: NonNullable<RenderRule> = md.renderer.rules.link_open ??
            ((tokens, idx, opts): string => md.renderer.renderToken(tokens, idx, opts));

        md.renderer.rules.link_open = (tokens: Token[], idx: number, opts, env, self): string => {
            const token: Token = tokens[idx];
            const href: string | number | null = token.attrGet("href");
            if (href !== null && token.markup !== "autolink") {
                const url: string = href.toString().toLowerCase();
                if (/^[\w]+:\/.+/.test(url)) {
                    token.attrSet("rel", "external");
                }
                if (/\.(?:html|htm|shtml|xhtml|xhtm|xht)$/.test(url) ||
                    ((url.startsWith("http://") || url.startsWith("https://")) && url.endsWith("/"))) {
                    token.attrSet("type", "html");
                } else if (url.endsWith(".pdf")) {
                    token.attrSet("type", "pdf");
                } else if (url.endsWith(".txt")) {
                    token.attrSet("type", "txt");
                }
            }
            return defaultRender(tokens, idx, opts, env, self);
        };
    }

    private static applyTableBorder(md: MarkdownItInstance): void {
        const defaultRender: NonNullable<RenderRule> = md.renderer.rules.table_open ??
            ((tokens, idx, opts): string => md.renderer.renderToken(tokens, idx, opts));

        md.renderer.rules.table_open = (tokens: Token[], idx: number, opts, env, self): string => {
            tokens[idx].attrSet("border", "1");
            return defaultRender(tokens, idx, opts, env, self);
        };
    }

    private static applyFenceRenderer(md: MarkdownItInstance): void {
        md.renderer.rules.fence = (tokens: Token[], idx: number): string => {
            const token: Token = tokens[idx];
            const info: string = token.info ? md.utils.unescapeAll(token.info).trim() : "";

            let classValue: string | undefined;
            if (info.length > 0) {
                const sep: number = info.indexOf(";");
                let language: string | undefined;
                let numbered: boolean = false;
                if (sep > 0 && sep + 1 < info.length) {
                    language = info.slice(0, sep).trim();
                    numbered = info.slice(sep + 1).trim().toLowerCase().includes("number");
                } else {
                    language = info.trim();
                }
                if (language !== undefined && language.length > 0) {
                    language = ListingCleaner.checkHLCode(language);
                }
                if (language !== undefined) {
                    classValue = "language-" + language;
                }
                if (numbered) {
                    classValue = classValue === undefined ? "line-numbers" : classValue + " line-numbers";
                }
            }

            if (classValue !== undefined) {
                token.attrJoin("class", classValue);
            }

            return "<pre" + md.renderer.renderAttrs(token) + ">" + md.utils.escapeHtml(token.content) + "</pre>\n";
        };
    }
}
