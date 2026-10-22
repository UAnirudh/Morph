"use client";

import * as React from "react";

/**
 * Applies interface-level accessibility preferences to the document so font
 * size and motion settings affect the whole surface, not just the canvas.
 */
export function AccessibilityBridge({
  fontSize,
  highContrast,
  reduceMotion,
  density,
}: {
  fontSize: string;
  highContrast: boolean;
  reduceMotion: boolean;
  density: string;
}) {
  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.fontSize = fontSize;
    root.dataset.contrast = highContrast ? "high" : "normal";
    root.dataset.reduceMotion = reduceMotion ? "true" : "false";
    root.dataset.density = density;
  }, [fontSize, highContrast, reduceMotion, density]);

  return null;
}
