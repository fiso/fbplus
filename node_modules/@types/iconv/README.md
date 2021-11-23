# Installation
> `npm install --save @types/iconv`

# Summary
This package contains type definitions for iconv (https://github.com/bnoordhuis/node-iconv).

# Details
Files were exported from https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/iconv.
## [index.d.ts](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/iconv/index.d.ts)
````ts
// Type definitions for iconv 3.0
// Project: https://github.com/bnoordhuis/node-iconv
// Definitions by: delphinus <https://github.com/delphinus35>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/// <reference types="node" />

import { Stream } from 'stream';

interface Static {
    new (fromEncoding: string, toEncoding: string): Iconv;
    (fromEncoding: string, toEncoding: string): Iconv;
    prototype: Iconv;
}

export interface Iconv extends Stream {
    readonly writable: true;
    convert(input: string, encoding?: BufferEncoding): Buffer;
    convert(input: Buffer): Buffer;
    write(input: string, encoding?: BufferEncoding): boolean;
    write(input: Buffer): boolean;

    end(input: string, encoding?: BufferEncoding): void;
    end(input?: Buffer): void;
}

export const Iconv: Static;

export {};

````

### Additional Details
 * Last updated: Mon, 21 Jun 2021 16:31:14 GMT
 * Dependencies: [@types/node](https://npmjs.com/package/@types/node)
 * Global values: none

# Credits
These definitions were written by [delphinus](https://github.com/delphinus35).
