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

export class CheckURL {
    static async run(url: string): Promise<void> {
        let exists: boolean = false;
        try {
            let response: Response = await fetch(url, { method: "HEAD", redirect: "follow" });
            if (response.status === 405) {
                response = await fetch(url, { method: "GET", redirect: "follow" });
            }
            exists = response.status === 200;
        } catch {
            exists = false;
        }
        process.stdout.write(exists ? "true" : "false");
    }
}

const url: string | undefined = process.argv[2];
if (url === undefined) {
    console.error("Missing URL");
    process.exitCode = 1;
} else {
    CheckURL.run(url).catch((): void => {
        process.stdout.write("false");
    });
}
