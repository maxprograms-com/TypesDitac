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

import { DitaElement } from "../dom/DitaElement.js";
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { Chunk } from "./Chunk.js";
import { ChunkEntryType } from "./ChunkEntry.js";
import { ChunkPlan } from "./ChunkPlan.js";
import { FormalElementCounter } from "./FormalElementCounter.js";
import { IndexTerms } from "./IndexTerms.js";
import { ListTarget, ListTargetType } from "./ListTarget.js";
import { LoadedTopic } from "./LoadedTopic.js";

export class ListTargetCollector {
    readonly diagnostics: DiagnosticLog;
    indexTerms: IndexTerms;

    constructor(diagnostics: DiagnosticLog) {
        this.diagnostics = diagnostics;
        this.indexTerms = new IndexTerms(diagnostics);
    }

    collect(
        plan: ChunkPlan,
        chunkBaseName: (chunk: Chunk) => string,
        idRegistry: Map<string, DitaElement>
    ): Map<ListTargetType, ListTarget[]> {
        this.indexTerms = new IndexTerms(this.diagnostics);
        const result: Map<ListTargetType, ListTarget[]> = this.createResult();

        const tableCounter: FormalElementCounter = new FormalElementCounter("table");
        const figureCounter: FormalElementCounter = new FormalElementCounter("figure");
        const exampleCounter: FormalElementCounter = new FormalElementCounter("example");
        const equationCounter: FormalElementCounter = new FormalElementCounter("equation");

        const processed: Set<LoadedTopic> = new Set<LoadedTopic>();
        for (const chunk of plan.chunks) {
            for (const entry of chunk.getEntries()) {
                const topic: LoadedTopic | undefined = entry.type === ChunkEntryType.TOPIC ? entry.loadedTopic : undefined;
                if (topic === undefined || processed.has(topic)) {
                    continue;
                }
                processed.add(topic);

                tableCounter.traversing(entry);
                figureCounter.traversing(entry);
                exampleCounter.traversing(entry);
                equationCounter.traversing(entry);

                let searchTopic: boolean = true;
                if (DitaUtils.getNonEmptyAttribute(topic.element, "ditac:search") === "false") {
                    topic.element.removeAttribute("ditac:search");
                    searchTopic = false;
                }

                this.collectTopic(
                    topic,
                    topic.element,
                    chunkBaseName(chunk),
                    tableCounter,
                    figureCounter,
                    exampleCounter,
                    equationCounter,
                    searchTopic,
                    result,
                    idRegistry
                );
            }
        }
        return result;
    }

    private collectTopic(
        topic: LoadedTopic,
        element: DitaElement,
        file: string,
        tableCounter: FormalElementCounter,
        figureCounter: FormalElementCounter,
        exampleCounter: FormalElementCounter,
        equationCounter: FormalElementCounter,
        searchTopic: boolean,
        result: Map<ListTargetType, ListTarget[]>,
        idRegistry: Map<string, DitaElement>
    ): void {
        for (const child of element.getChildren()) {
            if (DitaUtils.hasClass(child, "topic/topic")) {
                // Nested topics are visited as their own ChunkEntry, matching PreProcessor.addLists().
                continue;
            }
            if (DitaUtils.hasClass(child, "topic/indexterm")) {
                if (searchTopic) {
                    // IndexTerms.collect() parses the whole nested subtree itself (subterms,
                    // index-see/index-see-also, index-sort-as), so it is not walked again here.
                    this.indexTerms.collect(child, file, topic);
                }
                continue;
            }
            const type: ListTargetType | undefined = this.getTargetType(child);
            if (type !== undefined) {
                const title: string | undefined = this.getTitle(child);
                if (title !== undefined) {
                    const counter: FormalElementCounter = this.counterFor(type, tableCounter, figureCounter, exampleCounter, equationCounter);
                    counter.increment();
                    const number: string = counter.format();
                    const targetId: string = ListTarget.ensureTargetId(child, topic, result.get(type)?.length ?? 0, idRegistry);
                    const desc: DitaElement | undefined = DitaUtils.getChildByClass(child, "topic/desc");
                    const target: ListTarget = new ListTarget(type, child, topic, targetId, title, desc);
                    target.number = number;
                    result.get(type)?.push(target);
                }
                // Otherwise, ignore a table/fig/example/equation-figure with no title child, matching
                // PreProcessor.addLists() - it is not counted and does not become a list entry.
            }
            this.collectTopic(
                topic, child, file, tableCounter, figureCounter, exampleCounter, equationCounter, searchTopic, result, idRegistry
            );
        }
    }

    private counterFor(
        type: ListTargetType,
        tableCounter: FormalElementCounter,
        figureCounter: FormalElementCounter,
        exampleCounter: FormalElementCounter,
        equationCounter: FormalElementCounter
    ): FormalElementCounter {
        switch (type) {
            case ListTargetType.TABLE:
                return tableCounter;
            case ListTargetType.EQUATION:
                return equationCounter;
            case ListTargetType.FIGURE:
                return figureCounter;
            default:
                return exampleCounter;
        }
    }

    private getTargetType(element: DitaElement): ListTargetType | undefined {
        if (DitaUtils.hasClass(element, "topic/table")) {
            return ListTargetType.TABLE;
        }
        if (DitaUtils.hasClass(element, "equation-d/equation-figure")) {
            return ListTargetType.EQUATION;
        }
        if (DitaUtils.hasClass(element, "topic/fig")) {
            return ListTargetType.FIGURE;
        }
        if (DitaUtils.hasClass(element, "topic/example")) {
            return ListTargetType.EXAMPLE;
        }
        return undefined;
    }

    private getTitle(element: DitaElement): string | undefined {
        return DitaUtils.getTitleTextFromChild(element, false);
    }

    private createResult(): Map<ListTargetType, ListTarget[]> {
        const result: Map<ListTargetType, ListTarget[]> = new Map<ListTargetType, ListTarget[]>();
        for (const type of Object.values(ListTargetType)) {
            result.set(type, []);
        }
        return result;
    }
}
