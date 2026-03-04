// Mock for expo-modules-core in test environment
export const NativeModulesProxy = {};
export const EventEmitter = class {};
export const Platform = { OS: "ios", select: (obj: any) => obj.ios ?? obj.default };
export function requireNativeModule(name: string) { return {}; }
export function requireOptionalNativeModule(name: string) { return null; }
export function registerWebModule(cls: any) { return cls; }
export default {};
