/** A failure that the lens shows to the user, as application/problem+json. */
export class Problem extends Error {
    constructor(
        readonly status: number,
        readonly title: string,
        readonly detail?: string
    ) {
        super(detail ? `${title}: ${detail}` : title);
    }
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && v !== '';

/** True when the document has the fields the lens reads; a bad document is a 400, not a crash. */
export function hasArchitectureShape(value: unknown): boolean {
    if (!isRec(value) || !Array.isArray(value.nodes) || !Array.isArray(value.relationships)) return false;
    const okNode = (n: unknown): boolean =>
        isRec(n) && isId(n['unique-id']) && typeof n['node-type'] === 'string';
    const okRel = (r: unknown): boolean => {
        if (!isRec(r) || !isId(r['unique-id'])) return false;
        const rt = r['relationship-type'];
        if (!isRec(rt)) return false;
        for (const k of ['connects', 'interacts', 'composed-of', 'deployed-in'] as const) {
            const c = rt[k];
            if (c === undefined) continue;
            if (!isRec(c)) return false;
            if (k === 'interacts') {
                if (typeof c['actor'] !== 'string') return false;
            } else if (k === 'composed-of' || k === 'deployed-in') {
                if (typeof c['container'] !== 'string' || !Array.isArray(c['nodes'])) return false;
            } else {
                const s = c['source'];
                const d = c['destination'];
                if (!isRec(s) || typeof s['node'] !== 'string') return false;
                if (!isRec(d) || typeof d['node'] !== 'string') return false;
            }
        }
        return true;
    };
    return (value.nodes as unknown[]).every(okNode) && (value.relationships as unknown[]).every(okRel);
}
