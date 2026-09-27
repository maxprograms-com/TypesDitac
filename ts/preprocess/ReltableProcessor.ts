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

import { XMLAttribute, XMLNode } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { URIComponent } from "../utils/URIComponent.js";
import { LoadedDocument } from "./LoadedDocument.js";
import { LoadedDocuments } from "./LoadedDocuments.js";
import { LoadedTopic } from "./LoadedTopic.js";

type Linking = "none" | "sourceonly" | "targetonly" | "normal";

interface ReltableEntry {
    readonly topic?: LoadedTopic;
    readonly href: string;
    readonly scope: string;
    readonly format: string;
    readonly linking: Linking;
    readonly linktext?: DitaElement;
    readonly shortdesc?: DitaElement;
}

export class ReltableProcessor {
    readonly diagnostics: DiagnosticLog;

    constructor(diagnostics: DiagnosticLog) {
        this.diagnostics = diagnostics;
    }

    process(root: DitaElement, documents: LoadedDocuments, mapPath: string): void {
        const collected: Map<LoadedTopic, ReltableEntry[]> = new Map();
        for (const child of root.getChildren()) {
            if (DitaUtils.hasClass(child, "map/reltable")) {
                this.processColumns(child, documents, mapPath, collected);
                this.processRows(child, documents, mapPath, collected);
            }
        }
        if (collected.size === 0) {
            return;
        }
        const mapHref: string = DitaUtils.toFileUrl(mapPath);
        for (const [topic, entries] of collected) {
            this.addRelatedLinks(topic, entries, mapHref);
        }
    }

    private processColumns(
        reltable: DitaElement,
        documents: LoadedDocuments,
        mapPath: string,
        collected: Map<LoadedTopic, ReltableEntry[]>
    ): void {
        const header: DitaElement | undefined = DitaUtils.getChildByClass(reltable, "map/relheader");
        if (header === undefined) {
            return;
        }
        const relcolspecs: DitaElement[] = header.getChildren().filter(
            (element: DitaElement): boolean => DitaUtils.hasClass(element, "map/relcolspec")
        );
        const rows: DitaElement[] = reltable.getChildren().filter(
            (element: DitaElement): boolean => DitaUtils.hasClass(element, "map/relrow")
        );
        for (let column: number = 0; column < relcolspecs.length; column++) {
            const headerEntries: ReltableEntry[] = this.entries(relcolspecs[column], documents, mapPath);
            if (headerEntries.length === 0) {
                continue;
            }
            const cellList: ReltableEntry[][] = [headerEntries];
            for (const row of rows) {
                const cell: DitaElement | undefined = row.getChildren()[column];
                cellList.push(cell !== undefined && DitaUtils.hasClass(cell, "map/relcell")
                    ? this.entries(cell, documents, mapPath)
                    : []);
            }
            this.addColumn(cellList, collected);
        }
    }

    private addColumn(cellList: ReltableEntry[][], collected: Map<LoadedTopic, ReltableEntry[]>): void {
        if (cellList.length < 2) {
            return;
        }
        const sources: ReltableEntry[] = cellList[0];
        for (let index: number = 1; index < cellList.length; index++) {
            const targets: ReltableEntry[] = cellList[index];
            this.addLinks(sources, targets, collected);
            this.addLinks(targets, sources, collected);
        }
    }

    private processRows(
        reltable: DitaElement,
        documents: LoadedDocuments,
        mapPath: string,
        collected: Map<LoadedTopic, ReltableEntry[]>
    ): void {
        for (const row of reltable.getChildren().filter(
            (element: DitaElement): boolean => DitaUtils.hasClass(element, "map/relrow")
        )) {
            const cellList: ReltableEntry[][] = [];
            for (const cell of row.getChildren().filter(
                (element: DitaElement): boolean => DitaUtils.hasClass(element, "map/relcell")
            )) {
                cellList.push(this.entries(cell, documents, mapPath));
            }
            this.addRow(cellList, collected);
        }
    }

    private addRow(cellList: ReltableEntry[][], collected: Map<LoadedTopic, ReltableEntry[]>): void {
        for (let index: number = 0; index < cellList.length; index++) {
            const sources: ReltableEntry[] = cellList[index];
            for (let target: number = 0; target < cellList.length; target++) {
                if (target === index) {
                    continue;
                }
                this.addLinks(sources, cellList[target], collected);
            }
        }
    }

    private addLinks(sources: ReltableEntry[], targets: ReltableEntry[], collected: Map<LoadedTopic, ReltableEntry[]>): void {
        for (const source of sources) {
            if ((source.linking !== "normal" && source.linking !== "sourceonly") || source.topic === undefined) {
                continue;
            }
            for (const target of targets) {
                if (target.topic === source.topic ||
                    (target.linking !== "normal" && target.linking !== "targetonly")) {
                    continue;
                }
                const existing: ReltableEntry[] = collected.get(source.topic) ?? [];
                if (!existing.some((entry: ReltableEntry): boolean => entry.href === target.href)) {
                    existing.push(target);
                }
                collected.set(source.topic, existing);
            }
        }
    }

    private entries(cell: DitaElement, documents: LoadedDocuments, mapPath: string): ReltableEntry[] {
        const entries: ReltableEntry[] = [];
        this.processCell(cell, documents, mapPath, entries);
        return entries;
    }

    private processCell(
        cell: DitaElement,
        documents: LoadedDocuments,
        mapPath: string,
        entries: ReltableEntry[]
    ): void {
        for (const element of cell.getChildren()) {
            const href: string | undefined = DitaUtils.getNonEmptyAttribute(element, "href");
            if (DitaUtils.hasClass(element, "map/topicref") && href !== undefined) {
                const entry: ReltableEntry | undefined = this.createEntry(element, href, documents, mapPath);
                if (entry !== undefined) {
                    entries.push(entry);
                }
            }
            this.processCell(element, documents, mapPath, entries);
        }
    }

    private createEntry(
        element: DitaElement,
        href: string,
        documents: LoadedDocuments,
        mapPath: string
    ): ReltableEntry | undefined {
        const scope: string = DitaUtils.getScope(element, href);
        const format: string | undefined = DitaUtils.getFormat(element, href, scope);
        if (format === undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(this.diagnostics.i18n.getString("Filter", "missingAttribute"), ["format"]),
                mapPath
            );
            return undefined;
        }
        const linkingValue: string | undefined = DitaUtils.getNonEmptyAttribute(element, "linking");
        let linking: Linking;
        if (linkingValue === undefined || linkingValue === "normal") {
            linking = "normal";
        } else if (linkingValue === "none" || linkingValue === "sourceonly" || linkingValue === "targetonly") {
            linking = linkingValue;
        } else {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("Filter", "invalidAttribute"),
                    [linkingValue, "linking"]
                ),
                mapPath
            );
            linking = "none";
        }
        const meta: DitaElement | undefined = DitaUtils.getChildByClass(element, "map/topicmeta");
        const linktext: DitaElement | undefined = meta === undefined ? undefined : DitaUtils.getChildByClass(meta, "map/linktext");
        const shortdesc: DitaElement | undefined = meta === undefined ? undefined : DitaUtils.getChildByClass(meta, "map/shortdesc");
        const local: boolean = scope === "local" && format === "dita";
        let topic: LoadedTopic | undefined;
        let elementId: string | undefined;
        let pointsOutside: boolean = false;
        if (local) {
            const hashIndex: number = href.indexOf("#");
            const topicHref: string = hashIndex < 0 ? href : href.slice(0, hashIndex);
            const fragment: string | undefined = hashIndex < 0 ? undefined : URIComponent.decode(href.slice(hashIndex + 1));
            let topicId: string | undefined = fragment;
            if (fragment !== undefined) {
                const slashIndex: number = fragment.indexOf("/");
                if (slashIndex > 0 && slashIndex + 1 < fragment.length) {
                    topicId = fragment.slice(0, slashIndex);
                    elementId = fragment.slice(slashIndex + 1);
                }
            }
            let loadedDoc: LoadedDocument | undefined;
            try {
                loadedDoc = documents.load(topicHref);
            } catch {
                loadedDoc = undefined;
            }
            if (loadedDoc !== undefined) {
                const loadedTopic: LoadedTopic | undefined = topicId === undefined
                    ? loadedDoc.getFirstTopic()
                    : loadedDoc.findTopicById(topicId);
                if (loadedTopic === undefined) {
                    pointsOutside = true;
                } else if (!loadedTopic.isExcluded()) {
                    topic = loadedTopic;
                }
            } else {
                pointsOutside = true;
            }
        }
        if (local && topic === undefined) {
            if (pointsOutside) {
                this.diagnostics.warning(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("LinkGenerator", "pointsOutsidePreprocessedTopics"),
                        [href]
                    ),
                    mapPath
                );
            }
            return undefined;
        }
        if (!local && linking !== "none") {
            linking = "targetonly";
        }
        const resolvedHref: string = topic === undefined
            ? href
            : topic.getHref() + (elementId === undefined ? "" : "/" + URIComponent.quoteFragment(elementId));
        return {
            topic,
            href: resolvedHref,
            scope,
            format,
            linking,
            linktext,
            shortdesc
        };
    }

    private addRelatedLinks(topic: LoadedTopic, entries: ReltableEntry[], mapHref: string): void {
        const linkpool: DitaElement = this.addLinkpool(topic.element, "related", mapHref);
        for (const entry of entries) {
            this.addLink(linkpool, entry);
        }
    }

    private addLinkpool(topic: DitaElement, poolType: string, mapHref: string): DitaElement {
        let relatedLinks: DitaElement | undefined = DitaUtils.getChildByClass(topic, "topic/related-links");
        if (relatedLinks === undefined) {
            relatedLinks = new DitaElement("related-links");
            relatedLinks.setAttribute(new XMLAttribute("class", "- topic/related-links "));
            const before: DitaElement | undefined = topic.getChildren().find(
                (child: DitaElement): boolean => DitaUtils.hasClass(child, "topic/topic")
            );
            const content: XMLNode[] = topic.getContent();
            const index: number = before === undefined ? -1 : content.indexOf(before);
            if (index < 0) {
                topic.addElement(relatedLinks);
            } else {
                content.splice(index, 0, relatedLinks);
                topic.setContent(content);
            }
        }
        const linkpool: DitaElement = new DitaElement("linkpool");
        linkpool.setAttribute(new XMLAttribute("class", "- topic/linkpool "));
        linkpool.setAttribute(new XMLAttribute("mapkeyref", mapHref + " type=" + poolType));
        relatedLinks.addElement(linkpool);
        return linkpool;
    }

    private addLink(linkpool: DitaElement, entry: ReltableEntry): void {
        const link: DitaElement = new DitaElement("link");
        link.setAttribute(new XMLAttribute("class", "- topic/link "));
        link.setAttribute(new XMLAttribute("href", entry.href));
        link.setAttribute(new XMLAttribute("scope", entry.scope));
        link.setAttribute(new XMLAttribute("format", entry.format));
        if (entry.linktext !== undefined) {
            const linktext: DitaElement = DitaUtils.cloneElement(entry.linktext);
            linktext.setAttribute(new XMLAttribute("class", "- topic/linktext "));
            link.addElement(linktext);
        }
        if (entry.shortdesc !== undefined) {
            const desc: DitaElement = new DitaElement("desc");
            desc.setAttribute(new XMLAttribute("class", "- topic/desc "));
            desc.setContent(entry.shortdesc.getContent().map((node: XMLNode): XMLNode =>
                node instanceof DitaElement ? DitaUtils.cloneElement(node) : node
            ));
            link.addElement(desc);
        }
        linkpool.addElement(link);
    }
}
