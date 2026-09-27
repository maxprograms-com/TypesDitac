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

import { TocType } from "./ChunkEntry.js";

export class TOCInfo {
    static readonly NO_INFO: TOCInfo = new TOCInfo([], undefined, undefined, TocType.NONE);

    private number: string[];
    readonly role: string | undefined;
    readonly navtitle: string | undefined;
    readonly tocType: TocType;

    constructor(
        number: string[],
        role: string | undefined,
        navtitle: string | undefined,
        tocType: TocType
    ) {
        this.number = [...number];
        this.role = role;
        this.navtitle = navtitle;
        this.tocType = tocType;
    }

    incrementNumber(increment: number): void {
        this.number = TOCInfo.incrementNumber(this.number, increment);
    }

    getNumber(): string[] {
        return [...this.number];
    }

    toString(): string {
        const parts: string[] = [];
        if (this.number.length > 0) {
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
        return parts.join(" ");
    }

    static incrementNumber(number: string[], increment: number): string[] {
        const result: string[] = [...number];
        if (result.length === 0) {
            return result;
        }
        const last: string = result[result.length - 1];
        const position: number = last.indexOf(".");
        if (position < 0) {
            return result;
        }
        const parsed: number = Number.parseInt(last.slice(position + 1), 10);
        if (Number.isNaN(parsed)) {
            return result;
        }
        const next: number = Math.max(0, parsed + increment);
        result[result.length - 1] = last.slice(0, position + 1) + next.toString();
        return result;
    }

    static parseNumber(number: string[]): number {
        if (number.length === 0) {
            return -1;
        }
        return TOCInfo.parseNumberSegment(number[number.length - 1]);
    }

    static parseNumberSegment(segment: string): number {
        const position: number = segment.indexOf(".");
        if (position < 0) {
            return -1;
        }
        const parsed: number = Number.parseInt(segment.slice(position + 1), 10);
        return Number.isNaN(parsed) ? -1 : parsed;
    }

    static formatNumberSegment(role: string, index: number): string {
        return role + "." + index.toString();
    }
}
