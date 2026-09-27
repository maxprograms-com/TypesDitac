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

export class Fetch {
    static async run(url: string): Promise<void> {
        const response: Response = await fetch(url, { redirect: "follow" });
        if (!response.ok) {
            throw new Error("HTTP " + response.status + " " + response.statusText);
        }
        const bytes: Uint8Array = new Uint8Array(await response.arrayBuffer());
        process.stdout.write(Buffer.from(bytes).toString("base64"));
    }
}

const url: string | undefined = process.argv[2];
if (url === undefined) {
    console.error("Missing URL");
    process.exitCode = 1;
} else {
    Fetch.run(url).catch((error: unknown): void => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
