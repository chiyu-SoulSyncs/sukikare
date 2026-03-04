import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Exclude React Native / Expo modules from transform
    server: {
      deps: {
        inline: [/^(?!.*node_modules)/],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Mock React Native modules that don't work in Node
      "react-native": path.resolve(__dirname, "tests/__mocks__/react-native.ts"),
      "expo-linking": path.resolve(__dirname, "tests/__mocks__/expo-linking.ts"),
      "@react-native-async-storage/async-storage": path.resolve(__dirname, "tests/__mocks__/async-storage.ts"),
    },
  },
});
