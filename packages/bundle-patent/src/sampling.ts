/**
 * The discussion-stage sampling constant for the patent profile. Writing a
 * disclosure is creative conversation — idea evaluation, the alignment
 * interview, chapter drafting — and reads slightly better warm than
 * near-deterministic; scoring children of the review chain pin their own low
 * temperature through the workflow's per-child override, so this value is the
 * floor of warmth for top-level sessions only.
 * @module @mtl-academic/dsh-patent/sampling
 */

/** Sampling temperature pinned on the patent profile's top-level sessions. */
export const DISCUSSION_TEMPERATURE = 0.7
