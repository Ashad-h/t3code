import { describe, expect, it } from "vite-plus/test";

import { appAtomRegistry } from "../../state/atom-registry";
import { beginThreadRewind, endThreadRewind, threadRewindingAtom } from "./rewindLock";

describe("thread rewind lock", () => {
  it("lets one rewind run per thread until it ends", () => {
    expect(beginThreadRewind("env:thread-a")).toBe(true);
    expect(appAtomRegistry.get(threadRewindingAtom("env:thread-a"))).toBe(true);
    // A second tap on the same thread, on this or another message, waits for the first.
    expect(beginThreadRewind("env:thread-a")).toBe(false);
    // Other threads are independent.
    expect(beginThreadRewind("env:thread-b")).toBe(true);

    endThreadRewind("env:thread-a");
    expect(appAtomRegistry.get(threadRewindingAtom("env:thread-a"))).toBe(false);
    expect(beginThreadRewind("env:thread-a")).toBe(true);
    endThreadRewind("env:thread-a");
    endThreadRewind("env:thread-b");
  });
});
