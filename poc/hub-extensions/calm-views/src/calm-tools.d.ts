declare module '../../../tools/dist/calm.js' {
    export interface ViewResolution {
        inNodes: Set<string>;
        inRels: Set<string>;
        liftedEndpoints: Map<string, string[]>;
        excluded: Map<string, unknown[]>;
        warnings: string[];
    }
    export function resolveView(
        arch: { nodes?: unknown[]; relationships?: unknown[] },
        filter: Record<string, unknown>
    ): ViewResolution;
}
