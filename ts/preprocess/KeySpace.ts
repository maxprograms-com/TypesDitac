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

import { KeyDefinition } from "./KeyDefinition.js";

export class KeySpace {
    readonly id: string;
    private keyscopeNames: string[];
    private parent: KeySpace | undefined;
    private readonly children: KeySpace[] = [];
    private readonly definitions: Map<string, KeyDefinition> = new Map<string, KeyDefinition>();
    private allDefinitions: KeyDefinition[] | undefined;

    constructor(id: string, keyscope?: string) {
        this.id = id;
        this.keyscopeNames = this.parseKeyscopeNames(keyscope);
    }

    initKeyscopeNames(keyscope?: string): void {
        this.keyscopeNames = this.parseKeyscopeNames(keyscope);
    }

    getKeyscopeNames(): string[] {
        return [...this.keyscopeNames];
    }

    initParentKeySpace(parent: KeySpace): void {
        this.parent = parent;
    }

    getParentKeySpace(): KeySpace | undefined {
        return this.parent;
    }

    addChildKeySpace(child: KeySpace): void {
        if (!this.children.includes(child)) {
            this.children.push(child);
        }
    }

    getChildKeySpaces(): KeySpace[] {
        return [...this.children];
    }

    set(definition: KeyDefinition): void {
        this.definitions.set(definition.key, definition);
        this.allDefinitions = undefined;
    }

    get(key: string): KeyDefinition | undefined {
        return this.definitions.get(key);
    }

    contains(key: string): boolean {
        return this.definitions.has(key);
    }

    getAll(): KeyDefinition[] {
        if (this.allDefinitions === undefined) {
            this.allDefinitions = [...this.definitions.values()];
        }
        return [...this.allDefinitions];
    }

    toString(details: boolean = false): string {
        const lines: string[] = ["Key space " + this.id];
        if (this.keyscopeNames.length > 0) {
            lines.push("keyscope=" + this.keyscopeNames.join(" "));
        }
        if (details) {
            for (const definition of this.getAll()) {
                const href: string | undefined = definition.getHref();
                lines.push("  " + definition.key + (href === undefined ? "" : "=" + href));
            }
        }
        return lines.join("\n");
    }

    private parseKeyscopeNames(keyscope?: string): string[] {
        if (keyscope === undefined) {
            return [];
        }
        return keyscope.trim().split(/\s+/).filter((name: string): boolean => name.length > 0);
    }
}