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

import { TextNode, XMLAttribute, XMLNode } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { URIComponent } from "../utils/URIComponent.js";
import { LoadedDocument } from "./LoadedDocument.js";
import { LoadedDocuments } from "./LoadedDocuments.js";
import { LoadedTopic } from "./LoadedTopic.js";

interface NavtitleSource {
    readonly element?: DitaElement;
    readonly text?: string;
}

export class CopyMeta {
    private static readonly TOPIC_ELEMENTS: string[] = [
        "topic/title", "topic/titlealts", "topic/shortdesc", "topic/abstract",
        "topic/prolog", "topic/body", "topic/related-links", "topic/topic"
    ];

    private static readonly PROLOG_ELEMENTS: string[] = [
        "topic/author", "topic/source", "topic/publisher", "topic/copyright",
        "topic/critdates", "topic/permissions", "topic/metadata", "topic/resourceid",
        "topic/data", "topic/data-about", "topic/foreign", "topic/unknown"
    ];

    private static readonly PROLOG_ELEMENT_SINGLE: boolean[] = [
        false, true, true, false, true, true, false, false, false, false, false, false
    ];

    private static readonly METADATA_ELEMENTS: string[] = [
        "topic/audience", "topic/category", "topic/keywords", "topic/prodinfo", "topic/othermeta",
        "topic/data", "topic/data-about", "topic/foreign", "topic/unknown"
    ];

    private static readonly METADATA_ELEMENT_COUNT: number = CopyMeta.METADATA_ELEMENTS.length - 4;

    static processMap(map: DitaElement, documents: LoadedDocuments): void {
        const filterAttributes: string[] = DitaUtils.getFilterAttributes(map);
        const otherMetaAttributes: string[] = DitaUtils.getOtherMetaAttributes(map);
        const metaAttributes: string[] = [...filterAttributes, ...otherMetaAttributes];
        const metaAttributeIsSingle: boolean[] = [
            ...filterAttributes.map((_name: string, index: number): boolean => DitaUtils.filterAttributeIsSingle(index)),
            ...otherMetaAttributes.map((_name: string, index: number): boolean => DitaUtils.otherMetaAttributeIsSingle(index))
        ];
        const processed: Set<DitaElement> = new Set();
        this.processElement(map, metaAttributes, metaAttributeIsSingle, documents, processed);
    }

    private static processElement(
        element: DitaElement,
        metaAttributes: string[],
        metaAttributeIsSingle: boolean[],
        documents: LoadedDocuments,
        processed: Set<DitaElement>
    ): void {
        for (const child of element.getChildren()) {
            if (DitaUtils.hasClass(child, "map/topicref")) {
                const reference: { path: string; topicId?: string } | undefined = this.getLocalTopicReference(child);
                if (reference !== undefined) {
                    let loadedDoc: LoadedDocument | undefined;
                    try {
                        loadedDoc = documents.load(reference.path);
                    } catch {
                        loadedDoc = undefined;
                    }
                    if (loadedDoc !== undefined) {
                        const loadedTopic: LoadedTopic | undefined = reference.topicId === undefined
                            ? loadedDoc.getFirstTopic()
                            : loadedDoc.findTopicById(reference.topicId);
                        if (loadedTopic !== undefined && !processed.has(loadedTopic.element)) {
                            processed.add(loadedTopic.element);
                            this.copyMeta(child, metaAttributes, metaAttributeIsSingle, loadedTopic.element);
                        }
                    }
                }
            }
            this.processElement(child, metaAttributes, metaAttributeIsSingle, documents, processed);
        }
    }

    private static getLocalTopicReference(topicref: DitaElement): { path: string; topicId?: string } | undefined {
        const href: string | undefined = DitaUtils.getNonEmptyAttribute(topicref, "href");
        if (href === undefined) {
            return undefined;
        }
        const scope: string = DitaUtils.getScope(topicref, href);
        if (scope !== "local") {
            return undefined;
        }
        const format: string | undefined = DitaUtils.getFormat(topicref, href, scope);
        if (format !== "dita") {
            return undefined;
        }
        const parts: string[] = href.split("#", 2);
        return {
            path: parts[0],
            topicId: parts[1] === undefined ? undefined : URIComponent.decode(parts[1].split("/", 1)[0])
        };
    }


    private static copyMeta(
        topicref: DitaElement,
        metaAttributes: string[],
        metaAttributeIsSingle: boolean[],
        topic: DitaElement
    ): void {
        if (DitaUtils.getNonEmptyAttribute(topicref, "search") === "no") {
            topic.setAttribute(new XMLAttribute("ditac:search", "false"));
        }

        const topicmeta: DitaElement | undefined = DitaUtils.getChildByClass(topicref, "map/topicmeta");
        const lockmeta: boolean = !(topicmeta !== undefined && DitaUtils.getNonEmptyAttribute(topicmeta, "lockmeta") === "no");

        if (lockmeta) {
            this.copyAttributes(topicref, metaAttributes, metaAttributeIsSingle, topic);
            this.copySearchTitle(topicmeta, topic);
            if (topicmeta !== undefined) {
                this.copyElements(topicmeta, topic);
            }
        }

        if (DitaUtils.getNonEmptyAttribute(topicref, "locktitle") === "yes") {
            this.copyNavigationTitle(topicref, topic);
        }
    }

    private static copyAttributes(
        topicref: DitaElement,
        metaAttributes: string[],
        metaAttributeIsSingle: boolean[],
        topic: DitaElement
    ): void {
        for (let index: number = 0; index < metaAttributes.length; index++) {
            const attrName: string = metaAttributes[index];
            const mapValue: string | undefined = DitaUtils.getNonEmptyAttribute(topicref, attrName);
            if (mapValue === undefined) {
                continue;
            }
            const topicValue: string | undefined = DitaUtils.getNonEmptyAttribute(topic, attrName);
            if (topicValue === undefined || metaAttributeIsSingle[index]) {
                topic.setAttribute(new XMLAttribute(attrName, mapValue));
            } else {
                topic.setAttribute(new XMLAttribute(attrName, this.mergeAttributeValues(topicValue, mapValue)));
            }
        }
    }

    private static mergeAttributeValues(value1: string, value2: string): string {
        const values1: string[] = value1.split(/\s+/).filter((value: string): boolean => value.length > 0);
        for (const item of value2.split(/\s+/).filter((value: string): boolean => value.length > 0)) {
            if (!values1.includes(item)) {
                values1.push(item);
            }
        }
        return values1.join(" ");
    }

    private static copySearchTitle(topicmeta: DitaElement | undefined, topic: DitaElement): void {
        if (topicmeta === undefined) {
            return;
        }
        const mapSearchtitle: DitaElement | undefined = DitaUtils.getChildByClass(topicmeta, "map/searchtitle");
        if (mapSearchtitle === undefined) {
            return;
        }
        const clone: DitaElement = DitaUtils.cloneElement(mapSearchtitle);
        clone.setAttribute(new XMLAttribute("class", "- topic/searchtitle "));
        const titlealts: DitaElement = this.ensureHasTitlealts(topic);
        const existing: DitaElement | undefined = DitaUtils.getChildByClass(titlealts, "topic/searchtitle");
        if (existing === undefined) {
            this.insertBefore(titlealts, clone, undefined);
        } else {
            this.replaceChild(titlealts, clone, existing);
        }
    }

    private static ensureHasTitlealts(topic: DitaElement): DitaElement {
        const existing: DitaElement | undefined = DitaUtils.getChildByClass(topic, "topic/titlealts");
        if (existing !== undefined) {
            return existing;
        }
        const titlealts: DitaElement = new DitaElement("titlealts");
        titlealts.setAttribute(new XMLAttribute("class", "- topic/titlealts "));
        const before: DitaElement | undefined = DitaUtils.findChildByClassFrom(
            topic,
            CopyMeta.TOPIC_ELEMENTS.indexOf("topic/shortdesc"),
            CopyMeta.TOPIC_ELEMENTS
        );
        this.attachChild(topic, titlealts, before);
        return titlealts;
    }

    private static copyNavigationTitle(topicref: DitaElement, topic: DitaElement): void {
        const source: NavtitleSource | undefined = this.getNavtitle(topicref);
        if (source === undefined) {
            return;
        }
        let mapNavtitle: DitaElement;
        if (source.element !== undefined) {
            mapNavtitle = DitaUtils.cloneElement(source.element);
        } else {
            mapNavtitle = new DitaElement("navtitle");
            mapNavtitle.setAttribute(new XMLAttribute("class", "- topic/navtitle "));
            mapNavtitle.setContent([new TextNode(source.text as string)]);
        }
        const titlealts: DitaElement = this.ensureHasTitlealts(topic);
        const existing: DitaElement | undefined = DitaUtils.getChildByClass(titlealts, "topic/navtitle");
        if (existing === undefined) {
            this.insertBefore(titlealts, mapNavtitle, undefined);
        } else {
            this.replaceChild(titlealts, mapNavtitle, existing);
        }
    }

    private static getNavtitle(topicref: DitaElement): NavtitleSource | undefined {
        const topicmeta: DitaElement | undefined = DitaUtils.getChildByClass(topicref, "map/topicmeta");
        if (topicmeta !== undefined) {
            const navtitle: DitaElement | undefined = DitaUtils.getChildByClass(topicmeta, "topic/navtitle");
            if (navtitle !== undefined) {
                const text: string = DitaUtils.collapseWhitespace(DitaUtils.getTextContent(navtitle));
                if (text.length > 0) {
                    return { element: navtitle };
                }
            }
        }
        const attrText: string | undefined = DitaUtils.getNonEmptyAttribute(topicref, "navtitle");
        if (attrText !== undefined) {
            const collapsed: string = DitaUtils.collapseWhitespace(attrText);
            if (collapsed.length > 0) {
                return { text: collapsed };
            }
        }
        return undefined;
    }

    private static copyElements(topicmeta: DitaElement, topic: DitaElement): void {
        let prolog: DitaElement | undefined;
        for (let index: number = 0; index < CopyMeta.PROLOG_ELEMENTS.length; index++) {
            const className: string = CopyMeta.PROLOG_ELEMENTS[index];
            if (CopyMeta.PROLOG_ELEMENT_SINGLE[index]) {
                const mapMeta: DitaElement | undefined = DitaUtils.getChildByClass(topicmeta, className);
                if (mapMeta !== undefined) {
                    prolog = prolog ?? this.ensureHasProlog(topic);
                    const existing: DitaElement | undefined = DitaUtils.getChildByClass(prolog, className);
                    const before: DitaElement | undefined = DitaUtils.findChildByClassFrom(prolog, index, CopyMeta.PROLOG_ELEMENTS);
                    if (existing === undefined) {
                        this.insertBefore(prolog, mapMeta, before);
                    } else {
                        this.replaceChild(prolog, mapMeta, existing);
                    }
                }
            } else {
                const mapMeta: DitaElement[] = this.getChildrenByClass(topicmeta, className);
                if (mapMeta.length > 0) {
                    prolog = prolog ?? this.ensureHasProlog(topic);
                    const before: DitaElement | undefined = DitaUtils.findChildByClassFrom(prolog, index, CopyMeta.PROLOG_ELEMENTS);
                    this.insertChildrenBefore(prolog, mapMeta, before);
                }
            }
        }

        let metadata: DitaElement | undefined;
        for (let index: number = 0; index < CopyMeta.METADATA_ELEMENT_COUNT; index++) {
            const className: string = CopyMeta.METADATA_ELEMENTS[index];
            const mapMeta: DitaElement[] = this.getChildrenByClass(topicmeta, className);
            if (mapMeta.length > 0) {
                prolog = prolog ?? this.ensureHasProlog(topic);
                metadata = metadata ?? this.ensureHasMetadata(prolog);
                const before: DitaElement | undefined = DitaUtils.findChildByClassFrom(metadata, index, CopyMeta.METADATA_ELEMENTS);
                this.insertChildrenBefore(metadata, mapMeta, before);
            }
        }
    }

    private static ensureHasProlog(topic: DitaElement): DitaElement {
        const existing: DitaElement | undefined = DitaUtils.getChildByClass(topic, "topic/prolog");
        if (existing !== undefined) {
            return existing;
        }
        const prolog: DitaElement = new DitaElement("prolog");
        prolog.setAttribute(new XMLAttribute("class", "- topic/prolog "));
        const before: DitaElement | undefined = DitaUtils.findChildByClassFrom(
            topic,
            CopyMeta.TOPIC_ELEMENTS.indexOf("topic/body"),
            CopyMeta.TOPIC_ELEMENTS
        );
        this.attachChild(topic, prolog, before);
        return prolog;
    }

    private static ensureHasMetadata(prolog: DitaElement): DitaElement {
        const existing: DitaElement | undefined = DitaUtils.getChildByClass(prolog, "topic/metadata");
        if (existing !== undefined) {
            return existing;
        }
        const metadata: DitaElement = new DitaElement("metadata");
        metadata.setAttribute(new XMLAttribute("class", "- topic/metadata "));
        const before: DitaElement | undefined = DitaUtils.findChildByClassFrom(
            prolog,
            CopyMeta.PROLOG_ELEMENTS.indexOf("topic/resourceid"),
            CopyMeta.PROLOG_ELEMENTS
        );
        this.attachChild(prolog, metadata, before);
        return metadata;
    }

    private static attachChild(parent: DitaElement, child: DitaElement, before: DitaElement | undefined): void {
        const content: XMLNode[] = parent.getContent();
        const index: number = before === undefined ? content.length : content.indexOf(before);
        content.splice(index, 0, child);
        parent.setContent(content);
    }

    private static getChildrenByClass(element: DitaElement, className: string): DitaElement[] {
        return element.getChildren().filter((child: DitaElement): boolean => DitaUtils.hasClass(child, className));
    }

    private static insertBefore(parent: DitaElement, newChild: DitaElement, before: DitaElement | undefined): void {
        const clone: DitaElement = DitaUtils.cloneElement(newChild);
        const content: XMLNode[] = parent.getContent();
        const index: number = before === undefined ? content.length : content.indexOf(before);
        content.splice(index, 0, clone);
        parent.setContent(content);
    }

    private static insertChildrenBefore(parent: DitaElement, newChildren: DitaElement[], before: DitaElement | undefined): void {
        const clones: DitaElement[] = newChildren.map((child: DitaElement): DitaElement => DitaUtils.cloneElement(child));
        const content: XMLNode[] = parent.getContent();
        const index: number = before === undefined ? content.length : content.indexOf(before);
        content.splice(index, 0, ...clones);
        parent.setContent(content);
    }

    private static replaceChild(parent: DitaElement, newChild: DitaElement, oldChild: DitaElement): void {
        const clone: DitaElement = DitaUtils.cloneElement(newChild);
        const content: XMLNode[] = parent.getContent();
        const index: number = content.indexOf(oldChild);
        if (index >= 0) {
            content.splice(index, 1, clone);
            parent.setContent(content);
        }
    }
}
