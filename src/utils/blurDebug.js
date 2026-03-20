function isRuntimeBlurDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem("justus_debug_blur") === "1";
  } catch {
    return false;
  }
}

export function isBlurDebugEnabled() {
  return import.meta.env.DEV || isRuntimeBlurDebugEnabled();
}

function safeNumber(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

export function logBlurDiagnostics(element, contextLabel = "unknown") {
  if (!isBlurDebugEnabled()) {
    return;
  }

  if (!(element instanceof Element)) {
    console.log("[blur] invalid_element", { contextLabel });
    return;
  }

  const computedStyle = window.getComputedStyle(element);
  const boundingRect = element.getBoundingClientRect();

  console.log("[blur] panel_diagnostics", {
    contextLabel,
    tagName: element.tagName,
    className: element.className,
    backdropFilter: computedStyle.backdropFilter || null,
    webkitBackdropFilter: computedStyle.webkitBackdropFilter || null,
    backgroundColor: computedStyle.backgroundColor || null,
    borderColor: computedStyle.borderColor || null,
    opacity: computedStyle.opacity || null,
    width: safeNumber(boundingRect.width),
    height: safeNumber(boundingRect.height),
    x: safeNumber(boundingRect.x),
    y: safeNumber(boundingRect.y)
  });
}
