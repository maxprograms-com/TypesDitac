/*
 * Portions Copyright (c) 2018-2019 XMLmind Software. All rights reserved.
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

import { FileReader, TextNode, XMLAttribute, XMLNode } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { ListingCleaner } from "./ListingCleaner.js";

interface OutputClassInfo {
    firstLine: number;
    tabWidth: number;
}

export class ListingProcessor extends ListingCleaner {
    private constructor() {
        super();
    }

    static processTopic(topic: DitaElement, topicPath: string, diagnostics: DiagnosticLog): void {
        ListingProcessor.process(topic, topicPath, diagnostics);
    }

    private static process(element: DitaElement, topicPath: string, diagnostics: DiagnosticLog): void {
        for (const child of element.getChildren()) {
            if (DitaUtils.hasClass(child, "topic/topic")) {
                return;
            }
            if (DitaUtils.hasClass(child, "topic/pre")) {
                const outputclass: string | undefined = DitaUtils.getNonEmptyAttribute(child, "outputclass");
                if (outputclass !== undefined) {
                    const info: OutputClassInfo = { firstLine: -1, tabWidth: -1 };
                    const outputclass2: string | undefined = ListingProcessor.parseOutputclass(outputclass, info);
                    if (outputclass2 !== outputclass) {
                        if (outputclass2 === undefined) {
                            child.removeAttribute("outputclass");
                        } else {
                            child.setAttribute(new XMLAttribute("outputclass", outputclass2));
                        }
                    }

                    if (info.tabWidth > 0 || info.firstLine >= 1) {
                        ListingProcessor.includeCoderefs(child, topicPath, diagnostics);
                    }
                    if (info.tabWidth > 0) {
                        ListingProcessor.normalizeWhiteSpace(child, info.tabWidth, true);
                    }
                    if (info.firstLine >= 1) {
                        const content: XMLNode[] = element.getContent();
                        const index: number = content.indexOf(child);
                        element.removeChild(child);
                        const numbered: DitaElement = ListingProcessor.numberListing(child, info.firstLine);
                        const updated: XMLNode[] = element.getContent();
                        updated.splice(index, 0, numbered);
                        element.setContent(updated);
                    }
                }
            } else {
                ListingProcessor.process(child, topicPath, diagnostics);
            }
        }
    }

    private static parseOutputclass(value: string, info: OutputClassInfo): string | undefined {
        info.firstLine = -1;
        info.tabWidth = -1;
        const kept: string[] = [];
        let language: string | undefined;

        for (const cls of value.split(/\s+/).filter((token: string): boolean => token.length > 0)) {
            if (cls.startsWith("language-")) {
                const hlCode: string | undefined = ListingCleaner.checkHLCode(cls.slice(9));
                if (hlCode !== undefined) {
                    language = hlCode;
                }
            } else if (cls === "line-numbers" || cls === "show-line-numbers") {
                info.firstLine = 1;
            } else if (cls.startsWith("line-numbers-")) {
                const i: number | undefined = ListingProcessor.parseStrictInt(cls.slice(13));
                if (i !== undefined && i >= 1) {
                    info.firstLine = i;
                }
            } else if (cls === "normalize-space") {
                info.tabWidth = 8;
            } else if (cls.startsWith("tab-width-")) {
                const j: number | undefined = ListingProcessor.parseStrictInt(cls.slice(10));
                if (j !== undefined && j >= 0) {
                    info.tabWidth = j;
                }
            } else {
                kept.push(cls);
            }
        }

        if (info.tabWidth < 0 && (language !== undefined || info.firstLine >= 1)) {
            info.tabWidth = 8;
        }
        if (language !== undefined) {
            kept.unshift("language-" + language);
        }
        return kept.length === 0 ? undefined : kept.join(" ");
    }

    private static includeCoderefs(pre: DitaElement, topicPath: string, diagnostics: DiagnosticLog): void {
        const content: XMLNode[] = pre.getContent();
        const result: XMLNode[] = [];
        for (const node of content) {
            if (node instanceof DitaElement && DitaUtils.hasClass(node, "pr-d/coderef")) {
                const href: string | undefined = DitaUtils.getNonEmptyAttribute(node, "href");
                if (href !== undefined) {
                    const format: string | undefined = DitaUtils.getNonEmptyAttribute(node, "format");
                    const charsetIndex: number = format?.indexOf("charset=") ?? -1;
                    const charset: string | undefined = charsetIndex >= 0 ? format?.slice(charsetIndex + 8) : undefined;
                    try {
                        const path: string = DitaUtils.resolveDocumentPath(topicPath, href.split("#", 1)[0].split("?", 1)[0]);
                        const text: string = /^https?:\/\//i.test(path)
                            ? DitaUtils.retrieveBytes(path, diagnostics.i18n).toString(ListingProcessor.toBufferEncoding(charset))
                            : ListingProcessor.readLocalText(path, charset);
                        result.push(new TextNode(text));
                    } catch (error: unknown) {
                        diagnostics.error(
                            diagnostics.i18n.format(
                                diagnostics.i18n.getString("ListingProcessor", "cannotIncludeCoderef"),
                                [href, error instanceof Error ? error.message : String(error)]
                            ),
                            topicPath
                        );
                    }
                }
                // In all cases, coderef is now useless.
                continue;
            }
            result.push(node);
        }
        pre.setContent(result);
    }

    private static readLocalText(path: string, charset: string | undefined): string {
        const reader: FileReader = charset === undefined
            ? new FileReader(path)
            : new FileReader(path, ListingProcessor.toBufferEncoding(charset));
        const chunks: string[] = [];
        try {
            while (reader.dataAvailable()) {
                chunks.push(reader.read());
            }
            return chunks.join("");
        } finally {
            reader.closeFile();
        }
    }

    private static toBufferEncoding(charset: string | undefined): BufferEncoding {
        switch (charset?.trim().toLowerCase()) {
            case "utf8":
            case "utf-8":
                return "utf8";
            case "utf16le":
            case "utf-16le":
            case "utf16":
            case "utf-16":
                return "utf16le";
            case "latin1":
            case "iso-8859-1":
            case "iso8859-1":
                return "latin1";
            case "ascii":
            case "us-ascii":
                return "ascii";
            case "base64":
                return "base64";
            case "hex":
                return "hex";
            default:
                return "utf8";
        }
    }

    private static numberListing(pre: DitaElement, firstLine: number): DitaElement {
        const lineCount: number = ListingProcessor.countLines(pre);

        const table: DitaElement = ListingProcessor.createElement("table");
        table.setAttribute(new XMLAttribute("outputclass", "listing-layout"));

        const tgroup: DitaElement = ListingProcessor.createElement("tgroup");
        tgroup.setAttribute(new XMLAttribute("cols", "2"));
        tgroup.setAttribute(new XMLAttribute("outputclass", "listing-table"));
        table.addElement(tgroup);

        const colspec: DitaElement = ListingProcessor.createElement("colspec");
        colspec.setAttribute(new XMLAttribute("outputclass", "listing-numbers-column"));

        let rounded: number = firstLine + lineCount - 1;
        if (rounded <= 10) {
            rounded = ListingProcessor.round(rounded, 10);
        } else if (rounded <= 100) {
            rounded = ListingProcessor.round(rounded, 100);
        } else if (rounded <= 1000) {
            rounded = ListingProcessor.round(rounded, 1000);
        } else if (rounded <= 10000) {
            rounded = ListingProcessor.round(rounded, 10000);
        }
        let width: number = rounded.toString().length;
        width *= 0.75;
        if (width < 2) {
            width = 2;
        }
        colspec.setAttribute(new XMLAttribute("colwidth", ListingProcessor.formatEm(width)));
        tgroup.addElement(colspec);

        const tbody: DitaElement = ListingProcessor.createElement("tbody");
        tbody.setAttribute(new XMLAttribute("outputclass", "listing-table-body"));
        tgroup.addElement(tbody);

        const row: DitaElement = ListingProcessor.createElement("row");
        row.setAttribute(new XMLAttribute("outputclass", "listing-row"));
        tbody.addElement(row);

        let entry: DitaElement = ListingProcessor.createElement("entry");
        entry.setAttribute(new XMLAttribute("outputclass", "listing-numbers-cell"));
        row.addElement(entry);

        const pre2: DitaElement = new DitaElement(pre.getName());
        const cls: string | undefined = pre.getAttribute("class")?.getValue();
        if (cls !== undefined && cls.length > 0) {
            pre2.setAttribute(new XMLAttribute("class", cls));
        }
        pre2.setAttribute(new XMLAttribute("outputclass", "listing-numbers"));
        entry.addElement(pre2);

        const lines: string[] = [];
        for (let i: number = 0; i < lineCount; i++) {
            lines.push((firstLine + i).toString());
        }
        pre2.addString(lines.join("\n"));

        entry = ListingProcessor.createElement("entry");
        entry.setAttribute(new XMLAttribute("outputclass", "listing-lines-cell"));
        row.addElement(entry);

        const existingOutputclass: string = pre.getAttribute("outputclass")?.getValue() ?? "";
        // The test is on @class (almost always non-empty), not @outputclass, so a missing
        // @outputclass yields a leading space here.
        const outputclass: string = cls !== undefined && cls.length > 0
            ? existingOutputclass + " listing-lines"
            : "listing-lines";
        pre.setAttribute(new XMLAttribute("outputclass", outputclass));
        entry.addElement(pre);

        return table;
    }

    private static createElement(name: string): DitaElement {
        const element: DitaElement = new DitaElement(name);
        element.setAttribute(new XMLAttribute("class", "- topic/" + name + " "));
        return element;
    }

    private static countLines(pre: DitaElement): number {
        const text: string = pre.getText();
        let count: number = 0;
        for (const c of text) {
            if (c === "\n") {
                count++;
            }
        }
        return count + 1;
    }

    private static round(num: number, max: number): number {
        return max * Math.floor((num + max - 1) / max);
    }

    private static formatEm(value: number): string {
        return (Number.isInteger(value) ? value.toString() + ".0" : value.toString()) + "em";
    }

    private static parseStrictInt(text: string): number | undefined {
        return /^[+-]?\d+$/.test(text) ? Number.parseInt(text, 10) : undefined;
    }
}
