export interface ElectrobunConfig {
  app: {
    name: string;
    identifier: string;
    version: string;
    description?: string;
  };
  build?: {
    copy?: Record<string, string>;
    mac?: { bundleCEF?: boolean };
    win?: { bundleCEF?: boolean };
    linux?: { bundleCEF?: boolean };
  };
}
