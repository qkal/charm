import type { HookAdapter } from "../adapters/types.js";

type ClientInfo = {
  name: string;
  version: string;
};

type DetectPlatformResult = {
  platform: string;
};

type PlatformResolvers = {
  detectPlatform: (clientInfo?: ClientInfo) => DetectPlatformResult;
  getAdapter: (platform: any) => Promise<HookAdapter>;
};

type ClientRegistrationDeps = {
  getClientVersion: () => ClientInfo | null | undefined;
  loadResolvers?: () => Promise<PlatformResolvers>;
  log?: (message: string) => void;
};

async function defaultLoadResolvers(): Promise<PlatformResolvers> {
  const mod = await import("../adapters/detect.js");
  return {
    detectPlatform: mod.detectPlatform,
    getAdapter: mod.getAdapter,
  };
}

export async function resolveClientAdapter(
  deps: ClientRegistrationDeps,
): Promise<HookAdapter | null> {
  const loadResolvers = deps.loadResolvers ?? defaultLoadResolvers;

  try {
    const { detectPlatform, getAdapter } = await loadResolvers();
    const clientInfo = deps.getClientVersion() ?? undefined;
    const signal = detectPlatform(clientInfo);
    const adapter = await getAdapter(signal.platform);

    if (clientInfo) {
      deps.log?.(
        `MCP client: ${clientInfo.name} v${clientInfo.version} → ${signal.platform}`,
      );
    }

    return adapter;
  } catch {
    return null;
  }
}
