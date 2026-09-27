/*
 * Portions Copyright (c) 2017-2025 XMLmind Software. All rights reserved.
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

import { XMLAttribute, XMLDocument, XMLNode } from "typesxml";
import { LanguageUtils } from "typesbcp47";
import { DitaElement } from "../dom/DitaElement.js";
import { I18n } from "../i18n/I18n.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { DITAC_NS_URI } from "./ChunkDocumentBuilder.js";
import { LoadedDocument } from "./LoadedDocument.js";

export class UnifiedDocumentBuilder {
    private readonly i18n: I18n;
    private readonly messages: Map<string, I18n> = new Map<string, I18n>();
    private extendedToc: string = "none";

    constructor(i18n: I18n) {
        this.i18n = i18n;
    }

    private static readonly PLACEHOLDER_NAMES: Set<string> = new Set([
        "ditac:titlePage", "ditac:toc", "ditac:figureList", "ditac:tableList",
        "ditac:exampleList", "ditac:equationList", "ditac:indexList"
    ]);

    private static readonly MESSAGE_FILE_NAMES: string[] = [
        "cs", "de", "en", "es", "fr", "it", "pl", "ru", "nn", "nb", "ja", "nl", "zh"
    ];

    private static readonly AUTO_TITLE_KEYS: Map<string, string> = new Map([
        ["toc", "tableOfContents"],
        ["figurelist", "listOfFigures"],
        ["tablelist", "listOfTables"],
        ["examplelist", "listOfExamples"],
        ["equationlist", "listOfEquations"],
        ["glossarylist", "glossary"],
        ["indexlist", "index"]
    ]);

    private static readonly HEADING_KEYS: Map<string, string> = new Map([
        ["ditac:toc", "tableOfContents"],
        ["ditac:figureList", "listOfFigures"],
        ["ditac:tableList", "listOfTables"],
        ["ditac:exampleList", "listOfExamples"],
        ["ditac:equationList", "listOfEquations"],
        ["ditac:indexList", "index"]
    ]);

    setExtendedToc(extendedToc: string): void {
        this.extendedToc = extendedToc;
    }

    merge(map: LoadedDocument, chunkDocuments: ReadonlyMap<string, XMLDocument>, listsDocument: XMLDocument): XMLDocument {
        return this.mergeStructured(map, chunkDocuments, listsDocument);
    }

    mergeStructured(
        map: LoadedDocument,
        chunkDocuments: ReadonlyMap<string, XMLDocument>,
        listsDocument: XMLDocument
    ): XMLDocument {
        const sourceRoot: DitaElement | undefined = DitaUtils.getRoot(map.document);
        if (sourceRoot === undefined) {
            throw new Error(this.i18n.format(this.i18n.getString("LoadedDocument", "documentHasNoRoot"), [map.path]));
        }
        const listsRoot: DitaElement | undefined = DitaUtils.getRoot(listsDocument);
        const entriesByElement: Map<DitaElement, DitaElement[]> = new Map<DitaElement, DitaElement[]>();
        const topicrefsInOrder: DitaElement[] = [];
        const usedTopicrefs: Set<DitaElement> = new Set<DitaElement>();
        this.collectContentTopicrefs(sourceRoot, topicrefsInOrder);
        let fallbackTopicrefIndex: number = 0;
        for (const chunkDocument of chunkDocuments.values()) {
            const chunkRoot: DitaElement | undefined = DitaUtils.getRoot(chunkDocument);
            if (chunkRoot === undefined) {
                continue;
            }
            const children: DitaElement[] = chunkRoot.getChildren();
            for (const child of children) {
                const entry: DitaElement = this.resolvePlaceholder(child, listsRoot);
                let topicref: DitaElement | undefined;
                if (DitaUtils.hasClass(child, "topic/topic")) {
                    while (fallbackTopicrefIndex < topicrefsInOrder.length && usedTopicrefs.has(topicrefsInOrder[fallbackTopicrefIndex])) {
                        fallbackTopicrefIndex++;
                    }
                    topicref = topicrefsInOrder[fallbackTopicrefIndex++];
                    if (topicref !== undefined) {
                        usedTopicrefs.add(topicref);
                    }
                } else {
                    const target: DitaElement | undefined = this.findEntryTargetByName(sourceRoot, child.getName());
                    if (target !== undefined) {
                        this.addStructuredEntry(entriesByElement, target, entry);
                    }
                    continue;
                }
                if (topicref !== undefined) {
                    this.addStructuredEntry(entriesByElement, topicref, entry);
                }
            }
        }
        const document: XMLDocument = new XMLDocument();
        const root: DitaElement = this.buildStructuredElement(sourceRoot, entriesByElement, listsRoot);
        root.setAttribute(new XMLAttribute("xmlns:ditac", DITAC_NS_URI));
        document.setRoot(root);
        return document;
    }

    private collectContentTopicrefs(element: DitaElement, topicrefs: DitaElement[]): void {
        for (const child of element.getChildren()) {
            if (DitaUtils.hasClass(child, "map/topicref") &&
                DitaUtils.getTopicrefHref(child) !== undefined &&
                !this.isGeneratedListTarget(child)) {
                topicrefs.push(child);
            }
            this.collectContentTopicrefs(child, topicrefs);
        }
    }

    private buildStructuredElement(
        source: DitaElement,
        entriesByElement: ReadonlyMap<DitaElement, DitaElement[]>,
        listsRoot: DitaElement | undefined
    ): DitaElement {
        const result: DitaElement = DitaUtils.cloneElement(source);
        result.setContent([]);
        const entries: DitaElement[] | undefined = entriesByElement.get(source);
        if (entries !== undefined) {
            if (this.isGeneratedListTarget(source)) {
                return DitaUtils.cloneElement(entries[0]);
            }
            for (const entry of entries) {
                result.addElement(this.resolveGeneratedGlossaryTitle(source, entry));
            }
        } else if (listsRoot !== undefined && UnifiedDocumentBuilder.PLACEHOLDER_NAMES.has(source.getName()) && source.getChildren().length === 0) {
            result.addElement(this.resolvePlaceholder(source, listsRoot));
        }
        for (const child of source.getChildren()) {
            result.addElement(this.buildStructuredElement(child, entriesByElement, listsRoot));
        }
        return result;
    }

    private resolveGeneratedGlossaryTitle(parent: DitaElement, entry: DitaElement): DitaElement {
        if (!DitaUtils.hasClass(parent, "bookmap/glossarylist") || !DitaUtils.hasClass(entry, "topic/topic")) {
            return entry;
        }
        const title: DitaElement | undefined = DitaUtils.getChildByClass(entry, "topic/title");
        if (title === undefined || DitaUtils.getTitleTextFromChild(entry, false) !== "__AUTO__glossarylist__") {
            return entry;
        }
        const resolved: DitaElement = DitaUtils.cloneElement(entry);
        const resolvedTitle: DitaElement | undefined = DitaUtils.getChildByClass(resolved, "topic/title");
        if (resolvedTitle !== undefined) {
            resolvedTitle.setContent([]);
            resolvedTitle.addString(this.localize("glossary", entry.getAttribute("xml:lang") !== undefined ? entry : parent));
        }
        return resolved;
    }

    private isGeneratedListTarget(element: DitaElement): boolean {
        return DitaUtils.hasClass(element, "bookmap/toc") ||
            DitaUtils.hasClass(element, "bookmap/figurelist") ||
            DitaUtils.hasClass(element, "bookmap/tablelist") ||
            DitaUtils.hasClass(element, "bookmap/examplelist") ||
            DitaUtils.hasClass(element, "bookmap/equationlist") ||
            DitaUtils.hasClass(element, "bookmap/indexlist");
    }

    private addStructuredEntry(entriesByElement: Map<DitaElement, DitaElement[]>, target: DitaElement, entry: DitaElement): void {
        const entries: DitaElement[] = entriesByElement.get(target) ?? [];
        entries.push(entry);
        entriesByElement.set(target, entries);
    }

    private findEntryTargetByName(root: DitaElement, name: string): DitaElement | undefined {
        const classes: Map<string, string> = new Map<string, string>([
            ["ditac:toc", "bookmap/toc"],
            ["ditac:figureList", "bookmap/figurelist"],
            ["ditac:tableList", "bookmap/tablelist"],
            ["ditac:exampleList", "bookmap/examplelist"],
            ["ditac:equationList", "bookmap/equationlist"],
            ["ditac:indexList", "bookmap/indexlist"]
        ]);
        const className: string | undefined = classes.get(name);
        if (className === undefined) {
            return root;
        }
        return this.findElementByClass(root, className);
    }

    private findElementByClass(element: DitaElement, className: string): DitaElement | undefined {
        if (DitaUtils.hasClass(element, className)) {
            return element;
        }
        for (const child of element.getChildren()) {
            const found: DitaElement | undefined = this.findElementByClass(child, className);
            if (found !== undefined) {
                return found;
            }
        }
        return undefined;
    }

    private resolvePlaceholder(child: DitaElement, listsRoot: DitaElement | undefined): DitaElement {
        if (listsRoot !== undefined && UnifiedDocumentBuilder.PLACEHOLDER_NAMES.has(child.getName()) && child.getChildren().length === 0) {
            const section: DitaElement | undefined = listsRoot.getChildren().find(
                (candidate: DitaElement): boolean => candidate.getName() === child.getName()
            );
            if (section !== undefined) {
                const resolved: DitaElement = DitaUtils.cloneElement(section);
                if (section.getName() === "ditac:toc" && listsRoot !== undefined) {
                    this.addExtendedTOC(resolved, listsRoot, section);
                }
                if (resolved.getChildren().length > 0) {
                    this.addHeading(resolved, section);
                }
                return resolved;
            }
        }
        return DitaUtils.cloneElement(child);
    }

    private addExtendedTOC(toc: DitaElement, listsRoot: DitaElement, context: DitaElement): void {
        const content: XMLNode[] = toc.getContent();
        if (this.extendedToc === "frontmatter" || this.extendedToc === "both") {
            const frontmatterTOC: DitaElement | undefined = this.extendedTOCGroup(listsRoot, "ditac:frontmatterTOC", context);
            if (frontmatterTOC !== undefined) {
                content.unshift(frontmatterTOC);
            }
        }
        if (this.extendedToc === "backmatter" || this.extendedToc === "both") {
            const backmatterTOC: DitaElement | undefined = this.extendedTOCGroup(listsRoot, "ditac:backmatterTOC", context);
            if (backmatterTOC !== undefined) {
                content.push(backmatterTOC);
            }
        }
        toc.setContent(content);
    }

    private extendedTOCGroup(listsRoot: DitaElement, name: string, context: DitaElement): DitaElement | undefined {
        const source: DitaElement | undefined = listsRoot.getChildren().find(
            (candidate: DitaElement): boolean => candidate.getName() === name
        );
        if (source === undefined) {
            return undefined;
        }
        const group: DitaElement = DitaUtils.cloneElement(source);
        this.prepareExtendedEntries(group, context);
        return group.getChildren().length > 0 ? group : undefined;
    }

    private prepareExtendedEntries(parent: DitaElement, context: DitaElement): void {
        const content: XMLNode[] = [];
        for (const node of parent.getContent()) {
            if (node instanceof DitaElement) {
                const id: string = node.getAttribute("id")?.getValue() ?? "";
                if (node.getAttribute("role")?.getValue() === "toc" && id.startsWith("__AUTO__")) {
                    continue;
                }
                this.localizeAutoTitle(node, context);
                this.prepareExtendedEntries(node, context);
            }
            content.push(node);
        }
        parent.setContent(content);
    }

    private localizeAutoTitle(entry: DitaElement, context: DitaElement): void {
        const title: string = entry.getAttribute("title")?.getValue() ?? "";
        if (!title.startsWith("__AUTO__") || !title.endsWith("__")) {
            return;
        }
        const key: string | undefined = UnifiedDocumentBuilder.AUTO_TITLE_KEYS.get(title.substring(8, title.length - 2));
        if (key !== undefined) {
            entry.setAttribute(new XMLAttribute("title", this.localize(key, context)));
        }
    }

    private addHeading(element: DitaElement, context: DitaElement): void {
        const key: string | undefined = UnifiedDocumentBuilder.HEADING_KEYS.get(element.getName());
        if (key === undefined) {
            return;
        }
        const heading: DitaElement = new DitaElement("title");
        heading.setAttribute(new XMLAttribute("class", "- topic/title "));
        heading.addString(this.localize(key, context));
        const content: XMLNode[] = element.getContent();
        content.unshift(heading);
        element.setContent(content);
    }

    private localize(key: string, context: DitaElement): string {
        const lang: string = UnifiedDocumentBuilder.contextLang(context);
        let messageFileName: string = "en";
        if (UnifiedDocumentBuilder.MESSAGE_FILE_NAMES.includes(lang)) {
            messageFileName = lang;
        } else {
            const hyphen: number = lang.indexOf("-");
            const lang3: string = hyphen >= 0 ? lang.substring(0, hyphen) : "";
            if (UnifiedDocumentBuilder.MESSAGE_FILE_NAMES.includes(lang3)) {
                messageFileName = lang3;
            }
        }
        const missing: string = "!" + key + "!";
        const value: string = this.messageFile(messageFileName).getString("GeneratedListTopicBuilder", key);
        if (value !== missing) {
            return value;
        }
        const enValue: string = this.messageFile("en").getString("GeneratedListTopicBuilder", key);
        return enValue !== missing ? enValue : key;
    }

    private messageFile(name: string): I18n {
        let file: I18n | undefined = this.messages.get(name);
        if (file === undefined) {
            file = I18n.load(DiagnosticLog.I18N_DIRECTORY, "typesditac", name);
            this.messages.set(name, file);
        }
        return file;
    }

    private static contextLang(context: DitaElement): string {
        let lang: string = "en";
        let current: DitaElement | undefined = context;
        while (current !== undefined) {
            const attribute: XMLAttribute | undefined = current.getAttribute("xml:lang");
            if (attribute !== undefined) {
                const normalized: string | undefined = LanguageUtils.normalizeCode(attribute.getValue().trim());
                if (normalized !== undefined) {
                    lang = normalized;
                    break;
                }
            }
            current = current.getParent();
        }
        return lang;
    }
}
