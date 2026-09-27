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
import { Incl, Includer, InclusionException } from "./Includer.js";
import { LoadedDocument, LoadedDocumentType } from "./LoadedDocument.js";
import { LoadedDocuments } from "./LoadedDocuments.js";
import { LoadedTopic } from "./LoadedTopic.js";

export class ConrefIncl extends Incl {
    readonly targetPath: string;
    readonly targetId: string | undefined;
    readonly targetId2: string | undefined;
    readonly endOfRangeId: string | undefined;

    constructor(directiveElement: DitaElement, sourcePath: string, conrefHref: string, conrefendHref: string | undefined) {
        super(directiveElement, sourcePath);

        const hashIndex1: number = conrefHref.indexOf("#");
        if (hashIndex1 < 0) {
            this.targetPath = conrefHref;
            this.targetId = undefined;
            this.targetId2 = undefined;
        } else {
            this.targetPath = conrefHref.slice(0, hashIndex1);
            const fragment: string = URIComponent.decode(conrefHref.slice(hashIndex1 + 1));
            const slashIndex: number = fragment.lastIndexOf("/");
            if (slashIndex > 0 && slashIndex + 1 < fragment.length) {
                this.targetId = fragment.slice(0, slashIndex);
                this.targetId2 = fragment.slice(slashIndex + 1);
            } else {
                this.targetId = fragment;
                this.targetId2 = undefined;
            }
        }

        let endId: string | undefined;
        let endId2: string | undefined;
        if (conrefendHref !== undefined) {
            const hashIndex2: number = conrefendHref.indexOf("#");
            if (hashIndex2 >= 0) {
                const endFragment: string = URIComponent.decode(conrefendHref.slice(hashIndex2 + 1));
                const endSlashIndex: number = endFragment.lastIndexOf("/");
                if (endSlashIndex > 0 && endSlashIndex + 1 < endFragment.length) {
                    endId = endFragment.slice(0, endSlashIndex);
                    endId2 = endFragment.slice(endSlashIndex + 1);
                } else {
                    endId = endFragment;
                    endId2 = undefined;
                }
            }
        }

        if (conrefendHref === undefined) {
            this.endOfRangeId = undefined;
        } else if (this.targetId2 !== undefined) {
            this.endOfRangeId = endId2;
        } else if (this.targetId !== undefined && endId2 === undefined) {
            this.endOfRangeId = endId;
        } else {
            this.endOfRangeId = undefined;
        }
    }

    getConrefHref(): string {
        let result: string = this.targetPath;
        if (this.targetId !== undefined) {
            result += "#" + URIComponent.quoteFragment(this.targetId);
            if (this.targetId2 !== undefined) {
                result += "/" + URIComponent.quoteFragment(this.targetId2);
            }
        }
        return result;
    }

    getConrefendHref(): string | undefined {
        if (this.endOfRangeId === undefined) {
            return undefined;
        }
        let result: string = this.targetPath;
        if (this.targetId2 !== undefined && this.targetId !== undefined) {
            result += "#" + URIComponent.quoteFragment(this.targetId) + "/" + URIComponent.quoteFragment(this.endOfRangeId);
        } else {
            result += "#" + URIComponent.quoteFragment(this.endOfRangeId);
        }
        return result;
    }
}

export class ConrefIncluder extends Includer {
    constructor(documents: LoadedDocuments, diagnostics: DiagnosticLog) {
        super(documents, diagnostics);
    }

    protected detectInclusion(element: DitaElement, sourcePath: string): Incl | undefined {
        const conref: string | undefined = DitaUtils.getNonEmptyAttribute(element, "conref");
        if (conref === undefined || DitaUtils.getNonEmptyAttribute(element, "conaction") !== undefined) {
            return undefined;
        }
        if (!this.isValidUrl(conref)) {
            this.reportInvalidAttribute(element, sourcePath, conref, "conref");
            return undefined;
        }
        const conrefend: string | undefined = DitaUtils.getNonEmptyAttribute(element, "conrefend");
        let validConrefend: string | undefined = conrefend;
        if (conrefend !== undefined && !this.isValidUrl(conrefend)) {
            this.reportInvalidAttribute(element, sourcePath, conrefend, "conrefend");
            validConrefend = undefined;
        }
        const incl: ConrefIncl = new ConrefIncl(element, sourcePath, conref, validConrefend);
        if (validConrefend !== undefined && incl.endOfRangeId === undefined) {
            this.reportWarning(
                element,
                sourcePath,
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("ConrefIncluder", "inconsistentConrefend"),
                    [validConrefend, conref]
                )
            );
        }
        return incl;
    }

    private isValidUrl(value: string): boolean {
        try {
            new URL(value);
            return true;
        } catch {
            return false;
        }
    }

    private reportInvalidAttribute(element: DitaElement, sourcePath: string, value: string, attributeName: string): void {
        this.reportWarning(
            element,
            sourcePath,
            this.diagnostics.i18n.format(this.diagnostics.i18n.getString("Filter", "invalidAttribute"), [value, attributeName])
        );
    }

    protected fetchIncluded(incl: Incl): void {
        const conrefIncl: ConrefIncl = incl as ConrefIncl;
        const targetDoc: LoadedDocument = this.fetchDoc(conrefIncl.targetPath);
        const target: DitaElement = this.findConrefTarget(conrefIncl, targetDoc);
        const copy: DitaElement = this.copyConrefTarget(incl.directiveElement, incl.sourcePath, target, conrefIncl.targetPath);
        const targetId: string | undefined = DitaUtils.getNonEmptyAttribute(target, "id");
        if (conrefIncl.endOfRangeId === undefined || conrefIncl.endOfRangeId === targetId) {
            incl.replacementNodes = [copy];
        } else {
            const copies: XMLNode[] = this.copyConrefTargetRange(conrefIncl, target);
            incl.replacementNodes = [copy, ...copies];
        }
    }

    private findConrefTarget(incl: ConrefIncl, targetDoc: LoadedDocument): DitaElement {
        let target: DitaElement | undefined;
        const root: DitaElement | undefined = DitaUtils.getRoot(targetDoc.document);
        if (root !== undefined) {
            switch (targetDoc.type) {
                case LoadedDocumentType.MAP:
                case LoadedDocumentType.BOOKMAP:
                    if (incl.targetId === undefined) {
                        target = root;
                    } else if (incl.targetId2 === undefined) {
                        target = DitaUtils.findById(root, incl.targetId);
                    }
                    break;
                case LoadedDocumentType.MULTI_TOPIC:
                case LoadedDocumentType.TOPIC:
                    {
                        const loadedTopic: LoadedTopic | undefined = incl.targetId === undefined
                            ? targetDoc.getFirstTopic()
                            : targetDoc.findTopicById(incl.targetId);
                        if (loadedTopic !== undefined) {
                            target = incl.targetId2 === undefined
                                ? loadedTopic.element
                                : DitaUtils.findById(loadedTopic.element, incl.targetId2, false);
                        }
                    }
                    break;
                default:
                    break;
            }
        }
        if (target === undefined) {
            throw new InclusionException(this.diagnostics.i18n.format(
                this.diagnostics.i18n.getString("ConrefIncluder", "targetNotFound"),
                [incl.getConrefHref(), "conref"]
            ));
        }
        return target;
    }

    private copyConrefTarget(conrefSource: DitaElement, sourcePath: string, conrefTarget: DitaElement, targetPath: string): DitaElement {
        this.checkConrefDomains(conrefSource, sourcePath, conrefTarget, targetPath);
        const copy: DitaElement = this.cloneElement(conrefTarget);
        this.copyAttributes(conrefSource, conrefTarget, copy);
        return copy;
    }

    private checkConrefDomains(conrefSource: DitaElement, sourcePath: string, conrefTarget: DitaElement, targetPath: string): void {
        if (conrefSource.getName() !== conrefTarget.getName()) {
            throw new InclusionException(this.diagnostics.i18n.format(
                this.diagnostics.i18n.getString("ConrefIncluder", "sourceAndTargetAreDifferentElements"),
                [conrefSource.getName(), conrefTarget.getName()]
            ));
        }
        const sourceDomains: string | undefined = DitaUtils.lookupAncestorAttribute(conrefSource, "domains");
        if (sourceDomains === undefined || sourceDomains.length === 0) {
            throw new InclusionException(this.diagnostics.i18n.format(
                this.diagnostics.i18n.getString("ConrefIncluder", "noDomains"),
                [sourcePath]
            ));
        }
        const targetDomains: string | undefined = DitaUtils.lookupAncestorAttribute(conrefTarget, "domains");
        if (targetDomains === undefined || targetDomains.length === 0) {
            throw new InclusionException(this.diagnostics.i18n.format(
                this.diagnostics.i18n.getString("ConrefIncluder", "noDomains"),
                [targetPath]
            ));
        }
        if (!DitaUtils.checkDomains(sourceDomains, targetDomains)) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("ConrefIncluder", "domainMismatch"),
                    [DitaUtils.collapseWhitespace(targetDomains), DitaUtils.collapseWhitespace(sourceDomains)]
                ),
                sourcePath + ": " + conrefSource.getName()
            );
        }
    }

    private copyAttributes(conrefSource: DitaElement, conrefTarget: DitaElement, copy: DitaElement): void {
        for (const attribute of copy.getAttributes()) {
            copy.removeAttribute(attribute.getName());
        }

        const dontCopyFromTarget: Set<string> = new Set<string>(["id", "xtrf", "xtrc", "xml:lang"]);

        for (const attribute of conrefSource.getAttributes()) {
            const name: string = attribute.getName();
            const value: string = attribute.getValue();
            if (name === "id") {
                copy.setAttribute(new XMLAttribute(name, value));
            } else if (name !== "conref" && name !== "conrefend" && name !== "xtrf" && name !== "xtrc" &&
                name !== "xml:lang" && value !== "-dita-use-conref-target" && value !== "???") {
                copy.setAttribute(new XMLAttribute(name, value));
                dontCopyFromTarget.add(name);
            }
        }

        for (const attribute of conrefTarget.getAttributes()) {
            const name: string = attribute.getName();
            if (!dontCopyFromTarget.has(name)) {
                copy.setAttribute(new XMLAttribute(name, attribute.getValue()));
            }
        }

        const lang: string | undefined = DitaUtils.lookupAncestorAttributeRaw(conrefTarget, "xml:lang");
        if (lang !== undefined && lang.length > 0) {
            copy.setAttribute(new XMLAttribute("xml:lang", lang));
        }
    }

    private copyConrefTargetRange(incl: ConrefIncl, conrefTarget: DitaElement): XMLNode[] {
        const parent: DitaElement | undefined = conrefTarget.getParent();
        if (parent === undefined) {
            throw new InclusionException(this.diagnostics.i18n.format(
                this.diagnostics.i18n.getString("ConrefIncluder", "targetNotFound"),
                [incl.getConrefendHref() as string, "conrefend"]
            ));
        }
        const siblings: XMLNode[] = parent.getContent();
        const startIndex: number = siblings.indexOf(conrefTarget);

        let endOfRange: DitaElement | undefined;
        let endIndex: number = -1;
        for (let index: number = startIndex + 1; index < siblings.length; index++) {
            const node: XMLNode = siblings[index];
            if (node instanceof DitaElement && DitaUtils.getNonEmptyAttribute(node, "id") === incl.endOfRangeId) {
                endOfRange = node;
                endIndex = index;
                break;
            }
        }
        if (endOfRange === undefined) {
            throw new InclusionException(this.diagnostics.i18n.format(
                this.diagnostics.i18n.getString("ConrefIncluder", "targetNotFound"),
                [incl.getConrefendHref() as string, "conrefend"]
            ));
        }
        if (endOfRange.getName() !== conrefTarget.getName()) {
            throw new InclusionException(this.diagnostics.i18n.format(
                this.diagnostics.i18n.getString("ConrefIncluder", "invalidConrefRange"),
                [conrefTarget.getName(), endOfRange.getName()]
            ));
        }

        const conrefSource: DitaElement = incl.directiveElement;
        const conrefSourceParent: DitaElement | undefined = conrefSource.getParent();
        const conrefTargetParent: DitaElement | undefined = conrefTarget.getParent();
        if (conrefSourceParent !== undefined && conrefTargetParent !== undefined &&
            conrefSourceParent.getName() !== conrefTargetParent.getName() &&
            !this.isSameOrSpecialized(conrefTargetParent, conrefSourceParent)) {
            throw new InclusionException(this.diagnostics.i18n.format(
                this.diagnostics.i18n.getString("ConrefIncluder", "targetParentNotSpecializedFromSourceParent"),
                [conrefTargetParent.getName(), conrefSourceParent.getName()]
            ));
        }

        const range: XMLNode[] = [];
        for (let index: number = startIndex + 1; index <= endIndex; index++) {
            const node: XMLNode = siblings[index];
            if (!(node instanceof DitaElement)) {
                range.push(this.cloneNode(node));
                continue;
            }
            const copy: DitaElement = this.cloneElement(node);
            if (node.getName() === conrefSource.getName()) {
                const savedId: string | undefined = DitaUtils.getNonEmptyAttribute(node, "id");
                this.copyAttributes(conrefSource, node, copy);
                if (savedId !== undefined) {
                    copy.setAttribute(new XMLAttribute("id", savedId));
                } else {
                    copy.removeAttribute("id");
                }
            }
            if (node === endOfRange) {
                copy.removeAttribute("id");
                range.push(copy);
                break;
            }
            range.push(copy);
        }
        return range;
    }

    private isSameOrSpecialized(candidate: DitaElement, base: DitaElement): boolean {
        if (candidate.getName() === base.getName()) {
            return true;
        }
        const baseClass: XMLAttribute | undefined = base.getAttribute("class");
        const candidateClass: XMLAttribute | undefined = candidate.getAttribute("class");
        if (baseClass === undefined || candidateClass === undefined) {
            return false;
        }
        const baseValue: string = DitaUtils.collapseWhitespace(baseClass.getValue());
        const candidateValue: string = DitaUtils.collapseWhitespace(candidateClass.getValue());
        if (baseValue.length === 0 || candidateValue.length === 0) {
            return false;
        }
        return candidateValue.startsWith(baseValue.slice(2), 2);
    }
}
