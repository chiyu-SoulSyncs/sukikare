// Mock for expo-web-browser in test environment
export const openAuthSessionAsync = async () => ({ type: "cancel" });
export const openBrowserAsync = async () => ({ type: "cancel" });
export const dismissBrowser = () => {};
export const maybeCompleteAuthSession = () => ({ type: "failed" });
export default { openAuthSessionAsync, openBrowserAsync, dismissBrowser, maybeCompleteAuthSession };
