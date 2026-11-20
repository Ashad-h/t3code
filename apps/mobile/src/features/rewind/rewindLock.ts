import { Atom } from "effect/reactivity";

import { appAtomRegistry } from "../../state/atom-registry";

// A second rewind on the same thread while the first rolls back would race it on the server.
const rewindingThreadKeysAtom = Atom.make<Readonly<Record<string, true>>>({}).pipe(
  Atom.keepAlive,
  Atom.withLabel("mobile-rewind:rewinding-thread-keys"),
);

export const threadRewindingAtom = Atom.family((threadKey: string) =>
  Atom.make((get) => get(rewindingThreadKeysAtom)[threadKey] === true).pipe(
    Atom.withLabel(`mobile-rewind:rewinding:${threadKey}`),
  ),
);

/** False when a rewind already runs on this thread. */
export function beginThreadRewind(threadKey: string): boolean {
  const current = appAtomRegistry.get(rewindingThreadKeysAtom);
  if (current[threadKey]) return false;
  appAtomRegistry.set(rewindingThreadKeysAtom, { ...current, [threadKey]: true });
  return true;
}

export function endThreadRewind(threadKey: string): void {
  const { [threadKey]: _ended, ...rest } = appAtomRegistry.get(rewindingThreadKeysAtom);
  appAtomRegistry.set(rewindingThreadKeysAtom, rest);
}
