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

export class URIComponent {
    private static readonly UNRESERVED_MARKS: string = "-_.!~*'()";
    private static readonly PATH_LEGAL: string = URIComponent.UNRESERVED_MARKS + ",;:$&+=/@";
    private static readonly FRAGMENT_LEGAL: string = URIComponent.UNRESERVED_MARKS + ";/?:@&=+$,[]";

    private constructor() {
    }

    private static isAlphanumeric(code: number): boolean {
        return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    }

    private static isSpaceChar(character: string): boolean {
        return /^[\p{Zs}\p{Zl}\p{Zp}]$/u.test(character);
    }

    private static isISOControl(code: number): boolean {
        return code <= 31 || (code >= 127 && code <= 159);
    }

    private static isOther(character: string, code: number): boolean {
        return code > 127 && !URIComponent.isSpaceChar(character) && !URIComponent.isISOControl(code);
    }

    private static percentEncode(character: string): string {
        let result: string = "";
        for (const byte of Buffer.from(character, "utf8")) {
            result += "%" + (byte < 16 ? "0" : "") + byte.toString(16).toUpperCase();
        }
        return result;
    }

    private static quote(value: string, legal: string): string {
        let result: string = "";
        for (const character of value) {
            const code: number = character.codePointAt(0) as number;
            if ((code < 128 && (URIComponent.isAlphanumeric(code) || legal.includes(character))) ||
                URIComponent.isOther(character, code)) {
                result += character;
            } else {
                result += URIComponent.percentEncode(character);
            }
        }
        return result;
    }

    static quotePath(path: string): string {
        return URIComponent.quote(path, URIComponent.PATH_LEGAL);
    }

    static quoteFullPath(path: string): string {
        return path.split("/").map((segment: string): string => segment.length > 0 ? URIComponent.quotePath(segment) : "").join("/");
    }

    static quoteFragment(fragment: string): string {
        return URIComponent.quote(fragment, URIComponent.FRAGMENT_LEGAL);
    }

    static encode(value: string): string {
        let result: string = "";
        for (const character of value) {
            const code: number = character.codePointAt(0) as number;
            if (code <= 127 && !URIComponent.isSpaceChar(character) && !URIComponent.isISOControl(code)) {
                result += character;
            } else {
                result += URIComponent.percentEncode(character);
            }
        }
        return result;
    }

    static decode(value: string): string {
        if (!value.includes("%")) {
            return value;
        }
        const source: Buffer = Buffer.from(value, "utf8");
        const target: number[] = [];
        for (let index: number = 0; index < source.length; index++) {
            const byte: number = source[index];
            if (byte === 37 && index + 2 < source.length) {
                const high: number = URIComponent.fromHexDigit(source[index + 1]);
                const low: number = URIComponent.fromHexDigit(source[index + 2]);
                if (high >= 0 && low >= 0) {
                    target.push((high << 4) | low);
                    index += 2;
                    continue;
                }
            }
            target.push(byte);
        }
        return Buffer.from(target).toString("utf8");
    }

    private static fromHexDigit(byte: number): number {
        if (byte >= 48 && byte <= 57) {
            return byte - 48;
        }
        if (byte >= 65 && byte <= 70) {
            return byte - 55;
        }
        if (byte >= 97 && byte <= 102) {
            return byte - 87;
        }
        return -1;
    }

    static getRawFragment(location: string): string | undefined {
        const position: number = location.lastIndexOf("#");
        return position < 0 ? undefined : location.substring(position + 1);
    }

    static getFragment(location: string): string | undefined {
        const fragment: string | undefined = URIComponent.getRawFragment(location);
        return fragment === undefined ? undefined : URIComponent.decode(fragment);
    }

    static setRawFragment(location: string, fragment: string | undefined): string {
        const position: number = location.lastIndexOf("#");
        if (position < 0) {
            return fragment === undefined ? location : location + "#" + fragment;
        }
        return fragment === undefined ? location.substring(0, position) : location.substring(0, position + 1) + fragment;
    }

    static setFragment(location: string, fragment: string | undefined): string {
        return URIComponent.setRawFragment(location, fragment === undefined ? undefined : URIComponent.quoteFragment(fragment));
    }

    static getRawBaseName(path: string): string {
        if (path === "/") {
            return "";
        }
        let normalized: string = path;
        if (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length - 1);
        }
        const slash: number = normalized.lastIndexOf("/");
        return slash < 0 ? normalized : normalized.substring(slash + 1);
    }

    static getBaseName(path: string): string {
        return URIComponent.decode(URIComponent.getRawBaseName(path));
    }
}
