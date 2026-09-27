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
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { IndexAnchor } from "./IndexAnchor.js";
import { IndexAnchorPair } from "./IndexAnchorPair.js";
import { IndexCollator } from "./IndexCollator.js";
import { IndexTerm } from "./IndexTerm.js";
import { IndexTermRef } from "./IndexTermRef.js";
import { LoadedTopic } from "./LoadedTopic.js";

interface ParsedIndexTerm {
    readonly source: DitaElement;
    term: string | undefined;
    start: string | undefined;
    end: string | undefined;
    id: string;
    sortAs: string | undefined;
    seeList: IndexTermRef[];
    seeAlsoList: IndexTermRef[];
    subTermList: ParsedIndexTerm[];
}

export class IndexTerms {
    private readonly diagnostics: DiagnosticLog;
    private readonly terms: Map<string, IndexTerm> = new Map();
    private readonly startToAnchor: Map<string, IndexAnchorPair> = new Map();
    private anchorCounter: number = 0;

    constructor(diagnostics: DiagnosticLog) {
        this.diagnostics = diagnostics;
    }

    collect(element: DitaElement, file: string, topic: LoadedTopic): void {
        const parsed: ParsedIndexTerm | undefined = this.parseIndexTerm(element, topic);
        if (parsed === undefined) {
            return;
        }
        if (parsed.end !== undefined) {
            this.finishAnchorPair(parsed, file, topic);
            return;
        }
        let node: IndexTerm | undefined = this.terms.get(parsed.term as string);
        let isNew: boolean = false;
        if (node === undefined) {
            node = new IndexTerm(parsed.term as string);
            isNew = true;
        }
        if (!this.merge(parsed, file, topic, node)) {
            return;
        }
        if (isNew) {
            this.terms.set(parsed.term as string, node);
        }
    }

    isEmpty(): boolean {
        return this.terms.size === 0;
    }

    getSortedEntries(lang: string): IndexTerm[] {
        const entries: IndexTerm[] = [...this.terms.values()];
        const collator: IndexCollator = new IndexCollator(lang);
        const termCompare: (a: IndexTerm, b: IndexTerm) => number = (a: IndexTerm, b: IndexTerm): number => {
            const ta: string = a.getSortAs() ?? a.term;
            const tb: string = b.getSortAs() ?? b.term;
            const delta: number = collator.compare(ta, tb);
            return delta !== 0 ? delta : collator.compare(a.term, b.term);
        };
        entries.sort(termCompare);
        for (const entry of entries) {
            this.sortEntry(entry, collator, termCompare);
        }
        this.finishAnchors(entries);
        return entries;
    }

    private sortEntry(
        node: IndexTerm,
        collator: IndexCollator,
        termCompare: (a: IndexTerm, b: IndexTerm) => number
    ): void {
        const refCompare: (a: IndexTermRef, b: IndexTermRef) => number = (a: IndexTermRef, b: IndexTermRef): number => {
            const count: number = Math.min(a.term.length, b.term.length);
            for (let index: number = 0; index < count; index++) {
                const delta: number = collator.compare(a.term[index], b.term[index]);
                if (delta !== 0) {
                    return delta;
                }
            }
            return a.term.length - b.term.length;
        };
        const seeList: IndexTermRef[] | undefined = node.getSeeList();
        const seeAlsoList: IndexTermRef[] | undefined = node.getSeeAlsoList();
        const subTerms: IndexTerm[] | undefined = node.getSubTermList();
        seeList?.sort(refCompare);
        seeAlsoList?.sort(refCompare);
        subTerms?.sort(termCompare);
        for (const subTerm of subTerms ?? []) {
            this.sortEntry(subTerm, collator, termCompare);
        }
    }

    private doParseIndexTerm(element: DitaElement, topic: LoadedTopic): ParsedIndexTerm | undefined {
        const parsed: ParsedIndexTerm = {
            source: element,
            term: undefined,
            start: this.getRangeAttribute(element, "start"),
            end: this.getRangeAttribute(element, "end"),
            id: element.getAttribute("id")?.getValue() ?? "",
            sortAs: undefined,
            seeList: [],
            seeAlsoList: [],
            subTermList: []
        };
        if (parsed.end !== undefined) {
            if (DitaUtils.hasContent(element)) {
                this.diagnostics.warning(
                    this.diagnostics.i18n.getString("IndexTerms", "nonEmptyIndexTermEnd"),
                    this.location(topic, element)
                );
            }
            return parsed;
        }
        parsed.term = this.getTerm(element);
        if (parsed.term === undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.getString("IndexTerms", "missingIndexTerm"),
                this.location(topic, element)
            );
            return undefined;
        }
        for (const child of element.getChildren()) {
            if (DitaUtils.hasClass(child, "topic/indexterm")) {
                const subTerm: ParsedIndexTerm | undefined = this.doParseIndexTerm(child, topic);
                if (subTerm !== undefined) {
                    parsed.subTermList.push(subTerm);
                }
            } else if (DitaUtils.hasClass(child, "indexing-d/index-see")) {
                const ref: IndexTermRef | undefined = this.parseIndexTermRef(child, topic);
                if (ref !== undefined) {
                    parsed.seeList.push(ref);
                }
            } else if (DitaUtils.hasClass(child, "indexing-d/index-see-also")) {
                const ref: IndexTermRef | undefined = this.parseIndexTermRef(child, topic);
                if (ref !== undefined) {
                    parsed.seeAlsoList.push(ref);
                }
            } else if (DitaUtils.hasClass(child, "indexing-d/index-sort-as")) {
                const sortAs: string | undefined = this.parseSortAs(child, topic);
                if (sortAs !== undefined) {
                    if (parsed.sortAs !== undefined) {
                        this.diagnostics.warning(
                            this.diagnostics.i18n.getString("IndexTerms", "multipleIndexSortAs"),
                            this.location(topic, element)
                        );
                    }
                    parsed.sortAs = sortAs;
                }
            }
        }
        if (parsed.seeList.length > 0 && parsed.seeAlsoList.length > 0) {
            parsed.seeList = [];
            this.diagnostics.warning(
                this.diagnostics.i18n.getString("IndexTerms", "bothIndexSeeAndIndexSeeAlso"),
                this.location(topic, element)
            );
        }
        if (parsed.seeList.length > 0 && parsed.subTermList.length > 0) {
            parsed.seeList = [];
            this.diagnostics.warning(
                this.diagnostics.i18n.getString("IndexTerms", "seeOnNonLeafIndexTerm"),
                this.location(topic, element)
            );
        }
        return parsed;
    }

    private parseIndexTerm(element: DitaElement, topic: LoadedTopic): ParsedIndexTerm | undefined {
        const parsed: ParsedIndexTerm | undefined = this.doParseIndexTerm(element, topic);
        if (parsed !== undefined) {
            this.setAnchorId(parsed, parsed.id);
        }
        return parsed;
    }

    private setAnchorId(parsed: ParsedIndexTerm, id: string): void {
        parsed.id = id;
        for (const subTerm of parsed.subTermList) {
            this.setAnchorId(subTerm, id);
        }
    }

    private getTerm(element: DitaElement): string | undefined {
        let text: string = "";
        for (const node of element.getContent()) {
            if (node instanceof TextNode) {
                text += node.getValue();
            } else if (node instanceof DitaElement) {
                if (DitaUtils.hasClass(node, "topic/indexterm") || DitaUtils.hasClass(node, "topic/index-base")) {
                    break;
                }
                text += DitaUtils.getTextContent(node);
            }
        }
        const collapsed: string = DitaUtils.collapseWhitespace(text);
        return collapsed.length === 0 ? undefined : collapsed;
    }

    private getRangeAttribute(element: DitaElement, name: string): string | undefined {
        const value: string | undefined = element.getAttribute(name)?.getValue();
        if (value === undefined) {
            return undefined;
        }
        const collapsed: string = DitaUtils.collapseWhitespace(value);
        return collapsed.length === 0 ? undefined : collapsed;
    }

    private parseIndexTermRef(element: DitaElement, topic: LoadedTopic): IndexTermRef | undefined {
        const terms: string[] = [];
        const term: string | undefined = this.getTerm(element);
        if (term === undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.getString("IndexTerms", "missingIndexTerm"),
                this.location(topic, element)
            );
            return undefined;
        }
        terms.push(term);
        let nested: DitaElement = element;
        for (; ;) {
            const child: DitaElement | undefined = DitaUtils.getChildByClass(nested, "topic/indexterm");
            if (child === undefined) {
                break;
            }
            const childTerm: string | undefined = this.getTerm(child);
            if (childTerm === undefined) {
                this.diagnostics.warning(
                    this.diagnostics.i18n.getString("IndexTerms", "missingIndexTerm"),
                    this.location(topic, child)
                );
                return undefined;
            }
            terms.push(childTerm);
            nested = child;
        }
        return new IndexTermRef(element, terms);
    }

    private parseSortAs(element: DitaElement, topic: LoadedTopic): string | undefined {
        const value: string = DitaUtils.collapseWhitespace(DitaUtils.getTextContent(element));
        if (value.length === 0) {
            this.diagnostics.warning(
                this.diagnostics.i18n.getString("IndexTerms", "emptyIndexSortAs"),
                this.location(topic, element)
            );
            return undefined;
        }
        return value;
    }

    private merge(parsed: ParsedIndexTerm, file: string, topic: LoadedTopic, node: IndexTerm): boolean {
        let addAnchor: boolean = parsed.seeList.length === 0;
        if (addAnchor) {
            if (parsed.start !== undefined) {
                if (this.startToAnchor.has(parsed.start)) {
                    this.diagnostics.warning(
                        this.diagnostics.i18n.format(
                            this.diagnostics.i18n.getString("IndexTerms", "overlappingIndexRange"),
                            [parsed.start]
                        ),
                        this.location(topic, parsed.source)
                    );
                    this.startToAnchor.delete(parsed.start);
                    return false;
                }
                const anchor: IndexAnchorPair = this.createAnchorPair(parsed.source, file, topic, parsed.id, parsed.start);
                node.addAnchor(anchor);
                this.startToAnchor.set(parsed.start, anchor);
            } else {
                if (parsed.subTermList.length > 0) {
                    for (const subTerm of parsed.subTermList) {
                        if (subTerm.end === undefined) {
                            addAnchor = false;
                            break;
                        }
                    }
                }
                if (addAnchor) {
                    node.addAnchor(this.createAnchor(parsed.source, file, topic, parsed.id));
                }
            }
        }

        if (parsed.sortAs !== undefined) {
            if (node.getSortAs() !== undefined && node.getSortAs() !== parsed.sortAs) {
                this.diagnostics.warning(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("IndexTerms", "multipleIndexSortAs2"),
                        [node.term]
                    ),
                    this.location(topic, parsed.source)
                );
            }
            node.setSortAs(parsed.sortAs);
        }

        for (const see of parsed.seeList) {
            const seeList: IndexTermRef[] | undefined = node.getSeeList();
            if (seeList === undefined || !seeList.some((existing: IndexTermRef): boolean => existing.equals(see))) {
                node.addSee(see);
            }
        }
        for (const seeAlso of parsed.seeAlsoList) {
            const seeAlsoList: IndexTermRef[] | undefined = node.getSeeAlsoList();
            if (seeAlsoList === undefined || !seeAlsoList.some((existing: IndexTermRef): boolean => existing.equals(seeAlso))) {
                node.addSeeAlso(seeAlso);
            }
        }

        for (const parsedSubTerm of parsed.subTermList) {
            if (parsedSubTerm.end !== undefined) {
                this.finishAnchorPair(parsedSubTerm, file, topic);
                continue;
            }
            const term: string = parsedSubTerm.term as string;
            const subTerms: IndexTerm[] | undefined = node.getSubTermList();
            let subTerm: IndexTerm | undefined = subTerms?.find(
                (candidate: IndexTerm): boolean => candidate.term === term
            );
            let isNew: boolean = false;
            if (subTerm === undefined) {
                subTerm = new IndexTerm(term);
                isNew = true;
            }
            if (!this.merge(parsedSubTerm, file, topic, subTerm)) {
                continue;
            }
            if (isNew) {
                node.addSubTerm(subTerm);
            }
        }

        return true;
    }

    private finishAnchorPair(parsed: ParsedIndexTerm, file: string, topic: LoadedTopic): void {
        const anchor: IndexAnchorPair | undefined = this.startToAnchor.get(parsed.end as string);
        if (anchor === undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("IndexTerms", "indexRangeStartNotFound"),
                    [parsed.end as string]
                ),
                this.location(topic, parsed.source)
            );
            return;
        }
        this.startToAnchor.delete(parsed.end as string);
        this.ensureId(parsed.source, topic);
        anchor.setAnchor2(parsed.source, file, parsed.id);
    }

    private createAnchor(element: DitaElement, file: string, topic: LoadedTopic, id: string): IndexAnchor {
        this.ensureId(element, topic);
        return new IndexAnchor(element, file, id);
    }

    private createAnchorPair(element: DitaElement, file: string, topic: LoadedTopic, id: string, name: string): IndexAnchorPair {
        this.ensureId(element, topic);
        return new IndexAnchorPair(element, file, id, name);
    }

    private finishAnchors(entries: IndexTerm[]): void {
        for (const entry of entries) {
            for (const anchor of entry.getAnchorList() ?? []) {
                if (this.isInProlog(anchor.source)) {
                    const title: DitaElement | undefined = this.markStartOfTopic(anchor.source);
                    if (title !== undefined) {
                        anchor.setId(DitaUtils.getNonEmptyAttribute(title, "id") as string);
                    }
                }
                if (anchor instanceof IndexAnchorPair) {
                    const source2: DitaElement | undefined = anchor.getSource2();
                    if (source2 === undefined) {
                        const end: DitaElement = this.markEndOfTopic(anchor.source);
                        anchor.setAnchor2(anchor.source, anchor.file, end.getAttribute("id")?.getValue() as string);
                    } else if (this.isInProlog(source2)) {
                        const end: DitaElement = this.markEndOfTopic(source2);
                        anchor.setAnchor2(source2, anchor.getFile2() as string, end.getAttribute("id")?.getValue() as string);
                    }
                }
            }
            this.finishAnchors(entry.getSubTermList() ?? []);
        }
        this.startToAnchor.clear();
    }

    private markStartOfTopic(element: DitaElement): DitaElement | undefined {
        const topic: DitaElement | undefined = this.findTopicAncestor(element);
        if (topic === undefined) {
            return undefined;
        }
        const title: DitaElement | undefined = DitaUtils.getChildByClass(topic, "topic/title");
        if (title === undefined) {
            return undefined;
        }
        const topicId: string = topic.getAttribute("id")?.getValue() as string;
        const titleId: string | undefined = DitaUtils.getNonEmptyAttribute(title, "id");
        if (titleId === undefined) {
            title.setAttribute(new XMLAttribute("id", topicId + "____TT"));
        }
        return title;
    }

    private markEndOfTopic(element: DitaElement): DitaElement {
        const topic: DitaElement | undefined = this.findTopicAncestor(element);
        if (topic === undefined) {
            return element;
        }
        let found: DitaElement | undefined;
        let after: DitaElement | undefined;
        for (const child of topic.getChildren()) {
            if (DitaUtils.hasClass(child, "topic/topic")) {
                break;
            }
            if (child.getName() === "ditac:anchor") {
                found = child;
                break;
            }
            after = child;
        }
        if (found !== undefined) {
            return found;
        }
        const anchorId: string = (topic.getAttribute("id")?.getValue() as string) + "____EOT";
        const anchor: DitaElement = new DitaElement("ditac:anchor");
        anchor.setAttribute(new XMLAttribute("id", anchorId));
        if (after !== undefined) {
            const content: XMLNode[] = topic.getContent();
            const index: number = content.indexOf(after);
            content.splice(index + 1, 0, anchor);
            topic.setContent(content);
        }
        return anchor;
    }

    private findTopicAncestor(element: DitaElement): DitaElement | undefined {
        let current: DitaElement | undefined = element;
        while (current !== undefined) {
            if (DitaUtils.hasClass(current, "topic/topic")) {
                return current;
            }
            current = current.getParent();
        }
        return undefined;
    }

    private isInProlog(element: DitaElement): boolean {
        // Ancestors only, not the element itself.
        let current: DitaElement | undefined = element.getParent();
        while (current !== undefined) {
            if (DitaUtils.hasClass(current, "topic/prolog")) {
                return true;
            }
            current = current.getParent();
        }
        return false;
    }

    private ensureId(element: DitaElement, topic: LoadedTopic, suffix?: string): void {
        const existing: string | undefined = element.getAttribute("id")?.getValue().trim();
        if (existing !== undefined && existing.length > 0) {
            return;
        }
        let generatedId: string;
        if (suffix !== undefined) {
            generatedId = topic.topicId + suffix;
        } else {
            this.anchorCounter++;
            generatedId = topic.topicId + "-indexterm-" + this.anchorCounter.toString();
        }
        element.setAttribute(new XMLAttribute("id", generatedId));
    }

    private location(topic: LoadedTopic, element: DitaElement): string {
        return topic.getAncestorDocument().path + ": " + element.getName();
    }
}
