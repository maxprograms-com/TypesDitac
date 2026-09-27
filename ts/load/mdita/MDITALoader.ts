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

import { closeSync, openSync, readSync } from "node:fs";
import { Catalog, XMLDocument, XMLUtils } from "typesxml";
import { DiagnosticLog } from "../../utils/DiagnosticLog.js";
import { DitaUtils } from "../../utils/DitaUtils.js";
import { DocumentLoader } from "../../preprocess/DocumentLoader.js";
import { HDITALoader } from "../hdita/HDITALoader.js";
import { MarkdownItInstance } from "./MarkdownItTypes.js";

interface FrontMatter {
    readonly values: Map<string, string[]>;
    readonly body: string;
}

export class MDITALoader implements DocumentLoader {
    private readonly hditaLoader: HDITALoader;
    private readonly parser: MarkdownItInstance;

    constructor(catalog: Catalog, diagnostics: DiagnosticLog, parser: MarkdownItInstance) {
        this.hditaLoader = new HDITALoader(catalog, diagnostics);
        this.parser = parser;
    }

    load(filePath: string, validate: boolean): XMLDocument {
        const html: string = this.loadHTML(filePath);
        return this.hditaLoader.loadSource(html, filePath, validate);
    }

    loadSource(source: string, filePath: string, validate: boolean): XMLDocument {
        return this.hditaLoader.loadSource(this.renderHTML(source), filePath, validate);
    }

    loadHTML(filePath: string): string {
        return this.renderHTML(DitaUtils.readText(filePath, this.codingDirective(filePath)));
    }

    private codingDirective(filePath: string): BufferEncoding | undefined {
        const buffer: Buffer = Buffer.alloc(1024);
        const fd: number = openSync(filePath, "r");
        let bytesRead: number;
        try {
            bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
        } finally {
            closeSync(fd);
        }
        const head: string = buffer.toString("latin1", 0, bytesRead);
        const match: RegExpMatchArray | null = head.match(/-\*-.*?\bcoding:\s*([\w.-]+).*?-\*-/i);
        if (match === null) {
            return undefined;
        }
        // Emacs coding systems may carry an end-of-line suffix, as in "utf-8-unix".
        const coding: string = match[1].toLowerCase().replace(/-(?:unix|dos|mac)$/, "");
        if (coding === "utf-8" || coding === "utf8") {
            return "utf8";
        }
        if (coding === "utf-16le" || coding === "utf-16-le") {
            return "utf16le";
        }
        if (coding === "iso-8859-1" || coding === "iso-latin-1" || coding === "latin-1" || coding === "latin1") {
            return "latin1";
        }
        return undefined;
    }

    private renderHTML(source: string): string {
        const frontMatter: FrontMatter | undefined = this.parseFrontMatter(source);
        const markdown: string = frontMatter?.body ?? source;
        const rendered: string = this.parser.render(markdown);

        const id: string | undefined = frontMatter?.values.get("id")?.[0];
        const validId: string | undefined = id !== undefined && XMLUtils.isValidNCName(id) ? id : undefined;

        const metadata: string = frontMatter === undefined ? "" : this.frontMatterToHtml(frontMatter.values);
        const articleId: string = validId !== undefined ? " id=\"" + this.escapeAttribute(validId) + "\"" : "";

        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
            "<html><head>" + metadata + "</head><body><article" + articleId + ">" +
            rendered.trim() + "</article></body></html>";
    }

    private parseFrontMatter(source: string): FrontMatter | undefined {
        const leading: RegExpMatchArray | null = source.match(/^(?:[ \t]*\r?\n|[ \t]*<!--[\s\S]*?-->[ \t]*\r?\n)*/);
        const prefix: string = leading === null ? "" : leading[0];
        const rest: string = source.slice(prefix.length);
        const match: RegExpMatchArray | null = rest.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
        if (match === null) {
            return undefined;
        }
        const values: Map<string, string[]> = new Map<string, string[]>();
        let currentKey: string | undefined;
        for (const line of match[1].split(/\r?\n/)) {
            const keyValue: RegExpMatchArray | null = line.match(/^([A-Za-z][A-Za-z0-9_.-]*):(?:\s*(.*))?$/);
            if (keyValue !== null) {
                currentKey = keyValue[1].toLowerCase();
                const value: string = this.unquote(keyValue[2] ?? "");
                values.set(currentKey, value.length === 0 ? [] : [value]);
                continue;
            }
            const listValue: RegExpMatchArray | null = line.match(/^\s+-\s+(.+)$/);
            if (listValue !== null && currentKey !== undefined) {
                values.get(currentKey)?.push(this.unquote(listValue[1]));
            }
        }
        if (!values.has("title")) {
            values.set("title", []);
        }
        return { values, body: prefix + rest.slice(match[0].length) };
    }

    private frontMatterToHtml(values: Map<string, string[]>): string {
        const titleEntries: string[] | undefined = values.get("title");
        const titleText: string = titleEntries !== undefined && titleEntries.length > 0 ? titleEntries[0] : "";
        let html: string = "<title>" + this.escapeText(titleText) + "</title>";
        for (const [name, entries] of values) {
            if (name === "id" || name === "title") {
                continue;
            }
            for (const value of entries) {
                html += "<meta name=\"" + this.escapeAttribute(name) + "\" content=\"" +
                    this.escapeAttribute(value) + "\">";
            }
        }
        return html;
    }

    private unquote(value: string): string {
        const trimmed: string = value.trim();
        if (trimmed.length >= 2 && ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
            return trimmed.slice(1, -1);
        }
        return trimmed;
    }

    private escapeAttribute(value: string): string {
        return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    }

    private escapeText(value: string): string {
        return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}
