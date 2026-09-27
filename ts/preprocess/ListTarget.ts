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
import { DitaUtils } from "../utils/DitaUtils.js";
import { URIComponent } from "../utils/URIComponent.js";
import { LoadedTopic } from "./LoadedTopic.js";

export enum ListTargetType {
    FIGURE = "figure",
    TABLE = "table",
    EXAMPLE = "example",
    EQUATION = "equation",
    INDEX_TERM = "indexterm"
}

export class ListTarget {
    readonly type: ListTargetType;
    readonly element: DitaElement;
    readonly sourceTopic: LoadedTopic;
    targetId: string;
    readonly title: string | undefined;
    number: string | undefined;
    readonly desc: DitaElement | undefined;

    constructor(
        type: ListTargetType,
        element: DitaElement,
        sourceTopic: LoadedTopic,
        targetId: string,
        title: string | undefined,
        desc: DitaElement | undefined = undefined
    ) {
        this.type = type;
        this.element = element;
        this.sourceTopic = sourceTopic;
        this.targetId = targetId;
        this.title = title;
        this.desc = desc;
    }

    getHref(): string {
        return URIComponent.setFragment(this.sourceTopic.getAncestorDocument().path, this.targetId);
    }

    static ensureTargetId(element: DitaElement, sourceTopic: LoadedTopic, ordinal: number, idRegistry: Map<string, DitaElement>): string {
        const idAttribute: XMLAttribute | undefined = element.getAttribute("id");
        if (idAttribute !== undefined && idAttribute.getValue().trim().length > 0) {
            return idAttribute.getValue();
        }
        const candidate: string = sourceTopic.topicId + "-" + element.getName() + "-" + ordinal.toString();
        const generatedId: string = DitaUtils.makeUniqueId(candidate, idRegistry, element);
        element.setAttribute(new XMLAttribute("id", generatedId));
        return generatedId;
    }
}
