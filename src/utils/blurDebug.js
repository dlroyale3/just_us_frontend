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

  void contextLabel;
  void safeNumber;
  if (!(element instanceof Element)) {
    return;
  }
}
