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

import { ProcessingInstruction, TextNode, XMLAttribute, XMLNode } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { LoadedDocument } from "./LoadedDocument.js";
import { LoadedDocuments } from "./LoadedDocuments.js";

export class InclusionException extends Error {
}

export abstract class Incl {
    readonly directiveElement: DitaElement;
    readonly sourcePath: string;
    id: number[] = [];
    replacementNodes: XMLNode[] | undefined;
    appendedNodes: XMLNode[] | undefined;

    protected constructor(directiveElement: DitaElement, sourcePath: string) {
        this.directiveElement = directiveElement;
        this.sourcePath = sourcePath;
    }
}

export abstract class Includer {
    private static readonly MAX_ITERATIONS: number = 100;

    readonly documents: LoadedDocuments;
    readonly diagnostics: DiagnosticLog;

    private readonly docList: LoadedDocument[] = [];
    private readonly processLists: Map<LoadedDocument, Incl[]> = new Map<LoadedDocument, Incl[]>();
    private inclIds: WeakMap<DitaElement, number> = new WeakMap<DitaElement, number>();
    private workingSet: LoadedDocuments;
    private processedDocCount: number = 0;
    private inclCounter: number = 0;

    protected constructor(documents: LoadedDocuments, diagnostics: DiagnosticLog) {
        this.documents = documents;
        this.diagnostics = diagnostics;
        this.workingSet = documents;
    }

    process(loadedDocuments: LoadedDocument[]): void {
        this.workingSet = new LoadedDocuments(this.documents.loader, this.diagnostics, this.documents.keySpaces);
        this.workingSet.setValidating(this.documents.isValidating());
        this.inclIds = new WeakMap<DitaElement, number>();
        this.docList.length = 0;
        this.processLists.clear();
        this.processedDocCount = 0;
        for (const loadedDocument of loadedDocuments) {
            const doc: LoadedDocument = this.workingSet.put(loadedDocument.path, loadedDocument.document, false);
            this.processLists.set(doc, []);
            this.docList.push(doc);
            this.processedDocCount++;
            this.collectIncludes(undefined, doc);
        }
        this.runToFixpoint();
    }

    protected abstract detectInclusion(element: DitaElement, sourcePath: string): Incl | undefined;

    protected abstract fetchIncluded(incl: Incl): void;

    protected fetchDoc(path: string): LoadedDocument {
        let doc: LoadedDocument | undefined = this.workingSet.get(path);
        if (doc === undefined) {
            doc = this.workingSet.load(path);
            this.processLists.set(doc, []);
            this.docList.push(doc);
            this.collectIncludes(undefined, doc);
        }
        return doc;
    }

    protected cloneElement(source: DitaElement): DitaElement {
        const clone: DitaElement = DitaUtils.cloneElement(source);
        this.copyInclIds(source, clone);
        return clone;
    }

    protected cloneNode(source: XMLNode): XMLNode {
        if (source instanceof DitaElement) {
            return this.cloneElement(source);
        }
        if (source instanceof ProcessingInstruction) {
            return new ProcessingInstruction(source.getTarget(), source.getData());
        }
        if (source instanceof TextNode) {
            return new TextNode(source.getValue());
        }
        return source;
    }

    protected copyInclId(from: DitaElement, to: DitaElement): void {
        const id: number | undefined = this.inclIds.get(from);
        if (id !== undefined) {
            this.inclIds.set(to, id);
        }
    }

    private copyInclIds(from: DitaElement, to: DitaElement): void {
        this.copyInclId(from, to);
        const fromChildren: DitaElement[] = from.getChildren();
        const toChildren: DitaElement[] = to.getChildren();
        for (let index: number = 0; index < fromChildren.length && index < toChildren.length; index++) {
            this.copyInclIds(fromChildren[index], toChildren[index]);
        }
    }

    private collectIncludes(parentInclId: number[] | undefined, doc: LoadedDocument): boolean {
        const root: DitaElement | undefined = DitaUtils.getRoot(doc.document);
        return root === undefined ? true : this.collectIncludesInRange(parentInclId, [root], doc);
    }

    private collectIncludesInRange(parentInclId: number[] | undefined, nodes: XMLNode[], doc: LoadedDocument): boolean {
        for (const node of nodes) {
            if (!(node instanceof DitaElement)) {
                continue;
            }
            const incl: Incl | undefined = this.detectInclusion(node, doc.path);
            if (incl !== undefined) {
                const inclId: number[] | undefined = this.newInclId(parentInclId, node);
                if (inclId === undefined) {
                    return false;
                }
                incl.id = inclId;
                this.processLists.get(doc)?.push(incl);
            } else if (!this.collectIncludesInRange(parentInclId, node.getChildren(), doc)) {
                return false;
            }
        }
        return true;
    }

    private newInclId(parentInclId: number[] | undefined, directive: DitaElement): number[] | undefined {
        let id: number;
        const existing: number | undefined = this.inclIds.get(directive);
        if (existing === undefined) {
            id = this.inclCounter++;
            this.inclIds.set(directive, id);
        } else {
            id = existing;
            if (parentInclId !== undefined) {
                for (let index: number = parentInclId.length - 1; index >= 0; index--) {
                    if (parentInclId[index] === id) {
                        return undefined;
                    }
                }
            }
        }
        return parentInclId === undefined ? [id] : [...parentInclId, id];
    }

    private runToFixpoint(): void {
        let lastIteration: boolean = false;
        let iteration: number = 0;
        for (; iteration < Includer.MAX_ITERATIONS; iteration++) {
            let remainDocCount: number = this.processedDocCount;
            const initialDocCount: number = this.docList.length;
            let changeCount: number = 0;

            for (let index: number = 0; index < this.processedDocCount; index++) {
                const doc: LoadedDocument = this.docList[index];
                const processList: Incl[] = this.processLists.get(doc) ?? [];
                if (processList.length > 0 && this.processDoc(doc, lastIteration)) {
                    changeCount++;
                }
                if ((this.processLists.get(doc) ?? []).length === 0) {
                    remainDocCount--;
                }
            }

            if (remainDocCount === 0) {
                break;
            }

            const docCount: number = this.docList.length;
            for (let index: number = this.processedDocCount; index < docCount; index++) {
                const doc: LoadedDocument = this.docList[index];
                const processList: Incl[] = this.processLists.get(doc) ?? [];
                if (processList.length > 0 && this.processDoc(doc, lastIteration)) {
                    changeCount++;
                }
            }

            if (lastIteration) {
                break;
            }
            if (this.docList.length > initialDocCount) {
                changeCount++;
            }
            if (changeCount === 0) {
                lastIteration = true;
            }
        }

        let message: string | undefined;
        for (let index: number = 0; index < this.processedDocCount; index++) {
            const doc: LoadedDocument = this.docList[index];
            if ((this.processLists.get(doc) ?? []).length > 0) {
                message = this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("Includer", "notFullyProcessed"),
                    [(iteration + 1).toString()]
                );
                this.diagnostics.error(message, doc.path);
            }
        }
        if (message !== undefined) {
            throw new Error(message);
        }
    }

    private processDoc(doc: LoadedDocument, lastIteration: boolean): boolean {
        const processList: Incl[] = this.processLists.get(doc) ?? [];
        const incls: Incl[] = processList.slice();
        processList.length = 0;

        let removeCount: number = incls.length;
        let retryCount: number = 0;

        for (const incl of incls) {
            try {
                this.fetchIncluded(incl);
            } catch (error: unknown) {
                if (!(error instanceof InclusionException)) {
                    throw error;
                }
                if (lastIteration) {
                    this.reportError(incl, this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("Includer", "cannotFetchIncludedNodes"),
                        [error.message]
                    ));
                }
                processList.push(incl);
                removeCount--;
                retryCount++;
            }

            if (incl.replacementNodes !== undefined && incl.replacementNodes.length === 0) {
                this.reportError(incl, this.diagnostics.i18n.getString("Includer", "noReplacementNodes"));
                incl.replacementNodes = undefined;
                incl.appendedNodes = undefined;
            }
        }

        // Replacement is a separate pass so fetchIncluded() never runs against a document being modified.
        for (const incl of incls) {
            const replacement: XMLNode[] | undefined = incl.replacementNodes;
            const appended: XMLNode[] | undefined = incl.appendedNodes;
            incl.replacementNodes = undefined;
            incl.appendedNodes = undefined;

            if (replacement !== undefined) {
                const parent: DitaElement | undefined = incl.directiveElement.getParent();
                if (parent !== undefined) {
                    this.replaceSingle(parent, incl.directiveElement, replacement);
                    if (!this.collectIncludesInRange(incl.id, replacement, doc)) {
                        this.replaceRange(parent, replacement, [incl.directiveElement]);
                        this.reportError(incl, this.diagnostics.i18n.getString("Includer", "inclusionLoop"));
                    }
                } else if (DitaUtils.getRoot(doc.document) === incl.directiveElement) {
                    const resolved: XMLNode = replacement[0];
                    if (replacement.length !== 1 || !(resolved instanceof DitaElement)) {
                        throw new Error(this.diagnostics.i18n.getString("Includer", "cannotReplaceRoot"));
                    }
                    const attributes: XMLAttribute[] = [...incl.directiveElement.getAttributes()];
                    const content: XMLNode[] = [...incl.directiveElement.getContent()];
                    incl.directiveElement.setAttributes([...resolved.getAttributes()]);
                    incl.directiveElement.setContent([...resolved.getContent()]);
                    this.inclIds.delete(incl.directiveElement);
                    this.copyInclId(resolved, incl.directiveElement);
                    if (!this.collectIncludesInRange(incl.id, [incl.directiveElement], doc)) {
                        incl.directiveElement.setAttributes(attributes);
                        incl.directiveElement.setContent(content);
                        this.reportError(incl, this.diagnostics.i18n.getString("Includer", "inclusionLoop"));
                    }
                }
            }

            if (appended !== undefined) {
                let insertParent: DitaElement | undefined;
                let insertIndex: number = -1;
                if (replacement === undefined) {
                    // Happens with map transclusion where the included map only contains reltables.
                    insertParent = incl.directiveElement.getParent();
                    if (insertParent !== undefined) {
                        const content: XMLNode[] = insertParent.getContent();
                        insertIndex = content.indexOf(incl.directiveElement);
                        if (insertIndex >= 0) {
                            content.splice(insertIndex, 1);
                            insertParent.setContent(content);
                        }
                    }
                }

                this.appendNodes(appended, doc);

                if (!this.collectIncludesInRange(incl.id, appended, doc)) {
                    this.removeNodes(appended, doc);
                    if (insertParent !== undefined && insertIndex >= 0) {
                        const content: XMLNode[] = insertParent.getContent();
                        content.splice(insertIndex, 0, incl.directiveElement);
                        insertParent.setContent(content);
                    }
                    this.reportError(incl, this.diagnostics.i18n.getString("Includer", "inclusionLoop"));
                }
            }
        }

        const addCount: number = processList.length - retryCount;
        return addCount !== 0 || removeCount !== 0;
    }

    private replaceSingle(parent: DitaElement, oldNode: XMLNode, newNodes: XMLNode[]): void {
        const content: XMLNode[] = parent.getContent();
        const index: number = content.indexOf(oldNode);
        if (index >= 0) {
            content.splice(index, 1, ...newNodes);
            parent.setContent(content);
        }
    }

    private replaceRange(parent: DitaElement, oldNodes: XMLNode[], newNodes: XMLNode[]): void {
        if (oldNodes.length === 0) {
            return;
        }
        const content: XMLNode[] = parent.getContent();
        const index: number = content.indexOf(oldNodes[0]);
        if (index >= 0) {
            content.splice(index, oldNodes.length, ...newNodes);
            parent.setContent(content);
        }
    }

    private appendNodes(appended: XMLNode[], doc: LoadedDocument): void {
        const root: DitaElement | undefined = DitaUtils.getRoot(doc.document);
        if (root === undefined) {
            return;
        }
        root.setContent([...root.getContent(), ...appended]);
    }

    private removeNodes(removed: XMLNode[], doc: LoadedDocument): void {
        if (removed.length === 0) {
            return;
        }
        const root: DitaElement | undefined = DitaUtils.getRoot(doc.document);
        if (root === undefined) {
            return;
        }
        const removedSet: Set<XMLNode> = new Set<XMLNode>(removed);
        root.setContent(root.getContent().filter((node: XMLNode): boolean => !removedSet.has(node)));
    }

    protected reportError(incl: Incl, message: string): void {
        this.diagnostics.error(message, incl.sourcePath + ": " + incl.directiveElement.getName());
    }

    protected reportWarning(element: DitaElement, sourcePath: string, message: string): void {
        this.diagnostics.warning(message, sourcePath + ": " + element.getName());
    }
}
