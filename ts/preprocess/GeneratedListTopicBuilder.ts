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

import { XMLAttribute } from "typesxml";
import { DitaElement } from "../dom/DitaElement.js";
import { DiacriticUtil } from "../utils/DiacriticUtil.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { Chunk } from "./Chunk.js";
import { ChunkEntry, ChunkEntryType, TocType } from "./ChunkEntry.js";
import { EmbeddedLists } from "./EmbeddedLists.js";
import { IndexAnchor } from "./IndexAnchor.js";
import { IndexAnchorPair } from "./IndexAnchorPair.js";
import { IndexTerm } from "./IndexTerm.js";
import { IndexTermRef } from "./IndexTermRef.js";
import { ListTarget, ListTargetType } from "./ListTarget.js";
import { LoadedTopic } from "./LoadedTopic.js";

interface TOCNode {
    readonly entry?: ChunkEntry;
    readonly children: TOCNode[];
}

export class GeneratedListTopicBuilder {
    readonly diagnostics: DiagnosticLog;

    constructor(diagnostics: DiagnosticLog) {
        this.diagnostics = diagnostics;
    }

    buildTitlePage(map: DitaElement, forceTitlePage: boolean): DitaElement[] {
        const result: DitaElement[] = [];
        const title: DitaElement | undefined = DitaUtils.getChildByClass(map, "topic/title");
        if (title !== undefined) {
            result.push(DitaUtils.cloneElement(title));
        } else {
            const titleText: string | undefined = DitaUtils.getNonEmptyAttribute(map, "title");
            if (forceTitlePage || titleText !== undefined) {
                const synthesized: DitaElement = new DitaElement("title");
                synthesized.setAttribute(new XMLAttribute("class", "- topic/title "));
                if (titleText !== undefined) {
                    synthesized.addString(DitaUtils.collapseWhitespace(titleText));
                }
                result.push(synthesized);
            }
        }
        const metadata: DitaElement | undefined = DitaUtils.getChildByClass(map, "map/topicmeta");
        if (metadata !== undefined) {
            result.push(DitaUtils.cloneElement(metadata));
        }
        return result;
    }

    buildTOC(entries: ChunkEntry[], tocType: TocType, chunkBaseName: (chunk: Chunk) => string): DitaElement[] {
        interface StackFrame {
            readonly entry?: ChunkEntry;
            readonly node: TOCNode;
        }
        const root: TOCNode = { children: [] };
        const stack: StackFrame[] = [{ node: root }];

        for (const entry of entries) {
            let top: StackFrame = stack[stack.length - 1];
            while (!this.isTOCParent(top.entry, entry)) {
                stack.pop();
                top = stack[stack.length - 1];
            }

            let node: TOCNode = { children: [] };
            if (entry.tocType === tocType) {
                const element: DitaElement | undefined = entry.getElement();
                if (element === undefined || !DitaUtils.hasClass(element, "glossentry/glossentry")) {
                    node = { entry, children: [] };
                    top.node.children.push(node);
                }
            }
            stack.push({ entry, node });
        }

        return this.renderTOCTree(root.children, chunkBaseName);
    }

    private isTOCParent(parent: ChunkEntry | undefined, entry: ChunkEntry): boolean {
        if (parent === undefined) {
            return true;
        }
        if (parent.type !== ChunkEntryType.TOPIC) {
            return false;
        }
        const subRole: string = DitaUtils.getSubRole(parent.role);
        if (subRole !== entry.role) {
            return false;
        }
        const num1: string[] = parent.number ?? [];
        const num2: string[] = entry.number ?? [];
        if (num2.length !== num1.length + 1) {
            return false;
        }
        for (let i: number = 0; i < num1.length; i++) {
            if (num2[i] !== num1[i]) {
                return false;
            }
        }
        return true;
    }

    private renderTOCTree(nodes: TOCNode[], chunkBaseName: (chunk: Chunk) => string): DitaElement[] {
        const items: DitaElement[] = [];
        for (const node of nodes) {
            if (node.entry === undefined) {
                continue;
            }
            items.push(this.createTOCEntry(node.entry, this.renderTOCTree(node.children, chunkBaseName), chunkBaseName));
        }
        return items;
    }

    private createTOCEntry(entry: ChunkEntry, children: DitaElement[], chunkBaseName: (chunk: Chunk) => string): DitaElement {
        const tocEntry: DitaElement = new DitaElement("ditac:tocEntry");
        tocEntry.setAttribute(new XMLAttribute("file", chunkBaseName(entry.chunk)));
        tocEntry.setAttribute(new XMLAttribute("number", (entry.number ?? []).join(" ")));
        tocEntry.setAttribute(new XMLAttribute("role", entry.role ?? ""));

        const topicElement: DitaElement | undefined = entry.getElement();
        let title: string;
        let id: string;
        if (topicElement !== undefined) {
            title = DitaUtils.getTitleTextFromChild(topicElement, true) ?? entry.navtitle ?? "???";
            id = topicElement.getAttribute("id")?.getValue() ?? "";
        } else {
            const role: string = entry.role ?? "";
            title = entry.navtitle ?? ("__AUTO__" + role + "__");
            id = "__AUTO__" + role + "__";
        }
        tocEntry.setAttribute(new XMLAttribute("title", title));
        tocEntry.setAttribute(new XMLAttribute("id", id));

        for (const child of children) {
            tocEntry.addElement(child);
        }
        return tocEntry;
    }

    buildFormalList(lists: EmbeddedLists, type: ListTargetType, resolveFile: (topic: LoadedTopic) => string): DitaElement[] {
        if (type === ListTargetType.INDEX_TERM) {
            return this.buildIndexList(lists.getIndexTerms(), resolveFile);
        }
        const qName: string = "ditac:" + type;
        const result: DitaElement[] = [];
        for (const target of lists.get(type) as ListTarget[]) {
            const formalElement: DitaElement = new DitaElement(qName);
            formalElement.setAttribute(new XMLAttribute("number", target.number ?? ""));
            formalElement.setAttribute(new XMLAttribute("title", target.title ?? ""));
            formalElement.setAttribute(new XMLAttribute("file", resolveFile(target.sourceTopic)));
            formalElement.setAttribute(new XMLAttribute("id", target.targetId));
            if (target.desc !== undefined) {
                formalElement.addElement(this.createDescription(target.desc));
            }
            result.push(formalElement);
        }
        return result;
    }

    private createDescription(desc: DitaElement): DitaElement {
        const description: DitaElement = new DitaElement("ditac:description");
        description.setContent(DitaUtils.cloneElement(desc).getContent());
        return description;
    }

    private buildIndexList(entries: IndexTerm[], resolveFile: (topic: LoadedTopic) => string): DitaElement[] {
        if (entries.length === 0) {
            return [];
        }
        const termToId: Map<string, string> = new Map<string, string>();
        let idCounter: number = 0;
        this.identifyIndexTerms(entries, undefined, termToId, (): string => "typesdita-indexentry-" + (++idCounter).toString());

        const divs: DitaElement[] = [];

        const symbolEntries: IndexTerm[] = entries.filter(
            (entry: IndexTerm): boolean => !this.startsWithLetter(this.groupKey(entry))
        );
        if (symbolEntries.length > 0) {
            divs.push(this.createIndexDiv("symbols", symbolEntries, termToId, resolveFile));
        }

        let currentLetter: string | undefined;
        let currentGroup: IndexTerm[] = [];
        for (const entry of entries) {
            const key: string = this.groupKey(entry);
            if (!this.startsWithLetter(key)) {
                continue;
            }
            const letter: string = DiacriticUtil.collapseChar(key.charAt(0)).toUpperCase();
            if (letter !== currentLetter) {
                if (currentLetter !== undefined) {
                    divs.push(this.createIndexDiv(currentLetter, currentGroup, termToId, resolveFile));
                }
                currentLetter = letter;
                currentGroup = [];
            }
            currentGroup.push(entry);
        }
        if (currentLetter !== undefined) {
            divs.push(this.createIndexDiv(currentLetter, currentGroup, termToId, resolveFile));
        }

        return divs;
    }

    private identifyIndexTerms(
        entries: IndexTerm[],
        parentKey: string | undefined,
        termToId: Map<string, string>,
        nextId: () => string
    ): void {
        for (const entry of entries) {
            const key: string = parentKey === undefined ? entry.term : parentKey + "\n" + entry.term;
            termToId.set(key, nextId());
            this.identifyIndexTerms(entry.getSubTermList() ?? [], key, termToId, nextId);
        }
    }

    private groupKey(entry: IndexTerm): string {
        return entry.getSortAs() ?? entry.term;
    }

    private startsWithLetter(value: string): boolean {
        return /^\p{L}/u.test(value);
    }

    private createIndexDiv(title: string, entries: IndexTerm[], termToId: Map<string, string>, resolveFile: (topic: LoadedTopic) => string): DitaElement {
        const div: DitaElement = new DitaElement("ditac:div");
        div.setAttribute(new XMLAttribute("title", title));
        for (const entry of entries) {
            div.addElement(this.createIndexEntry(entry, undefined, termToId, resolveFile));
        }
        return div;
    }

    private createIndexEntry(entry: IndexTerm, parentKey: string | undefined, termToId: Map<string, string>, resolveFile: (topic: LoadedTopic) => string): DitaElement {
        const key: string = parentKey === undefined ? entry.term : parentKey + "\n" + entry.term;
        const id: string = termToId.get(key) ?? key;

        const indexEntry: DitaElement = new DitaElement("ditac:indexEntry");
        indexEntry.setAttribute(new XMLAttribute("id", id));
        indexEntry.setAttribute(new XMLAttribute("term", entry.term));
        if (entry.getSortAs() !== undefined) {
            indexEntry.setAttribute(new XMLAttribute("sortAs", entry.getSortAs() as string));
        }

        let num: number = 0;
        for (const anchor of entry.getAnchorList() ?? []) {
            const indexAnchor: DitaElement = new DitaElement("ditac:indexAnchor");
            num++;
            indexAnchor.setAttribute(new XMLAttribute("number", num.toString()));
            indexAnchor.setAttribute(new XMLAttribute("file", anchor.file));
            indexAnchor.setAttribute(new XMLAttribute("id", anchor.getId()));
            if (anchor instanceof IndexAnchorPair && anchor.getSource2() !== undefined) {
                num++;
                indexAnchor.setAttribute(new XMLAttribute("number2", num.toString()));
                indexAnchor.setAttribute(new XMLAttribute("file2", anchor.getFile2() ?? ""));
                indexAnchor.setAttribute(new XMLAttribute("id2", anchor.getId2() ?? ""));
            }
            indexEntry.addElement(indexAnchor);
        }

        for (const seeAlso of entry.getSeeAlsoList() ?? []) {
            indexEntry.addElement(this.createIndexRef("ditac:indexSeeAlso", seeAlso, termToId));
        }

        for (const subTerm of entry.getSubTermList() ?? []) {
            indexEntry.addElement(this.createIndexEntry(subTerm, key, termToId, resolveFile));
        }

        const seeList: IndexTermRef[] = entry.getSeeList() ?? [];
        const anchors: IndexAnchor[] = entry.getAnchorList() ?? [];
        const seeAlsoList: IndexTermRef[] = entry.getSeeAlsoList() ?? [];
        const subTerms: IndexTerm[] = entry.getSubTermList() ?? [];
        const isSeeEntry: boolean = seeList.length > 0 && anchors.length === 0 &&
            seeAlsoList.length === 0 && subTerms.length === 0;
        if (isSeeEntry) {
            for (const see of seeList) {
                indexEntry.addElement(this.createIndexRef("ditac:indexSee", see, termToId));
            }
        } else if (seeList.length > 0) {
            for (const see of seeList) {
                this.diagnostics.warning(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("IndexTerms", "seeOnNonLeafIndexTerm2"),
                        [key.split("\n").join(" / ")]
                    ),
                    "term=\"" + see.term.join(" / ") + "\""
                );
            }
        }

        return indexEntry;
    }

    private createIndexRef(name: string, ref: IndexTermRef, termToId: Map<string, string>): DitaElement {
        const redirection: string = ref.term.join("\n");
        const targetId: string | undefined = termToId.get(redirection);
        const element: DitaElement = new DitaElement(name);
        element.setAttribute(new XMLAttribute("term", redirection));
        if (targetId === undefined) {
            this.diagnostics.warning(
                this.diagnostics.i18n.format(
                    this.diagnostics.i18n.getString("IndexTerms", "noSuchIndexTerm"),
                    [ref.term.join(" / ")]
                ),
                "term=\"" + ref.term.join(" / ") + "\""
            );
        } else {
            element.setAttribute(new XMLAttribute("ref", targetId));
        }
        return element;
    }
}
