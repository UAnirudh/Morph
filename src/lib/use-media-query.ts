"use client";

import * as React from "react";

/**
 * Subscribe to a CSS media query. Used to render exactly one copy of a
 * responsive surface (for example the Morph panel, which is a sidebar on wide
 * screens and a drawer otherwise) instead of shipping both in the DOM.
 *
 * The server snapshot is `false`, so markup rendered on the server matches the
 * narrow layout; the client corrects it on hydration when the query matches.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
