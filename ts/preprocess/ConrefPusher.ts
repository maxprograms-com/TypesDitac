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
import { NodeLocation } from "../utils/NodeLocation.js";
import { URIComponent } from "../utils/URIComponent.js";
import { LoadedDocument, LoadedDocumentType } from "./LoadedDocument.js";
import { LoadedDocuments } from "./LoadedDocuments.js";
import { LoadedTopic } from "./LoadedTopic.js";

type PushType = "pushreplace" | "pushbefore" | "pushafter";

export class ConrefPusher {
    readonly documents: LoadedDocuments;
    readonly diagnostics: DiagnosticLog;
    private workingSet: LoadedDocuments;

    constructor(documents: LoadedDocuments, diagnostics: DiagnosticLog) {
        this.documents = documents;
        this.diagnostics = diagnostics;
        this.workingSet = documents;
    }

    process(loadedDocuments: LoadedDocument[]): void {
        this.workingSet = new LoadedDocuments(this.documents.loader, this.diagnostics);
        const docs: LoadedDocument[] = [];
        for (const loadedDocument of loadedDocuments) {
            // The documents are assumed to have been already processed by another set.
            docs.push(this.workingSet.put(loadedDocument.path, loadedDocument.document, false));
        }
        for (const doc of docs) {
            const root: DitaElement | undefined = DitaUtils.getRoot(doc.document);
            if (root !== undefined) {
                this.executeElement(root, undefined, doc.path, true);
            }
        }
    }

    private executeActions(tree: DitaElement, docPath: string, exec: boolean): void {
        let node: XMLNode | undefined = tree.getContent()[0];
        while (node !== undefined) {
            if (node instanceof DitaElement) {
                node = this.executeElement(node, tree, docPath, exec);
            } else {
                node = this.nextSibling(tree, node);
            }
        }
    }

    private executeElement(element: DitaElement, parent: DitaElement | undefined, docPath: string, exec: boolean): XMLNode | undefined {
        let next: XMLNode | undefined;
        const conaction: string | undefined = element.getAttribute("conaction")?.getValue();
        if (conaction !== undefined && conaction.length > 0) {
            next = this.executeAction(conaction, element, parent, docPath, exec);
        } else {
            next = parent === undefined ? undefined : this.nextSibling(parent, element);
        }
        // A child element having conaction="mark" is now detached, but is still scanned.
        this.executeActions(element, docPath, exec);
        return next;
    }

    private executeAction(
        conactionValue: string,
        element: DitaElement,
        parent: DitaElement | undefined,
        docPath: string,
        exec: boolean
    ): XMLNode | undefined {
        let pushType: PushType | undefined;
        let pushedElement: DitaElement | undefined;
        let targetHref: string | undefined;
        let nextNode: XMLNode | undefined;

        let conref: string | undefined = DitaUtils.getNonEmptyAttribute(element, "conref");
        this.removeConactionAttributes(element);

        const conaction: string = conactionValue.trim();
        if (conaction === "pushreplace") {
            if (exec) {
                targetHref = this.getTargetHref(conref, element, docPath);
                if (targetHref !== undefined) {
                    pushType = "pushreplace";
                    pushedElement = element;
                }
            }
            nextNode = parent === undefined ? undefined : this.nextSibling(parent, element);
        } else if (conaction === "pushbefore") {
            const markElement: DitaElement | undefined = this.getConactionElement(element, parent, "mark", exec, docPath);
            if (markElement === undefined) {
                // Orphaned pushbefore element.
                nextNode = parent === undefined ? undefined : this.nextSibling(parent, element);
            } else {
                if (exec) {
                    conref = DitaUtils.getNonEmptyAttribute(markElement, "conref");
                    targetHref = this.getTargetHref(conref, markElement, docPath);
                    if (targetHref !== undefined) {
                        pushType = "pushbefore";
                        pushedElement = element;
                    }
                }
                nextNode = parent === undefined ? undefined : this.nextSibling(parent, markElement);
                this.removeMarkElement(markElement);
            }
        } else if (conaction === "mark") {
            const pushafterElement: DitaElement | undefined = this.getConactionElement(element, parent, "pushafter", exec, docPath);
            if (pushafterElement !== undefined) {
                // This conaction has already been taken into account.
                this.removeConactionAttributes(pushafterElement);
                if (exec) {
                    targetHref = this.getTargetHref(conref, element, docPath);
                    if (targetHref !== undefined) {
                        pushType = "pushafter";
                        pushedElement = pushafterElement;
                    }
                }
            }
            // The next scanned element may be our pushafter element, which is only traversed.
            nextNode = parent === undefined ? undefined : this.nextSibling(parent, element);
            this.removeMarkElement(element);
        } else if (conaction === "pushafter") {
            // Orphaned pushafter element.
            if (exec) {
                this.diagnostics.warning(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("ConrefPusher", "missingConactionElementBefore"),
                        [element.getName(), "mark"]
                    ),
                    NodeLocation.of(docPath, element)
                );
            }
            nextNode = parent === undefined ? undefined : this.nextSibling(parent, element);
        }

        if (pushType !== undefined && pushedElement !== undefined && targetHref !== undefined) {
            this.pushElement(pushType, pushedElement, targetHref, docPath);
        }
        return nextNode;
    }

    private getTargetHref(conref: string | undefined, element: DitaElement, docPath: string): string | undefined {
        if (conref === undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(this.diagnostics.i18n.getString("Filter", "missingAttribute"), ["conref"]),
                NodeLocation.of(docPath, element)
            );
            return undefined;
        }
        try {
            // Conref has been made absolute when the document was processed.
            new URL(conref);
        } catch {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(this.diagnostics.i18n.getString("Filter", "invalidAttribute"), [conref, "conref"]),
                NodeLocation.of(docPath, element)
            );
            return undefined;
        }
        return conref;
    }

    private removeMarkElement(element: DitaElement): void {
        if (!DitaUtils.hasClass(element, "topic/topic") && !DitaUtils.hasClass(element, "map/map")) {
            element.getParent()?.removeChild(element);
        } else {
            this.removeConactionAttributes(element);
        }
    }

    private removeConactionAttributes(element: DitaElement): void {
        for (const name of ["conaction", "conref", "conrefend", "conkeyref"]) {
            element.removeAttribute(name);
        }
    }

    private getConactionElement(
        element: DitaElement,
        parent: DitaElement | undefined,
        conaction: string,
        exec: boolean,
        docPath: string
    ): DitaElement | undefined {
        let next: DitaElement | undefined = parent === undefined ? undefined : this.nextElement(parent, element);
        if (next !== undefined &&
            (DitaUtils.getNonEmptyAttribute(next, "conaction") !== conaction || next.getName() !== element.getName())) {
            next = undefined;
        }
        if (next === undefined && exec) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("ConrefPusher", "missingConactionElementAfter"),
                    [element.getName(), conaction]
                ),
                NodeLocation.of(docPath, element)
            );
        }
        return next;
    }

    private nextSibling(parent: DitaElement, node: XMLNode): XMLNode | undefined {
        const content: XMLNode[] = parent.getContent();
        const index: number = content.indexOf(node);
        return index < 0 ? undefined : content[index + 1];
    }

    private nextElement(parent: DitaElement, node: XMLNode): DitaElement | undefined {
        const content: XMLNode[] = parent.getContent();
        for (let index: number = content.indexOf(node) + 1; index > 0 && index < content.length; index++) {
            const candidate: XMLNode = content[index];
            if (candidate instanceof DitaElement) {
                return candidate;
            }
        }
        return undefined;
    }

    private pushElement(pushType: PushType, pushedElement: DitaElement, targetHref: string, docPath: string): void {
        const found: { target: DitaElement; targetPath: string } | undefined = this.findTarget(targetHref, pushedElement, docPath);
        if (found === undefined) {
            return;
        }
        const target: DitaElement = found.target;
        if (pushedElement === target || pushedElement.isAncestorOf(target)) {
            this.diagnostics.warning(
                this.diagnostics.i18n.getString("ConrefPusher", "sourceIsAncestorOfTarget"),
                NodeLocation.of(docPath, pushedElement)
            );
            return;
        }
        if (pushType === "pushreplace" && target.isAncestorOf(pushedElement)) {
            this.diagnostics.warning(
                this.diagnostics.i18n.getString("ConrefPusher", "sourceIsDescendantOfTarget"),
                NodeLocation.of(docPath, pushedElement)
            );
            return;
        }
        const copy: DitaElement | undefined = this.copyPushed(pushType, pushedElement, target, docPath, found.targetPath);
        if (copy === undefined) {
            return;
        }
        const targetParent: DitaElement | undefined = target.getParent();
        if (targetParent === undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.getString("ConrefPusher", "targetHasNoParent"),
                NodeLocation.of(docPath, pushedElement)
            );
            return;
        }
        const content: XMLNode[] = targetParent.getContent();
        const targetIndex: number = content.indexOf(target);
        if (targetIndex < 0) {
            return;
        }
        if (pushType === "pushreplace") {
            content.splice(targetIndex, 1, copy);
        } else if (pushType === "pushbefore") {
            content.splice(targetIndex, 0, copy);
        } else {
            content.splice(targetIndex + 1, 0, copy);
        }
        targetParent.setContent(content);
    }

    private findTarget(targetHref: string, pushedElement: DitaElement, docPath: string): { target: DitaElement; targetPath: string } | undefined {
        const hashIndex: number = targetHref.indexOf("#");
        const fragment: string | undefined = hashIndex < 0 ? undefined : URIComponent.decode(targetHref.slice(hashIndex + 1));
        const targetLocation: string = hashIndex < 0 ? targetHref : targetHref.slice(0, hashIndex);

        const targetDoc: LoadedDocument | undefined = this.workingSet.get(targetLocation);
        if (targetDoc === undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(this.diagnostics.i18n.getString("ConrefPusher", "targetDocNotLoaded"), [targetLocation]),
                NodeLocation.of(docPath, pushedElement)
            );
            return undefined;
        }

        let target: DitaElement | undefined;
        const root: DitaElement | undefined = DitaUtils.getRoot(targetDoc.document);
        switch (targetDoc.type) {
            case LoadedDocumentType.MAP:
            case LoadedDocumentType.BOOKMAP:
                if (root !== undefined) {
                    // Branch or the whole map (e.g. conref="foo.ditamap#foo").
                    target = fragment === undefined ? root : DitaUtils.findById(root, fragment);
                }
                break;
            case LoadedDocumentType.MULTI_TOPIC:
            case LoadedDocumentType.TOPIC:
                {
                    let topicId: string | undefined;
                    let elementId: string | undefined;
                    if (fragment !== undefined) {
                        const slash: number = fragment.lastIndexOf("/");
                        if (slash > 0 && slash + 1 < fragment.length) {
                            topicId = fragment.slice(0, slash);
                            elementId = fragment.slice(slash + 1);
                        } else {
                            topicId = fragment;
                        }
                    }
                    const loadedTopic: LoadedTopic | undefined = topicId !== undefined
                        ? targetDoc.findTopicById(topicId)
                        : targetDoc.getFirstTopic();
                    if (loadedTopic !== undefined) {
                        target = loadedTopic.element;
                        if (elementId !== undefined) {
                            target = DitaUtils.findById(target, elementId, false);
                        }
                    }
                }
                break;
            default:
                break;
        }

        if (target === undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(this.diagnostics.i18n.getString("ConrefIncluder", "targetNotFound"), [targetHref, "conref"]),
                NodeLocation.of(docPath, pushedElement)
            );
            return undefined;
        }
        return { target, targetPath: targetDoc.path };
    }

    private copyPushed(
        pushType: PushType,
        pushedElement: DitaElement,
        target: DitaElement,
        docPath: string,
        targetPath: string
    ): DitaElement | undefined {
        const sourceDomains: string | undefined = DitaUtils.lookupAncestorAttributeRaw(pushedElement, "domains");
        if (sourceDomains === undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(this.diagnostics.i18n.getString("ConrefIncluder", "noDomains"), [docPath]),
                NodeLocation.of(docPath, pushedElement)
            );
            return undefined;
        }
        const targetDomains: string | undefined = DitaUtils.lookupAncestorAttributeRaw(target, "domains");
        if (targetDomains === undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(this.diagnostics.i18n.getString("ConrefIncluder", "noDomains"), [targetPath]),
                NodeLocation.of(targetPath, target)
            );
            return undefined;
        }
        if (!DitaUtils.checkDomains(targetDomains, sourceDomains)) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("ConrefPusher", "reversedDomainMismatch"),
                    [DitaUtils.collapseWhitespace(targetDomains), DitaUtils.collapseWhitespace(sourceDomains)]
                ),
                NodeLocation.of(docPath, pushedElement)
            );
            return undefined;
        }

        if (pushType === "pushreplace") {
            // Generalizing the pushed element to match the target element is not supported.
            if (pushedElement.getName() !== target.getName()) {
                this.diagnostics.warning(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("ConrefIncluder", "sourceAndTargetAreDifferentElements"),
                        [pushedElement.getName(), target.getName()]
                    ),
                    NodeLocation.of(docPath, pushedElement)
                );
                return undefined;
            }
        } else {
            const pushedParent: DitaElement | undefined = pushedElement.getParent();
            const targetParent: DitaElement | undefined = target.getParent();
            if ((pushedParent === undefined) !== (targetParent === undefined) ||
                (pushedParent !== undefined && targetParent !== undefined &&
                    pushedParent.getName() !== targetParent.getName() &&
                    !this.isSpecializedFrom(pushedParent, targetParent))) {
                this.diagnostics.warning(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("ConrefPusher", "sourceParentNotSpecializedFromTargetParent"),
                        [pushedParent === undefined ? "" : pushedParent.getName(), targetParent === undefined ? "" : targetParent.getName()]
                    ),
                    NodeLocation.of(docPath, pushedElement)
                );
                return undefined;
            }
        }

        const copy: DitaElement = DitaUtils.cloneElement(pushedElement);
        const lang: string | undefined = DitaUtils.lookupAncestorAttributeRaw(pushedElement, "xml:lang");
        if (lang !== undefined && lang.length > 0) {
            copy.setAttribute(new XMLAttribute("xml:lang", lang));
        }

        // Discard all attributes and elements related to conaction found anywhere inside the copy.
        this.executeActions(copy, docPath, false);

        if (pushType === "pushreplace") {
            for (const attribute of target.getAttributes()) {
                const name: string = attribute.getName();
                if (name !== "xml:lang" && DitaUtils.getNonEmptyAttribute(copy, name) === undefined) {
                    copy.setAttribute(new XMLAttribute(name, attribute.getValue()));
                }
            }
        }
        return copy;
    }

    private isSpecializedFrom(derived: DitaElement, base: DitaElement): boolean {
        const derivedClass: string | undefined = DitaUtils.getNonEmptyAttribute(derived, "class");
        const baseClass: string | undefined = DitaUtils.getNonEmptyAttribute(base, "class");
        if (derivedClass === undefined || baseClass === undefined) {
            return false;
        }
        return DitaUtils.collapseWhitespace(derivedClass).startsWith(DitaUtils.collapseWhitespace(baseClass).slice(2), 2);
    }
}
