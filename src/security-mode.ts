import type { SecurityMode, SecurityModeResolution } from "./types.js";

export const DEFAULT_SECURITY_MODE: SecurityMode = "compat";
export const SECURITY_MODE_VALUES: readonly SecurityMode[] = ["compat", "strict"] as const;

export function resolveSecurityMode(rawValue: string | undefined): SecurityModeResolution {
  if (!rawValue || rawValue.trim().length === 0) {
    return { mode: DEFAULT_SECURITY_MODE, failOpen: true };
  }

  const normalizedInput = rawValue.trim().toLowerCase();
  if (normalizedInput === "compat") {
    return { mode: "compat", normalizedInput, failOpen: true };
  }
  if (normalizedInput === "strict") {
    return { mode: "strict", normalizedInput, failOpen: false };
  }

  return {
    mode: DEFAULT_SECURITY_MODE,
    normalizedInput,
    failOpen: true,
    warning:
      `Invalid CHARM_SECURITY_MODE="${rawValue}". ` +
      `Expected one of: ${SECURITY_MODE_VALUES.join(", ")}. ` +
      `Falling back to "${DEFAULT_SECURITY_MODE}".`,
  };
}

