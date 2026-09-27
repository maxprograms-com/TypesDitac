/*
 * Portions Copyright (c) 2026 Maxprograms SAS. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export class I18n {
    private readonly resources: Record<string, Record<string, string>>;

    constructor(resourcesFile: string) {
        const data: string = readFileSync(resourcesFile, "utf8");
        this.resources = JSON.parse(data);
    }

    static load(baseDir: string, baseName: string, lang: string): I18n {
        const primaryPath: string = resolve(baseDir, baseName + "_" + lang + ".json");
        if (existsSync(primaryPath)) {
            return new I18n(primaryPath);
        }
        const fallbackPath: string = resolve(baseDir, baseName + "_en.json");
        return new I18n(fallbackPath);
    }

    getString(group: string, key: string): string {
        const groupStrings: Record<string, string> | undefined = this.resources[group];
        if (groupStrings !== undefined) {
            const value: string | undefined = groupStrings[key];
            if (value !== undefined) {
                return value;
            }
        }
        return "!" + key + "!";
    }

    format(text: string, params: string[]): string {
        let result: string = text;
        for (let index: number = 0; index < params.length; index++) {
            result = result.replace("{" + index.toString() + "}", params[index]);
        }
        return result;
    }
}
