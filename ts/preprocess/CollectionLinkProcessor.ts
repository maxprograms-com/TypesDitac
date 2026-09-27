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

interface CollectionEntry {
    readonly topic: LoadedTopic;
    readonly href: string;
    readonly linking: Linking;
    readonly linktext?: DitaElement;
    readonly shortdesc?: DitaElement;
}

export class CollectionLinkProcessor {
    readonly diagnostics: DiagnosticLog;
    private mapHref: string = "";

    constructor(diagnostics: DiagnosticLog) {
        this.diagnostics = diagnostics;
    }

    process(root: DitaElement, documents: LoadedDocuments, mapPath: string): void {
        this.mapHref = DitaUtils.toFileUrl(mapPath);
        this.processHierarchy(root, documents, mapPath);
    }

    private processHierarchy(topicrefOrMap: DitaElement, documents: LoadedDocuments, mapPath: string): void {
        this.processCollection(topicrefOrMap, documents, mapPath);
        for (const child of topicrefOrMap.getChildren()) {
            if (DitaUtils.hasClass(child, "map/topicref") &&
                !DitaUtils.hasClass(child, "bookmap/frontmatter") &&
                !DitaUtils.hasClass(child, "bookmap/backmatter")) {
                this.processHierarchy(child, documents, mapPath);
            }
        }
    }

    private processCollection(topicrefOrMap: DitaElement, documents: LoadedDocuments, mapPath: string): void {
        const parent: CollectionEntry | undefined = this.entry(topicrefOrMap, documents, mapPath);
        const children: CollectionEntry[] = [];
        for (const child of topicrefOrMap.getChildren()) {
            if (!DitaUtils.hasClass(child, "map/topicref")) {
                continue;
            }
            const entry: CollectionEntry | undefined = this.entry(child, documents, mapPath);
            if (entry !== undefined) {
                children.push(entry);
            }
        }
        if (children.length === 0) {
            return;
        }
        const collectionType: string = this.getCollectionType(topicrefOrMap);
        if (parent !== undefined && (parent.linking === "normal" || parent.linking === "sourceonly")) {
            const linkpool: DitaElement = this.addLinkpool(parent.topic.element, collectionType + "-parent");
            for (const child of children) {
                this.addLink(linkpool, child, "child");
            }
        }
        if (collectionType === "family") {
            for (let index: number = 0; index < children.length; index++) {
                this.addLinkSet(children[index], parent, children.filter((_, sibling): boolean => sibling !== index), "family-members");
            }
        } else if (collectionType === "sequence") {
            for (let index: number = 0; index < children.length; index++) {
                const targets: Array<[CollectionEntry, string]> = [];
                if (parent !== undefined) {
                    targets.push([parent, "parent"]);
                }
                if (index > 0) {
                    targets.push([children[index - 1], "previous"]);
                }
                if (index + 1 < children.length) {
                    targets.push([children[index + 1], "next"]);
                }
                this.addLinkSet(children[index], undefined, targets, "sequence-members");
            }
        } else if (parent !== undefined) {
            for (const child of children) {
                this.addLinkSet(child, parent, [], collectionType + "-members");
            }
        }
    }

    private addLinkSet(
        source: CollectionEntry,
        parent: CollectionEntry | undefined,
        siblings: CollectionEntry[] | Array<[CollectionEntry, string]>,
        poolType: string
    ): void {
        if (source.linking !== "normal" && source.linking !== "sourceonly") {
            return;
        }
        const targets: Array<[CollectionEntry, string]> = [];
        if (parent !== undefined) {
            targets.push([parent, "parent"]);
        }
        for (const sibling of siblings) {
            targets.push(Array.isArray(sibling) ? sibling : [sibling, "sibling"]);
        }
        const linkpool: DitaElement = this.addLinkpool(source.topic.element, poolType);
        for (const [target, role] of targets) {
            this.addLink(linkpool, target, role);
        }
    }

    private addLinkpool(topic: DitaElement, poolType: string): DitaElement {
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
        linkpool.setAttribute(new XMLAttribute("mapkeyref", this.mapHref + " type=" + poolType));
        relatedLinks.setContent([linkpool, ...relatedLinks.getContent()]);
        return linkpool;
    }

    private addLink(linkpool: DitaElement, target: CollectionEntry, role: string): void {
        if (target.linking !== "normal" && target.linking !== "targetonly") {
            return;
        }
        const link: DitaElement = new DitaElement("link");
        link.setAttribute(new XMLAttribute("class", "- topic/link "));
        link.setAttribute(new XMLAttribute("href", target.href));
        link.setAttribute(new XMLAttribute("scope", "local"));
        link.setAttribute(new XMLAttribute("format", "dita"));
        link.setAttribute(new XMLAttribute("role", role));
        if (target.linktext !== undefined) {
            const linktext: DitaElement = DitaUtils.cloneElement(target.linktext);
            linktext.setAttribute(new XMLAttribute("class", "- topic/linktext "));
            link.addElement(linktext);
        }
        if (target.shortdesc !== undefined) {
            const desc: DitaElement = new DitaElement("desc");
            desc.setAttribute(new XMLAttribute("class", "- topic/desc "));
            desc.setContent(target.shortdesc.getContent().map((node: XMLNode): XMLNode =>
                node instanceof DitaElement ? DitaUtils.cloneElement(node) : node
            ));
            link.addElement(desc);
        }
        linkpool.addElement(link);
    }

    private entry(element: DitaElement, documents: LoadedDocuments, mapPath: string): CollectionEntry | undefined {
        const href: string | undefined = this.getAttribute(element, "href");
        if (href === undefined) {
            return undefined;
        }
        const scope: string = DitaUtils.getScope(element, href);
        const format: string | undefined = DitaUtils.getFormat(element, href, scope);
        if (format === undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(this.diagnostics.i18n.getString("Filter", "missingAttribute"), ["format"]),
                mapPath
            );
            return undefined;
        }
        const linkingValue: string | undefined = this.getAttribute(element, "linking");
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
        if (local && topic === undefined && pointsOutside) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("LinkGenerator", "pointsOutsidePreprocessedTopics"),
                    [href]
                ),
                mapPath
            );
        }
        if (topic === undefined) {
            return undefined;
        }
        const resolvedHref: string = topic.getHref() + (elementId === undefined ? "" : "/" + URIComponent.quoteFragment(elementId));
        return {
            topic,
            href: resolvedHref,
            linking,
            linktext,
            shortdesc
        };
    }

    private getAttribute(element: DitaElement, name: string): string | undefined {
        return DitaUtils.getNonEmptyAttribute(element, name);
    }

    private getCollectionType(element: DitaElement): string {
        const value: string | undefined = this.getAttribute(element, "collection-type");
        return value === "sequence" || value === "family" || value === "choice" || value === "unordered"
            ? value
            : "unordered";
    }
}