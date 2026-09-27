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

import { ProcessingInstruction, XMLNode } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { URIComponent } from "../utils/URIComponent.js";
import { KeyDefinition } from "./KeyDefinition.js";
import { KeySpace } from "./KeySpace.js";
import { LoadedDocument, LoadedDocumentType } from "./LoadedDocument.js";
import type { LoadedDocuments } from "./LoadedDocuments.js";
import { LoadedTopic } from "./LoadedTopic.js";

export class KeySpaces {
    readonly rootKeySpace: KeySpace;
    private readonly keySpaces: Map<string, KeySpace> = new Map<string, KeySpace>();
    private readonly topicToKeySpace: Map<string, KeySpace> = new Map<string, KeySpace>();
    private readonly elementToKeySpace: WeakMap<DitaElement, KeySpace> = new WeakMap<DitaElement, KeySpace>();

    constructor() {
        this.rootKeySpace = new KeySpace("0");
        this.keySpaces.set(this.rootKeySpace.id, this.rootKeySpace);
    }

    add(keySpace: KeySpace): void {
        this.keySpaces.set(keySpace.id, keySpace);
    }

    getRootKeySpace(): KeySpace {
        return this.rootKeySpace;
    }

    getKeySpaceById(id: string): KeySpace | undefined {
        return this.keySpaces.get(id);
    }

    getAllKeySpaces(): KeySpace[] {
        return [...this.keySpaces.values()];
    }

    toString(): string {
        const lines: string[] = [];
        this.appendKeySpace(this.rootKeySpace, false, lines);
        if (this.topicToKeySpace.size > 0) {
            lines.push("Topic URI to key space:");
            for (const [topic, keySpace] of this.topicToKeySpace) {
                lines.push(topic + "=" + keySpace.id);
            }
        }
        return lines.join("\n");
    }

    mapTopicToKeySpace(topicLocation: string, keySpace: KeySpace): void {
        this.topicToKeySpace.set(topicLocation, keySpace);
    }

    mapElementToKeySpace(element: DitaElement, keySpace: KeySpace): void {
        this.elementToKeySpace.set(element, keySpace);
    }

    getElementKeySpace(element: DitaElement): KeySpace {
        const registered: KeySpace | undefined = this.elementToKeySpace.get(element);
        if (registered !== undefined) {
            return registered;
        }
        let insideTopic: boolean = false;
        let ancestor: DitaElement | undefined = element;
        while (ancestor !== undefined) {
            if (DitaUtils.hasClass(ancestor, "topic/topic")) {
                insideTopic = true;
                break;
            }
            ancestor = ancestor.getParent();
        }
        if (insideTopic) {
            let current: DitaElement | undefined = element.getParent();
            while (current !== undefined) {
                const keySpace: KeySpace | undefined = this.elementToKeySpace.get(current);
                if (keySpace !== undefined) {
                    return keySpace;
                }
                current = current.getParent();
            }
            return this.rootKeySpace;
        }
        return this.findMapKeySpace(element) ?? this.rootKeySpace;
    }

    private findMapKeySpace(element: DitaElement): KeySpace | undefined {
        let current: DitaElement | undefined = element;
        while (current !== undefined) {
            let keySpaceId: string | undefined = DitaUtils.getNonEmptyAttribute(current, "ditac:keySpace");
            if (keySpaceId === undefined) {
                keySpaceId = this.findGroupKeySpaceId(current);
            }
            if (keySpaceId !== undefined) {
                return this.getKeySpaceById(keySpaceId);
            }
            current = current.getParent();
        }
        return undefined;
    }

    private findGroupKeySpaceId(element: DitaElement): string | undefined {
        const parent: DitaElement | undefined = element.getParent();
        if (parent === undefined) {
            return undefined;
        }
        const content: XMLNode[] = parent.getContent();
        let nesting: number = 0;
        for (let index: number = content.indexOf(element) - 1; index >= 0; index--) {
            const node: XMLNode = content[index];
            if (node instanceof ProcessingInstruction) {
                if (node.getTarget() === "ditac-end-group") {
                    nesting++;
                } else if (node.getTarget() === "ditac-begin-group") {
                    if (nesting > 0) {
                        nesting--;
                    } else {
                        return this.getPseudoAttribute(node.getData(), "ditac:keySpace");
                    }
                }
            }
        }
        return undefined;
    }

    getTopicKeySpace(topicLocation: string): KeySpace {
        return this.topicToKeySpace.get(topicLocation) ?? this.rootKeySpace;
    }

    lookupKeyDefinition(keySpace: KeySpace, key: string): KeyDefinition | undefined {
        const hierarchy: KeySpace[] = [];
        let current: KeySpace | undefined = keySpace;
        while (current !== undefined) {
            hierarchy.push(current);
            current = current.getParentKeySpace();
        }
        for (let index: number = hierarchy.length - 1; index >= 0; index--) {
            const definition: KeyDefinition | undefined = hierarchy[index].get(key);
            if (definition !== undefined) {
                return definition;
            }
        }
        return undefined;
    }

    resolveReference(keySpace: KeySpace, reference: string): { keySpace: KeySpace; key: string; fragment?: string } | undefined {
        const slashIndex: number = reference.indexOf("/");
        const key: string = slashIndex < 0 ? reference : reference.slice(0, slashIndex);
        const fragment: string | undefined = slashIndex < 0 ? undefined : reference.slice(slashIndex + 1);
        if (!DitaUtils.isValidKey(key) || (fragment !== undefined && !DitaUtils.isValidId(fragment))) {
            return undefined;
        }
        return { keySpace, key, fragment };
    }

    get(key: string, context: DitaElement): KeyDefinition | undefined {
        return this.lookupKeyDefinition(this.getElementKeySpace(context), key);
    }

    getHref(key: string, context: DitaElement): string | undefined {
        return this.get(key, context)?.getAttribute("href");
    }

    mapTopicsToKeySpaces(root: DitaElement, loadedDocuments: LoadedDocuments, mapPath: string): void {
        this.topicToKeySpace.clear();
        this.mapTopicrefTree(root, loadedDocuments, mapPath, [this.rootKeySpace]);
    }

    private mapTopicrefTree(
        element: DitaElement,
        loadedDocuments: LoadedDocuments,
        mapPath: string,
        keySpaceStack: KeySpace[]
    ): void {
        for (const node of element.getContent()) {
            if (node instanceof ProcessingInstruction) {
                if (node.getTarget() === "ditac-begin-group") {
                    const keySpaceId: string | undefined = this.getPseudoAttribute(node.getData(), "ditac:keySpace");
                    const keySpace: KeySpace | undefined = keySpaceId === undefined
                        ? undefined
                        : this.getKeySpaceById(keySpaceId);
                    if (keySpace === undefined) {
                        throw new Error(
                            mapPath + ": " +
                            loadedDocuments.diagnostics.i18n.format(
                                loadedDocuments.diagnostics.i18n.getString("KeySpaces", "unknownKeySpace"),
                                [keySpaceId ?? ""]
                            )
                        );
                    }
                    keySpaceStack.push(keySpace);
                } else if (node.getTarget() === "ditac-end-group" && keySpaceStack.length > 1) {
                    keySpaceStack.pop();
                }
                continue;
            }
            if (!(node instanceof DitaElement)) {
                continue;
            }
            let pushedKeySpace: boolean = false;
            const keySpaceId: string | undefined = DitaUtils.getNonEmptyAttribute(node, "ditac:keySpace");
            if (keySpaceId !== undefined) {
                const keySpace: KeySpace | undefined = this.getKeySpaceById(keySpaceId);
                if (keySpace === undefined) {
                    throw new Error(
                        mapPath + ": " +
                        loadedDocuments.diagnostics.i18n.format(
                            loadedDocuments.diagnostics.i18n.getString("KeySpaces", "unknownKeySpace"),
                            [keySpaceId]
                        )
                    );
                }
                keySpaceStack.push(keySpace);
                pushedKeySpace = true;
            }
            if (DitaUtils.hasClass(node, "map/topicref")) {
                this.mapTopicref(node, loadedDocuments, mapPath, keySpaceStack[keySpaceStack.length - 1]);
            }
            this.mapTopicrefTree(node, loadedDocuments, mapPath, keySpaceStack);
            if (pushedKeySpace) {
                keySpaceStack.pop();
            }
        }
    }

    private mapTopicref(
        topicref: DitaElement,
        loadedDocuments: LoadedDocuments,
        mapPath: string,
        keySpace: KeySpace
    ): void {
        const href: string | undefined = DitaUtils.getLocalTopicURL(topicref, loadedDocuments.diagnostics.i18n);
        if (href === undefined) {
            return;
        }
        const parts: string[] = href.split("#", 2);
        const topicPath: string = DitaUtils.resolveDocumentPath(mapPath, parts[0].split("?", 1)[0]);
        const sourcePath: string = KeySpaces.getOriginalTopicURL(topicref, topicPath, mapPath);
        let document: LoadedDocument;
        try {
            document = loadedDocuments.load(sourcePath, false);
        } catch (error: unknown) {
            throw new Error(mapPath + ": " + loadedDocuments.diagnostics.i18n.format(
                loadedDocuments.diagnostics.i18n.getString("MapSimplifier", "cannotLoad"),
                [sourcePath, error instanceof Error ? error.message : String(error)]
            ));
        }
        if (document.type !== LoadedDocumentType.TOPIC && document.type !== LoadedDocumentType.MULTI_TOPIC) {
            return;
        }
        const topicId: string | undefined = parts[1] === undefined
            ? undefined
            : URIComponent.decode(parts[1].split("/", 1)[0]);
        const selectedTopic: LoadedTopic | undefined = topicId === undefined
            ? document.getFirstTopic()
            : document.findTopicById(topicId);
        if (selectedTopic === undefined) {
            if (topicId !== undefined) {
                throw new Error(mapPath + ": " + loadedDocuments.diagnostics.i18n.format(
                    loadedDocuments.diagnostics.i18n.getString("Chunker", "topicNotFound"),
                    [topicId, document.path]
                ));
            }
            return;
        }
        const selection: string = this.getKeySpaceSelection(href, DitaUtils.getNonEmptyAttribute(topicref, "chunk"));
        if (document.getSingleTopic() !== undefined) {
            this.mapBranchToKeySpaces(topicPath, selectedTopic, keySpace, false);
        } else if (selection === "select-document") {
            this.mapDocumentToKeySpaces(topicPath, document.getTopics(), keySpace);
        } else {
            this.mapBranchToKeySpaces(topicPath, selectedTopic, keySpace, selection === "select-branch");
        }
    }

    private getKeySpaceSelection(href: string, chunk: string | undefined): string {
        let selection: string = href.includes("#") ? "select-topic" : "select-document";
        if (chunk !== undefined) {
            if (chunk.includes("select-document")) {
                selection = "select-document";
            } else if (chunk.includes("select-branch")) {
                selection = "select-branch";
            } else if (chunk.includes("select-topic")) {
                selection = "select-topic";
            }
        }
        return selection;
    }


    private mapBranchToKeySpaces(documentPath: string, topic: LoadedTopic, keySpace: KeySpace, includeNested: boolean): void {
        this.mapTopicToKeySpace(URIComponent.setFragment(documentPath, topic.topicId), keySpace);
        if (!includeNested) {
            return;
        }
        for (const nestedTopic of topic.getNestedTopics()) {
            this.mapBranchToKeySpaces(documentPath, nestedTopic, keySpace, true);
        }
    }

    private mapDocumentToKeySpaces(documentPath: string, topics: LoadedTopic[], keySpace: KeySpace): void {
        for (const topic of topics) {
            this.mapBranchToKeySpaces(documentPath, topic, keySpace, true);
        }
    }

    static getOriginalTopicURL(topicref: DitaElement, fallback: string, mapPath: string): string {
        const copyOf: string | undefined = DitaUtils.getNonEmptyAttribute(topicref, "ditac:copyOf");
        return copyOf === undefined ? fallback : DitaUtils.resolveDocumentPath(mapPath, copyOf.split("#", 1)[0]);
    }

    private getPseudoAttribute(data: string, name: string): string | undefined {
        const escapedName: string = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match: RegExpMatchArray | null = data.match(new RegExp("(?:^|\\s)" + escapedName + "=\\\"([^\\\"]*)\\\""));
        return match === null || match[1].trim().length === 0 ? undefined : match[1].trim();
    }

    private appendKeySpace(keySpace: KeySpace, details: boolean, lines: string[]): void {
        lines.push("---");
        lines.push(keySpace.toString(details));
        lines.push("---");
        for (const child of keySpace.getChildKeySpaces()) {
            this.appendKeySpace(child, details, lines);
        }
    }
}