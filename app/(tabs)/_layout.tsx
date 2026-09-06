import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { useColorScheme, type ColorValue } from "react-native";

import { palettes } from "../../src/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const icon =
  (name: IconName) =>
  ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} size={size} color={color as string} />
  );

export default function TabLayout() {
  const scheme = useColorScheme();
  const c = scheme === "dark" ? palettes.dark : palettes.light;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textTertiary,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.text,
        headerTitleStyle: { color: c.text },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Overview", tabBarIcon: icon("leaf-outline") }}
      />
      <Tabs.Screen
        name="holdings"
        options={{ title: "Holdings", tabBarIcon: icon("list-outline") }}
      />
      <Tabs.Screen
        name="quality"
        options={{
          title: "Data Quality",
          tabBarLabel: "Quality",
          tabBarIcon: icon("grid-outline"),
        }}
      />
      <Tabs.Screen
        name="import"
        options={{ title: "Import", tabBarIcon: icon("cloud-upload-outline") }}
      />
      <Tabs.Screen
        name="info"
        options={{ title: "Methodology", tabBarLabel: "Info", tabBarIcon: icon("book-outline") }}
      />
    </Tabs>
  );
}
