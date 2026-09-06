import { Link, Stack } from "expo-router";
import { Text, View, type TextStyle } from "react-native";

import { space, type, useTheme } from "../src/components/primitives";

export default function NotFoundScreen() {
  const c = useTheme();
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: space.xl,
          gap: space.md,
          backgroundColor: c.bg,
        }}
      >
        <Text style={[type.title3 as TextStyle, { color: c.text }]}>This screen doesn&apos;t exist.</Text>
        <Link href="/" style={{ color: c.accent, ...(type.body as object) }}>
          Back to the overview
        </Link>
      </View>
    </>
  );
}
