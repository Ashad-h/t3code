import {
  ATTACHMENT_ONLY_BOOTSTRAP_PROMPT,
  formatComposerContextReference,
  threadContextRecord,
  toComposerContextId,
} from "@t3tools/shared/composerContextReferences";
import type { OrchestrationMessageContext } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { rewindComposerContent } from "./rewindComposerContent";

const image = {
  version: 1,
  contextId: toComposerContextId("ctx_i"),
  kind: "image",
  label: "shot.png",
  attachmentId: "att_1",
  name: "shot.png",
  mimeType: "image/png",
  sizeBytes: 10,
} as OrchestrationMessageContext["records"][number];

const thread = threadContextRecord(
  { environmentId: "env" as never, threadId: "other-thread" as never },
  "Other thread",
);

describe("rewindComposerContent", () => {
  it("drops the placeholder a photo-only message was sent with", () => {
    expect(
      rewindComposerContent({
        text: ATTACHMENT_ONLY_BOOTSTRAP_PROMPT,
        context: { version: 1, records: [image] },
      }),
    ).toEqual({ text: "" });
  });

  it("removes chips of attachments that don't come back and keeps other mentions", () => {
    const imageChip = formatComposerContextReference(image);
    const threadChip = formatComposerContextReference(thread);
    expect(
      rewindComposerContent({
        text: `Compare ${imageChip} with ${threadChip}`,
        context: { version: 1, records: [image, thread] },
      }),
    ).toEqual({
      text: `Compare with ${threadChip}`,
      context: { version: 1, records: [thread] },
    });
  });

  it("keeps a plain message as it was sent", () => {
    expect(rewindComposerContent({ text: "Fix the login", context: undefined })).toEqual({
      text: "Fix the login",
    });
  });
});
