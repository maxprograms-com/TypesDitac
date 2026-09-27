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
import { Chunk } from "./Chunk.js";
import { Chunker, ChunkerResult } from "./Chunker.js";
import { LoadedDocuments } from "./LoadedDocuments.js";
import { LoadedTopic } from "./LoadedTopic.js";
import { TOCInfo } from "./TOCInfo.js";

export class ChunkPlan {
    readonly chunks: Chunk[];
    private readonly topicChunks: Map<LoadedTopic, Chunk>;

    private constructor(chunks: Chunk[], topicChunks: Map<LoadedTopic, Chunk>) {
        this.chunks = chunks;
        this.topicChunks = topicChunks;
    }

    static fromMap(
        root: DitaElement | undefined,
        documents: LoadedDocuments,
        mapPath: string,
        diagnostics: DiagnosticLog,
        rootName: string | undefined,
        isBookmap: boolean = false,
        partRestartsChapterNumber: boolean = false
    ): ChunkPlan {
        if (root === undefined) {
            return new ChunkPlan([], new Map());
        }

        const rootChunkValue: string | undefined = root.getAttribute("chunk")?.getValue();
        const byTopic: boolean = rootChunkValue !== undefined && rootChunkValue.includes("by-topic");
        const chunker: Chunker = new Chunker(byTopic, rootName, documents, diagnostics, mapPath);
        const result: ChunkerResult = chunker.processMap(root);

        const plan: ChunkPlan = new ChunkPlan(result.chunks, result.topicChunks);
        if (isBookmap && !partRestartsChapterNumber) {
            this.numberChapters(plan.chunks);
        }
        return plan;
    }

    private static numberChapters(chunks: Chunk[]): void {
        let chapterCount: number = 0;
        let appendixCount: number = 0;
        let lastChapterKey: string | undefined;
        let lastAppendixKey: string | undefined;

        for (const chunk of chunks) {
            for (const entry of chunk.getEntries()) {
                const segments: string[] | undefined = entry.number;
                if (segments === undefined) {
                    continue;
                }

                let partIndex: number = -1;
                let appendixIndex: number = -1;
                let chapterIndex: number = -1;
                let appendicesIndex: number = -1;
                for (let i: number = 0; i < segments.length; i++) {
                    const segment: string = segments[i];
                    if (segment.startsWith("chapter.")) {
                        chapterIndex = i;
                        break;
                    } else if (segment.startsWith("appendix.")) {
                        appendixIndex = i;
                        break;
                    } else if (segment.startsWith("part.")) {
                        partIndex = i;
                    } else if (segment.startsWith("appendices.")) {
                        appendicesIndex = i;
                    }
                }

                if (chapterIndex >= 0) {
                    const chapterNumber: number = TOCInfo.parseNumberSegment(segments[chapterIndex]);
                    if (chapterNumber > 0) {
                        // No part is interpreted as part #0.
                        const partNumber: number = partIndex >= 0 ? TOCInfo.parseNumberSegment(segments[partIndex]) : 0;
                        if (partNumber >= 0) {
                            const key: string = partNumber + ":" + chapterNumber;
                            if (key !== lastChapterKey) {
                                lastChapterKey = key;
                                chapterCount++;
                            }
                            segments[chapterIndex] = TOCInfo.formatNumberSegment("chapter", chapterCount);
                        }
                    }
                } else if (appendixIndex >= 0) {
                    const appendixNumber: number = TOCInfo.parseNumberSegment(segments[appendixIndex]);
                    if (appendixNumber > 0) {
                        // No appendices is interpreted as appendices #0.
                        const appendicesNumber: number = appendicesIndex >= 0 ? TOCInfo.parseNumberSegment(segments[appendicesIndex]) : 0;
                        if (appendicesNumber >= 0) {
                            const key: string = appendicesNumber + ":" + appendixNumber;
                            if (key !== lastAppendixKey) {
                                lastAppendixKey = key;
                                appendixCount++;
                            }
                            segments[appendixIndex] = TOCInfo.formatNumberSegment("appendix", appendixCount);
                        }
                    }
                }
            }
        }
    }

    getChunk(topic: LoadedTopic): Chunk | undefined {
        return this.topicChunks.get(topic);
    }

    getTopicChunks(): ReadonlyMap<LoadedTopic, Chunk> {
        return this.topicChunks;
    }
}
