// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  // Navigation
  "house.fill": "home",
  "calendar": "calendar-today",
  "calendar.fill": "calendar-today",
  "bookmark.fill": "bookmark",
  "gearshape.fill": "settings",
  "paperplane.fill": "send",
  // UI actions
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "chevron.down": "expand-more",
  "chevron.up": "expand-less",
  "chevron.left.forwardslash.chevron.right": "code",
  "xmark": "close",
  "xmark.circle.fill": "cancel",
  "checkmark": "check",
  "checkmark.circle.fill": "check-circle",
  "plus": "add",
  "plus.circle.fill": "add-circle",
  "trash": "delete",
  "trash.fill": "delete",
  "pencil": "edit",
  "square.and.pencil": "edit",
  // Calendar
  "calendar.badge.plus": "event",
  "clock": "access-time",
  "clock.fill": "access-time",
  // Message/Copy
  "doc.on.doc": "content-copy",
  "doc.on.doc.fill": "content-copy",
  "square.and.arrow.up": "share",
  "square.and.arrow.up.fill": "share",
  "text.bubble": "chat-bubble-outline",
  "text.bubble.fill": "chat-bubble",
  // Status
  "star.fill": "star",
  "exclamationmark.circle": "error-outline",
  "info.circle": "info-outline",
  "person.circle.fill": "account-circle",
  "person.fill": "person",
  "arrow.right.circle.fill": "arrow-circle-right",
  "arrow.left": "arrow-back",
  "link": "link",
  "magnifyingglass": "search",
  "slider.horizontal.3": "tune",
  "calendar.badge.clock": "event-available",
} as unknown as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
