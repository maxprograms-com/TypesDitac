/*
 * Portions Copyright (c) 2017-2022 XMLmind Software. All rights reserved.
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

import { basename, extname } from "node:path";
import { XMLAttribute, XMLNode } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { URIComponent } from "../utils/URIComponent.js";
import { Chunk } from "./Chunk.js";
import { ChunkEntry, ChunkEntryType, getTopicrefListType, getTopicrefTocType, TocType } from "./ChunkEntry.js";
import { LoadedDocument, LoadedDocumentType } from "./LoadedDocument.js";
import { LoadedDocuments } from "./LoadedDocuments.js";
import { LoadedTopic } from "./LoadedTopic.js";
import { TOCInfo } from "./TOCInfo.js";
import { WrapTopicrefTitle } from "./WrapTopicrefTitle.js";

type Select = "topic" | "branch" | "document";

export interface ChunkerResult {
    readonly chunks: Chunk[];
    readonly topicChunks: Map<LoadedTopic, Chunk>;
}

export class Chunker {
    readonly defaultPolicyIsByTopic: boolean;
    readonly defaultRootName: string | undefined;
    private readonly documents: LoadedDocuments;
    private readonly diagnostics: DiagnosticLog;
    private readonly mapPath: string;

    private root: DitaElement | undefined;
    private chunkStack: Chunk[] = [];
    private chunkList: Chunk[] = [];
    private rootNames: Set<string> = new Set();
    private mainMapRootName: string | undefined;
    private radicalNameCounter: number = 0;
    private readonly topicChunks: Map<LoadedTopic, Chunk> = new Map();
    private readonly topicrefInfo: Map<DitaElement, TOCInfo> = new Map();

    constructor(byTopic: boolean, rootName: string | undefined, documents: LoadedDocuments, diagnostics: DiagnosticLog, mapPath: string) {
        this.defaultPolicyIsByTopic = byTopic;
        this.defaultRootName = rootName;
        this.documents = documents;
        this.diagnostics = diagnostics;
        this.mapPath = mapPath;
    }

    processMap(root: DitaElement): ChunkerResult {
        this.root = root;
        this.chunkStack = [];
        this.chunkList = [];
        this.rootNames = new Set();

        this.visit(root);

        if (this.chunkList.length === 0) {
            throw new Error(this.mapPath + ": " + this.diagnostics.i18n.getString("Chunker", "noChunks"));
        }

        return { chunks: this.chunkList, topicChunks: this.topicChunks };
    }

    private process(node: DitaElement): void {
        let index: number = 0;
        for (; ;) {
            const children: DitaElement[] = node.getChildren();
            if (index >= children.length) {
                break;
            }
            this.visit(children[index]);
            index++;
        }
    }

    private visit(childElement: DitaElement): void {
        if (!DitaUtils.hasClass(childElement, "map/topicref") && !DitaUtils.hasClass(childElement, "map/map")) {
            return;
        }

        const chunkValue: string | undefined = childElement.getAttribute("chunk")?.getValue();
        let pushChunk: boolean = chunkValue !== undefined && chunkValue.includes("to-content");
        let topChunk: Chunk | undefined;

        if (pushChunk) {
            topChunk = this.createChunk(childElement);
            if (topChunk !== undefined) {
                this.chunkStack.push(topChunk);
            } else {
                // Ignored topicref, e.g. scope=external.
                pushChunk = false;
                topChunk = this.getTopChunk();
            }
        } else {
            topChunk = this.getTopChunk();
        }

        if (topChunk === undefined) {
            this.addChunk(childElement);
        } else {
            this.addEntries(topChunk, childElement);
        }

        this.process(childElement);

        if (pushChunk) {
            this.chunkStack.pop();
            const newTop: Chunk | undefined = this.getTopChunk();
            if (newTop !== undefined) {
                // Replace the previous top chunk by an empty copy.
                this.chunkStack.pop();
                this.chunkStack.push(new Chunk(newTop.rawRootName));
            }
        // Otherwise, ignored topicref such as scope=external.
        }
    }

    private getTopChunk(): Chunk | undefined {
        return this.chunkStack.length === 0 ? undefined : this.chunkStack[this.chunkStack.length - 1];
    }

    private addChunk(element: DitaElement): void {
        let byTopic: boolean = this.defaultPolicyIsByTopic;
        const chunkValue: string | undefined = element.getAttribute("chunk")?.getValue();
        if (chunkValue !== undefined) {
            if (chunkValue.includes("by-topic")) {
                byTopic = true;
            } else if (chunkValue.includes("by-document")) {
                byTopic = false;
            }
        }

        if (byTopic) {
            this.expandTopicrefs(element);
        }

        const chunk: Chunk | undefined = this.createChunk(element);
        if (chunk !== undefined) {
            this.addEntries(chunk, element);
        }
    }

    private expandTopicrefs(element: DitaElement): void {
        const href: string | undefined = DitaUtils.getNonEmptyAttribute(element, "href");
        if (href === undefined) {
            return;
        }

        const parts: string[] = href.split("#", 2);
        const topicPath: string = DitaUtils.resolveDocumentPath(this.mapPath, parts[0].split("?", 1)[0]);
        const document: LoadedDocument | undefined = this.documents.get(topicPath);
        if (document === undefined ||
            (document.type !== LoadedDocumentType.TOPIC && document.type !== LoadedDocumentType.MULTI_TOPIC)) {
            return;
        }

        const topicId: string | undefined = parts[1] === undefined ? undefined : URIComponent.decode(parts[1].split("/", 1)[0]);
        let select: Select = topicId === undefined ? "document" : "topic";
        const value: string | undefined = element.getAttribute("chunk")?.getValue();
        if (value !== undefined) {
            if (value.includes("select-document")) {
                select = "document";
            } else if (value.includes("select-branch")) {
                select = "branch";
            } else if (value.includes("select-topic")) {
                select = "topic";
            }
        }

        let loadedTopic: LoadedTopic | undefined;
        if (topicId !== undefined) {
            loadedTopic = document.findTopicById(topicId);
            if (loadedTopic === undefined) {
                this.diagnostics.error(
                    this.diagnostics.i18n.format(this.diagnostics.i18n.getString("Chunker", "topicNotFound"), [topicId, document.path]),
                    this.mapPath
                );
                return;
            }
        } else {
            loadedTopic = document.getFirstTopic();
        }
        if (loadedTopic === undefined) {
            return;
        }

        switch (select) {
            case "topic":
                break;
            case "branch":
                if (loadedTopic.getNestedTopics().length > 0) {
                    this.expandBranch(loadedTopic, element);
                }
                break;
            case "document":
                if (document.getSingleTopic() === undefined) {
                    this.expandDocument(document, element);
                }
                break;
        }
    }

    private expandDocument(loadedDoc: LoadedDocument, anchor: DitaElement): void {
        const parent: DitaElement | undefined = anchor.getParent();
        if (parent === undefined) {
            return;
        }
        const before: DitaElement | undefined = anchor.getNextSiblingElement();

        const loadedTopics: LoadedTopic[] = loadedDoc.getTopics();
        for (let i: number = 0; i < loadedTopics.length; i++) {
            const loadedTopic: LoadedTopic = loadedTopics[i];

            let topicref: DitaElement;
            if (i > 0) {
                topicref = this.shallowCloneTopicref(anchor);
                this.insertBefore(parent, topicref, before);
            } else {
                topicref = anchor;
            }

            this.expandBranch(loadedTopic, topicref);
        }
    }

    private expandBranch(loadedTopic: LoadedTopic, anchor: DitaElement): void {
        anchor.setAttribute(new XMLAttribute("href", loadedTopic.getHref()));
        anchor.setAttribute(new XMLAttribute("chunk", "by-topic"));

        for (const nestedTopic of loadedTopic.getNestedTopics()) {
            const topicref: DitaElement = new DitaElement("topicref");
            topicref.setAttribute(new XMLAttribute("class", "- map/topicref "));
            anchor.addElement(topicref);
            this.expandBranch(nestedTopic, topicref);
        }
    }

    private createChunk(element: DitaElement): Chunk | undefined {
        let rootName: string | undefined;

        const copyTo: string | undefined = DitaUtils.getNonEmptyAttribute(element, "copy-to");
        const href: string | undefined = DitaUtils.getNonEmptyAttribute(element, "href");
        if (href === undefined) {
            // A map has no href. Attribute href may be omitted from all sorts of topicrefs; in
            // such case, consider the topicref as being a kind of topicgroup.
            rootName = copyTo === undefined ? this.computeDefaultRootName() : copyTo;
        } else {
            const parts: string[] = href.split("#", 2);
            const topicPath: string = DitaUtils.resolveDocumentPath(this.mapPath, parts[0].split("?", 1)[0]);
            const document: LoadedDocument | undefined = this.documents.get(topicPath);
            if (document !== undefined &&
                (document.type === LoadedDocumentType.TOPIC || document.type === LoadedDocumentType.MULTI_TOPIC)) {
                if (copyTo !== undefined) {
                    rootName = copyTo;
                } else {
                    const loadedDocBaseName: string = basename(document.path);
                    if (loadedDocBaseName.startsWith(WrapTopicrefTitle.BASENAME_PREFIX)) {
                        rootName = this.computeDefaultRootName();
                    } else {
                        let byTopic: boolean = this.defaultPolicyIsByTopic;
                        const value: string | undefined = element.getAttribute("chunk")?.getValue();
                        if (value !== undefined) {
                            if (value.includes("by-topic")) {
                                byTopic = true;
                            } else if (value.includes("by-document")) {
                                byTopic = false;
                            }
            // Otherwise, loadedDoc is of the wrong type, or scope=external: rootName stays undefined.
                        }

                        if (byTopic) {
                            const topicId: string | undefined = parts[1] === undefined ? undefined : URIComponent.decode(parts[1].split("/", 1)[0]);
                            const loadedTopic: LoadedTopic | undefined = topicId === undefined
                                ? document.getFirstTopic()
                                : document.findTopicById(topicId);
                            if (loadedTopic !== undefined) {
                                rootName = loadedTopic.topicId;
                            }
                        } else {
                            rootName = loadedDocBaseName;
                        }
                    }
                }
            }
        }

        return rootName === undefined ? undefined : new Chunk(rootName);
    }

    private computeDefaultRootName(): string {
        if (this.defaultRootName !== undefined) {
            return this.defaultRootName;
        }
        if (this.mainMapRootName === undefined) {
            this.mainMapRootName = basename(this.mapPath, extname(this.mapPath));
        }
        return this.mainMapRootName;
    }

    private addEntries(chunk: Chunk, element: DitaElement): void {
        const href: string | undefined = DitaUtils.getNonEmptyAttribute(element, "href");
        if (href === undefined) {
            if (DitaUtils.hasClass(element, "map/topicref")) {
                const entryType: ChunkEntryType | undefined = getTopicrefListType(element);
                if (entryType !== undefined) {
                    const info: TOCInfo = this.setTOCInfo(element);
                    this.addChunkEntry(chunk, entryType, info.getNumber(), info.role, info.navtitle, info.tocType, undefined);
                }
            }
            return;
        }

        const parts: string[] = href.split("#", 2);
        const topicPath: string = DitaUtils.resolveDocumentPath(this.mapPath, parts[0].split("?", 1)[0]);
        const document: LoadedDocument | undefined = this.documents.get(topicPath);
        if (document === undefined ||
            (document.type !== LoadedDocumentType.TOPIC && document.type !== LoadedDocumentType.MULTI_TOPIC)) {
            return;
        }

        const topicId: string | undefined = parts[1] === undefined ? undefined : URIComponent.decode(parts[1].split("/", 1)[0]);
        let select: Select = topicId === undefined ? "document" : "topic";
        const value: string | undefined = element.getAttribute("chunk")?.getValue();
        if (value !== undefined) {
            if (value.includes("select-document")) {
                select = "document";
            } else if (value.includes("select-branch")) {
                select = "branch";
            } else if (value.includes("select-topic")) {
                select = "topic";
            }
        }

        let loadedTopic: LoadedTopic | undefined;
        if (topicId !== undefined) {
            loadedTopic = document.findTopicById(topicId);
            if (loadedTopic === undefined) {
                this.diagnostics.error(
                    this.diagnostics.i18n.format(this.diagnostics.i18n.getString("Chunker", "topicNotFound"), [topicId, document.path]),
                    this.mapPath
                );
                return;
            }
        } else {
            loadedTopic = document.getFirstTopic();
        }
        if (loadedTopic === undefined) {
            return;
        }

        const info: TOCInfo = this.setTOCInfo(element);
        switch (select) {
            case "topic":
                if (!this.addTopic(chunk, info.getNumber(), info.role, info.navtitle, info.tocType, loadedTopic)) {
                    info.incrementNumber(-1);
                }
                break;
            case "branch":
                if (!this.addBranch(chunk, info.getNumber(), info.role, info.navtitle, info.tocType, loadedTopic)) {
                    info.incrementNumber(-1);
                }
                break;
            case "document": {
                const added: number = this.addDocument(chunk, info.getNumber(), info.role, info.navtitle, info.tocType, document);
                info.incrementNumber(added - 1);
                break;
            }
        }
    }

    private addDocument(chunk: Chunk, number: string[], role: string | undefined, navtitle: string | undefined, tocType: TocType, loadedDoc: LoadedDocument): number {
        let added: number = 0;

        const singleTopic: LoadedTopic | undefined = loadedDoc.getSingleTopic();
        if (singleTopic !== undefined) {
            if (this.addTopic(chunk, number, role, navtitle, tocType, singleTopic)) {
                added++;
            }
        } else {
            const topics: LoadedTopic[] = loadedDoc.getTopics();
            for (let i: number = 0; i < topics.length; i++) {
                const num: string[] = TOCInfo.incrementNumber(number, added);
                if (this.addBranch(chunk, num, role, i === 0 ? navtitle : undefined, tocType, topics[i])) {
                    added++;
                }
            }
        }

        return added;
    }

    private addBranch(chunk: Chunk, number: string[], role: string | undefined, navtitle: string | undefined, tocType: TocType, loadedTopic: LoadedTopic): boolean {
        if (!this.addTopic(chunk, number, role, navtitle, tocType, loadedTopic)) {
            return false;
        }

        const nestedTopics: LoadedTopic[] = loadedTopic.getNestedTopics();
        const subRole: string = DitaUtils.getSubRole(role);
        let j: number = 1;
        for (const nestedTopic of nestedTopics) {
            const num: string[] = [...number, TOCInfo.formatNumberSegment(subRole, j)];
            if (this.addBranch(chunk, num, subRole, undefined, tocType, nestedTopic)) {
                j++;
            }
        }
        return true;
    }

    private addTopic(chunk: Chunk, number: string[], role: string | undefined, navtitle: string | undefined, tocType: TocType, loadedTopic: LoadedTopic): boolean {
        if (loadedTopic.isExcluded()) {
            return false;
        }
        this.addChunkEntry(chunk, ChunkEntryType.TOPIC, number, role, navtitle, tocType, loadedTopic);
        return true;
    }

    private addChunkEntry(
        chunk: Chunk,
        type: ChunkEntryType,
        number: string[],
        role: string | undefined,
        navtitle: string | undefined,
        tocType: TocType,
        loadedTopic: LoadedTopic | undefined
    ): void {
        chunk.appendEntry(new ChunkEntry(chunk, type, number, role, navtitle, tocType, loadedTopic));
        if (loadedTopic !== undefined) {
            this.topicChunks.set(loadedTopic, chunk);
        }

        // First chunk filled with entries is first chunk added to the list.
        // An empty chunk will never be added to the list.
        if (!this.chunkList.includes(chunk)) {
            chunk.initRootName(this.uniqueRootName(chunk), this.diagnostics.i18n);
            this.chunkList.push(chunk);
        }
    }

    private uniqueRootName(chunk: Chunk): string {
        const defaultRootName: string = this.computeDefaultRootName();

        let name: string = chunk.rawRootName.trim();
        if (name.length === 0) {
            name = defaultRootName;
        } else if (defaultRootName !== name) {
            let pos: number = name.lastIndexOf("/");
            if (pos >= 0) {
                name = name.slice(pos + 1);
            }
            pos = name.lastIndexOf("\\");
            if (pos >= 0) {
                name = name.slice(pos + 1);
            }
            pos = name.lastIndexOf(".");
            if (pos > 0) {
                name = name.slice(0, pos);
            }
            if (name.length === 0) {
                name = defaultRootName;
            }
        }

        let name2: string = name;
        let counter: number = 2;
        while (this.rootNames.has(name2)) {
            if (counter > 100) {
                // Too many conflicts: fall back to a monotonically increasing counter for uniqueness.
                name2 = name + "-" + (++this.radicalNameCounter).toString(36);
                break;
            }
            name2 = name + "-" + (counter++).toString();
        }

        this.rootNames.add(name2);
        return name2;
    }

    private setTOCInfo(topicref: DitaElement): TOCInfo {
        const parent: DitaElement | undefined = topicref.getParent();
        if (parent === undefined || !DitaUtils.hasClass(topicref, "map/topicref")) {
            // Do not annotate the element.
            return TOCInfo.NO_INFO;
        }

        const role: string = this.roleFor(topicref);
        const parentInfo: TOCInfo | undefined = this.parentInfo(topicref);
        const index: number = this.nextIndex(topicref, role);

        const parentNumber: string[] = parentInfo === undefined ? [] : parentInfo.getNumber();
        const number: string[] = [...parentNumber, TOCInfo.formatNumberSegment(role, index)];

        const info: TOCInfo = new TOCInfo(number, role, DitaUtils.getTopicrefNavtitle(topicref), getTopicrefTocType(topicref));
        this.topicrefInfo.set(topicref, info);
        return info;
    }

    private roleFor(topicref: DitaElement): string {
        const parentInfo: TOCInfo | undefined = this.parentInfo(topicref);
        return parentInfo === undefined ? DitaUtils.getTopicrefRole(topicref) : DitaUtils.getSubRole(parentInfo.role);
    }

    private parentInfo(topicref: DitaElement): TOCInfo | undefined {
        let ancestor: DitaElement | undefined = DitaUtils.getTopicrefParent(topicref);
        while (ancestor !== undefined) {
            const info: TOCInfo | undefined = this.topicrefInfo.get(ancestor);
            if (info !== undefined) {
                return info;
            }
            ancestor = DitaUtils.getTopicrefParent(ancestor);
        }
        return undefined;
    }

    private nextIndex(topicref: DitaElement, role: string): number {
        let index: number = 1;
        let preceding: DitaElement | undefined = this.precedingNode(topicref);
        while (preceding !== undefined) {
            const precedingInfo: TOCInfo | undefined = this.topicrefInfo.get(preceding);
            if (precedingInfo !== undefined && precedingInfo.role === role) {
                index = TOCInfo.parseNumber(precedingInfo.getNumber()) + 1;
                break;
            }
            preceding = this.precedingNode(preceding);
        }
        return index;
    }

    private precedingNode(start: DitaElement): DitaElement | undefined {
        let node: DitaElement = start;
        for (; ;) {
            const previous: DitaElement | undefined = this.previousSibling(node);
            if (previous !== undefined) {
                let preceding: DitaElement | undefined = previous;
                let last: DitaElement = previous;
                while (preceding !== undefined) {
                    last = preceding;
                    if (this.topicrefInfo.has(preceding)) {
                        break;
                    }
                    const children: DitaElement[] = DitaUtils.getTopicrefChildren(preceding);
                    preceding = children.length > 0 ? children[children.length - 1] : undefined;
                }
                return last;
            }

            const parent: DitaElement | undefined = DitaUtils.getTopicrefParent(node);
            if (parent === undefined || this.topicrefInfo.has(parent)) {
                return undefined;
            }
            node = parent;
        }
    }

    private previousSibling(topicref: DitaElement): DitaElement | undefined {
        const parent: DitaElement | undefined = DitaUtils.getTopicrefParent(topicref);
        const siblings: DitaElement[] = parent !== undefined
            ? DitaUtils.getTopicrefChildren(parent)
            : (this.root === undefined ? [] : DitaUtils.getTopicrefChildren(this.root));
        const index: number = siblings.indexOf(topicref);
        return index > 0 ? siblings[index - 1] : undefined;
    }

    private shallowCloneTopicref(anchor: DitaElement): DitaElement {
        const clone: DitaElement = new DitaElement(anchor.getName());
        const clonedAttributes: XMLAttribute[] = anchor.getAttributes().map(
            (attribute: XMLAttribute): XMLAttribute => new XMLAttribute(attribute.getName(), attribute.getValue())
        );
        clone.setAttributes(clonedAttributes);
        return clone;
    }

    private insertBefore(parent: DitaElement, newChild: DitaElement, before: DitaElement | undefined): void {
        if (before === undefined) {
            parent.addElement(newChild);
            return;
        }
        const content: XMLNode[] = parent.getContent();
        const index: number = content.indexOf(before);
        if (index < 0) {
            parent.addElement(newChild);
            return;
        }
        content.splice(index, 0, newChild);
        parent.setContent(content);
    }

}
