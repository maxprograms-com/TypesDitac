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
import { DiagnosticLog } from "../utils/DiagnosticLog.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { NodeLocation } from "../utils/NodeLocation.js";
import { URIComponent } from "../utils/URIComponent.js";
import { Flags } from "./Filter.js";
import { LoadedDocument } from "./LoadedDocument.js";

export type LoadedTopicParent = LoadedDocument | LoadedTopic;

export class LoadedTopic {
    private static nextGeneratedIdCounter: number = 0;

    readonly element: DitaElement;
    readonly parent: LoadedTopicParent;
    sourceHref: string | undefined;
    topicref: DitaElement | undefined;
    topicId: string;
    private nestedTopics: LoadedTopic[] | undefined;
    private excluded: boolean = false;
    private flags: Flags | undefined;
    private readonly diagnostics: DiagnosticLog | undefined;

    constructor(element: DitaElement, parent: LoadedTopicParent, sourceHref?: string, topicref?: DitaElement, diagnostics?: DiagnosticLog) {
        this.element = element;
        this.parent = parent;
        this.sourceHref = sourceHref;
        this.topicref = topicref;
        this.diagnostics = diagnostics;
        this.topicId = this.ensureTopicId(element);
    }

    attachReference(topicref: DitaElement, sourceHref: string): void {
        if (this.topicref === undefined) {
            this.topicref = topicref;
            this.sourceHref = sourceHref;
        }
    }

    getNestedTopics(): LoadedTopic[] {
        if (this.nestedTopics === undefined) {
            this.nestedTopics = [];
            for (const child of this.element.getChildren()) {
                if (DitaUtils.hasClass(child, "topic/topic")) {
                    this.nestedTopics.push(new LoadedTopic(child, this, undefined, undefined, this.diagnostics));
                }
            }
        }
        return this.nestedTopics;
    }

    setExcluded(excluded: boolean): void {
        this.excluded = excluded;
    }

    isExcluded(): boolean {
        return this.excluded;
    }

    setFlags(flags: Flags | undefined): void {
        this.flags = flags;
    }

    getFlags(): Flags | undefined {
        return this.flags;
    }

    getParentTopic(): LoadedTopic | undefined {
        return this.parent instanceof LoadedTopic ? this.parent : undefined;
    }

    getAncestorDocument(): LoadedDocument {
        let current: LoadedTopicParent = this.parent;
        while (current instanceof LoadedTopic) {
            current = current.parent;
        }
        return current;
    }

    getHref(): string {
        return URIComponent.setFragment(this.getAncestorDocument().path, this.topicId);
    }

    getSourceHref(): string | undefined {
        return this.sourceHref;
    }

    private ensureTopicId(element: DitaElement): string {
        const idAttribute: XMLAttribute | undefined = element.getAttribute("id");
        const existingId: string | undefined = idAttribute?.getValue().trim();
        if (existingId !== undefined && existingId.length > 0 && existingId !== "???") {
            if (DitaUtils.isValidId(existingId)) {
                return existingId;
            }
            if (this.diagnostics !== undefined) {
                this.diagnostics.warning(
                    this.diagnostics.i18n.format(
                        this.diagnostics.i18n.getString("Filter", "invalidAttribute"),
                        [existingId, "id"]
                    ),
                    NodeLocation.of(this.getAncestorDocument().path, element)
                );
            }
        }
        // A monotonically increasing counter provides per-instance uniqueness.
        const generatedId: string = "I_" + (++LoadedTopic.nextGeneratedIdCounter).toString(36) + "_";
        element.setAttribute(new XMLAttribute("id", generatedId));
        return generatedId;
    }
}