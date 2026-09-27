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
import { LoadedTopic } from "./LoadedTopic.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import type { Chunk } from "./Chunk.js";

export enum ChunkEntryType {
    TITLE_PAGE = "TITLE_PAGE",
    TOC = "TOC",
    FIGURE_LIST = "FIGURE_LIST",
    TABLE_LIST = "TABLE_LIST",
    EXAMPLE_LIST = "EXAMPLE_LIST",
    EQUATION_LIST = "EQUATION_LIST",
    INDEX_LIST = "INDEX_LIST",
    TOPIC = "TOPIC"
}

export enum TocType {
    NONE = "NONE",
    FRONTMATTER = "FRONTMATTER",
    BODY = "BODY",
    BACKMATTER = "BACKMATTER"
}

export function getTopicrefListType(element: DitaElement): ChunkEntryType | undefined {
    if (DitaUtils.hasClass(element, "bookmap/toc")) {
        return ChunkEntryType.TOC;
    }
    if (DitaUtils.hasClass(element, "bookmap/figurelist")) {
        return ChunkEntryType.FIGURE_LIST;
    }
    if (DitaUtils.hasClass(element, "bookmap/tablelist")) {
        return ChunkEntryType.TABLE_LIST;
    }
    if (DitaUtils.hasClass(element, "bookmap/examplelist")) {
        return ChunkEntryType.EXAMPLE_LIST;
    }
    if (DitaUtils.hasClass(element, "bookmap/equationlist")) {
        return ChunkEntryType.EQUATION_LIST;
    }
    if (DitaUtils.hasClass(element, "bookmap/indexlist")) {
        return ChunkEntryType.INDEX_LIST;
    }
    return undefined;
}

export function getTopicrefTocType(element: DitaElement): TocType {
    if (DitaUtils.getNonEmptyAttribute(element, "toc") === "no") {
        return TocType.NONE;
    }
    let current: DitaElement | undefined = DitaUtils.getTopicrefParent(element);
    while (current !== undefined) {
        if (DitaUtils.hasClass(current, "bookmap/frontmatter")) {
            return TocType.FRONTMATTER;
        }
        if (DitaUtils.hasClass(current, "bookmap/backmatter")) {
            return TocType.BACKMATTER;
        }
        current = DitaUtils.getTopicrefParent(current);
    }
    return TocType.BODY;
}

export class ChunkEntry {
    readonly chunk: Chunk;
    readonly type: ChunkEntryType;
    readonly number: string[] | undefined;
    readonly role: string | undefined;
    readonly navtitle: string | undefined;
    readonly tocType: TocType;
    readonly loadedTopic: LoadedTopic | undefined;

    constructor(
        chunk: Chunk,
        type: ChunkEntryType,
        number: string[] | undefined,
        role: string | undefined,
        navtitle: string | undefined,
        tocType: TocType,
        loadedTopic: LoadedTopic | undefined
    ) {
        this.chunk = chunk;
        this.type = type;
        this.number = number;
        this.role = role;
        this.navtitle = navtitle;
        this.tocType = tocType;
        this.loadedTopic = loadedTopic;
    }

    getElement(): DitaElement | undefined {
        return this.loadedTopic?.element;
    }

    getTargetId(): string | undefined {
        return this.loadedTopic?.topicId;
    }

    toString(): string {
        const parts: string[] = [this.type];
        if (this.number !== undefined) {
            parts.push(this.number.join(" "));
        }
        if (this.role !== undefined) {
            parts.push(this.role);
        }
        if (this.navtitle !== undefined) {
            parts.push('"' + this.navtitle + '"');
        }
        if (this.tocType !== TocType.NONE) {
            parts.push(this.tocType + " TOC");
        }
        if (this.loadedTopic !== undefined) {
            parts.push(this.loadedTopic.element.getName());
        }
        return parts.join(" ");
    }
}
