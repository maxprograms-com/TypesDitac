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

import type { DefaultTreeAdapterTypes } from "parse5";
import { parse } from "parse5";
import { Catalog, SAXParser, XMLDocument } from "typesxml";
import { DitaDOMBuilder } from "../../dom/DitaDOMBuilder.js";
import { DitaElement } from "../../dom/DitaElement.js";
import { DiagnosticLog } from "../../utils/DiagnosticLog.js";
import { DitaUtils } from "../../utils/DitaUtils.js";
import { HDITAContext, HDITAConverter } from "./HDITAConverter.js";
import { HDITAMapConverter } from "./HDITAMapConverter.js";
import { HtmlElement, HtmlNode, HtmlSupport } from "./HtmlSupport.js";

export class HDITALoader {
    private static readonly VOID_ELEMENTS: Set<string> = new Set<string>([
        "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"
    ]);
    private static readonly SELF_CLOSING_TAG: RegExp =
        /<([A-Za-z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/>/g;

    private readonly catalog: Catalog;
    private readonly diagnostics: DiagnosticLog;

    constructor(catalog: Catalog, diagnostics: DiagnosticLog) {
        this.catalog = catalog;
        this.diagnostics = diagnostics;
    }

    load(filePath: string, validate: boolean): XMLDocument {
        const source: string = DitaUtils.readText(filePath);
        return this.loadSource(source, filePath, validate);
    }

    private static expandSelfClosingTags(source: string): string {
        // HTML parsing ignores "/>" on non-void elements and would swallow the content that
        // follows, so "<p/>" is rewritten as an empty "<p></p>".
        return source.replace(HDITALoader.SELF_CLOSING_TAG, (match: string, name: string, attributes: string): string =>
            HDITALoader.VOID_ELEMENTS.has(name.toLowerCase()) ? match : "<" + name + attributes + "></" + name + ">");
    }

    loadSource(source: string, filePath: string, validate: boolean): XMLDocument {
        const parsed: DefaultTreeAdapterTypes.Document = parse(HDITALoader.expandSelfClosingTags(source));
        const documentNodes: HtmlNode[] = parsed.childNodes;
        const html: HtmlElement | undefined = HtmlSupport.firstElementNamed(documentNodes, "html");
        const body: HtmlElement | undefined = HtmlSupport.firstElementNamed(HtmlSupport.children(html), "body");
        const root: HtmlElement | undefined = HtmlSupport.firstChildElement(body);

        if (root === undefined) {
            throw new Error(this.diagnostics.i18n.format(this.diagnostics.i18n.getString("HDITALoader", "bodyMustContainNavOrArticle"), [filePath]));
        }

        const documentRoot: HtmlElement = html ?? root;
        const ctx: HDITAContext = {
            documentNodes,
            documentRoot,
            rootName: HDITALoader.rootNameOf(filePath),
            documentPath: filePath,
            diagnostics: this.diagnostics
        };

        if (root.tagName === "nav") {
            const map: DitaElement = HDITAMapConverter.processMap(root, ctx);
            return this.reparseWithDTD(map, "-//OASIS//DTD DITA Map//EN", "map.dtd", validate);
        }

        if (root.tagName !== "article") {
            throw new Error(this.diagnostics.i18n.format(this.diagnostics.i18n.getString("HDITALoader", "bodyMustContainNavOrArticle"), [filePath]));
        }

        if (HtmlSupport.attribute(root, "data-class") !== "concept") {
            const h1: HtmlElement | undefined = HtmlSupport.firstChildElement(root)?.tagName === "h1"
                ? HtmlSupport.firstChildElement(root)
                : undefined;
            const h1Classes: string[] = h1 === undefined ? [] : HtmlSupport.classTokens(h1);
            if (h1Classes.includes("map")) {
                const map: DitaElement = HDITAMapConverter.processMap(root, ctx);
                return this.reparseWithDTD(map, "-//OASIS//DTD DITA Map//EN", "map.dtd", validate);
            }
        }

        const topic: DitaElement = HDITAConverter.processTopicArticle(root, ctx);
        return topic.getName() === "concept"
            ? this.reparseWithDTD(topic, "-//OASIS//DTD DITA Concept//EN", "concept.dtd", validate)
            : this.reparseWithDTD(topic, "-//OASIS//DTD DITA Topic//EN", "topic.dtd", validate);
    }

    private static rootNameOf(filePath: string): string {
        let pathName: string = filePath;
        try {
            pathName = new URL(filePath).pathname;
        } catch {
            pathName = filePath.split("#", 1)[0].split("?", 1)[0];
        }
        const baseName: string = pathName.split(/[\\/]/).pop() ?? "";
        const dotIndex: number = baseName.indexOf(".");
        return dotIndex < 0 ? baseName : baseName.slice(0, dotIndex);
    }

    private reparseWithDTD(root: DitaElement, publicId: string, systemId: string, validate: boolean): XMLDocument {
        const xml: string = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
            "<!DOCTYPE " + root.getName() + " PUBLIC \"" + publicId + "\" \"" + systemId + "\">\n" +
            root.toString();
        const builder: DitaDOMBuilder = new DitaDOMBuilder();
        const parser: SAXParser = new SAXParser();
        parser.setContentHandler(builder);
        parser.setCatalog(this.catalog);
        parser.setValidating(validate);
        parser.parseString(xml);
        const document: XMLDocument | undefined = builder.getDocument();
        if (document === undefined) {
            throw new Error(this.diagnostics.i18n.getString("HDITALoader", "convertedDocumentHasNoContent"));
        }
        return document;
    }
}
