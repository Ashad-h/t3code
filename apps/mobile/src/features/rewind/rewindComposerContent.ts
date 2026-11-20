import type { OrchestrationMessageContext } from "@t3tools/contracts";
import {
  collectComposerContextReferences,
  stripAttachmentOnlyBootstrapPrompt,
} from "@t3tools/shared/composerContextReferences";

/**
 * What a rewound message puts back in the composer. Its attachments don't come back on mobile, so
 * their chips and the attachment-only placeholder go too; they would describe files never sent.
 */
export function rewindComposerContent(input: {
  readonly text: string;
  readonly context: OrchestrationMessageContext | undefined;
}): { readonly text: string; readonly context?: OrchestrationMessageContext } {
  const records = input.context?.records ?? [];
  const attachmentContextIds = new Set<string>(
    records.flatMap((record) => ("attachmentId" in record ? [record.contextId] : [])),
  );
  let text = input.text;
  // Last to first, so earlier offsets stay valid.
  for (const occurrence of [...collectComposerContextReferences(input.text)].reverse()) {
    if (!attachmentContextIds.has(occurrence.contextId)) continue;
    const start = text[occurrence.start - 1] === " " ? occurrence.start - 1 : occurrence.start;
    text = text.slice(0, start) + text.slice(occurrence.end);
  }
  text = stripAttachmentOnlyBootstrapPrompt(text.trim()).trim();
  const kept = records.filter((record) => !("attachmentId" in record));
  return kept.length > 0 && input.context !== undefined
    ? { text, context: { ...input.context, records: kept } }
    : { text };
}
