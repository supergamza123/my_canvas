/**
 * Interaction tools are implemented in `editor.ts` as a single pointer state
 * machine so pan/select/create/brush share one hot path (better for perf).
 */
export type { ToolId } from '../nodes'
