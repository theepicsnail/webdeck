import { vi } from "vitest";
import type {
  WebDeckConnectionStatus,
  WebDeckLogDirection,
  WebDeckModuleControllerHost,
} from "../../src/modules/types";

export function createControllerHost(initial: Record<string, string>) {
  const config = { ...initial };
  const statuses: WebDeckConnectionStatus[] = [];
  const logs: Array<{ direction: WebDeckLogDirection; message: string }> = [];

  const host: WebDeckModuleControllerHost = {
    getConfig: vi.fn(() => config),
    setConfigValue: vi.fn((key: string, value: string) => {
      config[key] = value;
    }),
    setStatus: vi.fn((status: WebDeckConnectionStatus) => statuses.push(status)),
    log: vi.fn((direction: WebDeckLogDirection, message: string) => logs.push({ direction, message })),
  };

  return { host, config, statuses, logs };
}
