export const Platform = { OS: "web", select: (obj: any) => obj.web ?? obj.default };
export const Linking = { openURL: async () => {}, canOpenURL: async () => true };
