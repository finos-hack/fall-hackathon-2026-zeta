import { join, resolve } from 'node:path';

/** Default sidecars path in the zeta repo when main.js runs from dist/. */
export function defaultViewsDir(here: string): string {
    return resolve(join(here, '..', '..', '..', 'views'));
}
