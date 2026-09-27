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

import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { I18n } from "../i18n/I18n.js";
import { DitaUtils } from "../utils/DitaUtils.js";
import { URIComponent } from "../utils/URIComponent.js";

export class ResourceHandler {
    private media: "screen" | "print" = "screen";
    private resourcePath: string | undefined;
    private readonly urlToPath: Map<string, string> = new Map<string, string>();
    private readonly i18n: I18n;

    constructor(parameters: string | undefined, i18n: I18n) {
        this.i18n = i18n;
        if (parameters !== undefined) {
            this.parseParameters(parameters);
        }
    }

    setMedia(media: "screen" | "print"): void {
        this.media = media;
    }

    getMedia(): "screen" | "print" {
        return this.media;
    }

    parseParameters(parameters: string): void {
        const trimmed: string = parameters.trim();
        if (trimmed.length > 0) {
            this.resourcePath = trimmed;
            if (sep !== "/" && this.resourcePath.indexOf("/") >= 0) {
                this.resourcePath = this.resourcePath.split("/").join(sep);
            }
        }
    }

    reset(): void {
        this.urlToPath.clear();
    }

    handleResource(resourceURL: string, isImage: boolean, outDir: string): string | undefined {
        const existing: string | undefined = this.urlToPath.get(resourceURL);
        if (existing !== undefined) {
            return existing;
        }

        const isRemote: boolean = /^https?:\/\//i.test(resourceURL);
        const sourcePath: string = isRemote
            ? resourceURL
            : (resourceURL.startsWith("file:") ? fileURLToPath(resourceURL) : resourceURL);
        const baseName: string = isRemote
            ? URIComponent.getBaseName(new URL(resourceURL).pathname)
            : basename(sourcePath);
        if (baseName.length === 0) {
            return undefined;
        }

        const dot: number = baseName.lastIndexOf(".");
        const rootName: string = dot > 0 ? baseName.slice(0, dot) : baseName;
        const extension: string | undefined = dot > 0 ? baseName.slice(dot + 1) : undefined;

        let outFile: string = "";
        let location: string | undefined;
        for (let i: number = 0; i < 1000; ++i) {
            const name: string = ResourceHandler.joinBaseName(rootName, i, extension);
            let path: string = ResourceHandler.joinPath(this.resourcePath, name);

            const isAbsolutePath: boolean = isAbsolute(path);
            outFile = isAbsolutePath ? path : resolve(outDir, path);
            if (!ResourceHandler.isFile(outFile)) {
                if (isAbsolutePath) {
                    location = pathToFileURL(outFile).toString();
                } else {
                    if (sep !== "/" && path.indexOf(sep) >= 0) {
                        path = path.split(sep).join("/");
                    }
                    location = URIComponent.quoteFullPath(path);
                }
                break;
            }
        }
        if (location === undefined) {
            return undefined;
        }

        const resourceDir: string = dirname(outFile);
        if (!existsSync(resourceDir)) {
            mkdirSync(resourceDir, { recursive: true });
        }

        this.doHandleResource(resourceURL, sourcePath, outFile);

        this.urlToPath.set(resourceURL, location);
        return location;
    }

    private static joinBaseName(rootName: string, index: number, extension: string | undefined): string {
        let buffer: string = rootName;
        if (index > 0) {
            buffer += "-" + (1 + index).toString();
        }
        if (extension !== undefined) {
            buffer += "." + extension;
        }
        return buffer;
    }

    private static joinPath(resourcePath: string | undefined, baseName: string): string {
        if (resourcePath !== undefined) {
            let buffer: string = resourcePath;
            if (!resourcePath.endsWith(sep)) {
                buffer += sep;
            }
            return buffer + baseName;
        }
        return baseName;
    }

    private static isFile(path: string): boolean {
        return existsSync(path) && statSync(path).isFile();
    }

    private doHandleResource(resourceURL: string, sourcePath: string, outFile: string): void {
        if (/^https?:\/\//i.test(resourceURL)) {
            writeFileSync(outFile, DitaUtils.retrieveBytes(resourceURL, this.i18n));
        } else {
            copyFileSync(sourcePath, outFile);
        }
    }
}
