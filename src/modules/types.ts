export type WebDeckConfigField = {
  key: string;
  label: string;
  type: "text" | "number" | "password";
  defaultValue: string;
  placeholder?: string;
  required?: boolean;
};

export type WebDeckModuleContext = {
  config: Record<string, string>;
};

export type WebDeckEventContext = WebDeckModuleContext & {
  params: Record<string, string>;
};

export type WebDeckConnectionStatus =
  | "disabled"
  | "connecting"
  | "connected"
  | "error";

export type WebDeckLogDirection = "system" | "incoming" | "outgoing" | "error";

export type WebDeckModuleControllerHost = {
  getConfig: () => Record<string, string>;
  setConfigValue?: (key: string, value: string) => void;
  setStatus: (status: WebDeckConnectionStatus) => void;
  log: (direction: WebDeckLogDirection, message: string) => void;
};

export type WebDeckModuleController = {
  connect?: () => void | Promise<void>;
  disconnect?: () => void | Promise<void>;
  dispose?: () => void | Promise<void>;
  getStatus: () => WebDeckConnectionStatus;
  triggerEvent?: (
    event: WebDeckModuleEvent,
    params: Record<string, string>,
  ) => void | Promise<void>;
};

export type WebDeckModuleEvent = {
  id: string;
  name: string;
  description?: string;
  parameterFields: WebDeckConfigField[];
  buildMessage?: (context: WebDeckEventContext) => string;
};

export type WebDeckModule = {
  id: string;
  name: string;
  description: string;
  configFields: WebDeckConfigField[];
  events?: WebDeckModuleEvent[];
  createController?: (
    host: WebDeckModuleControllerHost,
  ) => WebDeckModuleController;
};

export type ExternalModuleNamespace = {
  default?: unknown;
  webDeckModule?: unknown;
};
