import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { PortfolioProvider } from "../src/lib/portfolioStore";
import { palettes } from "../src/theme";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = { initialRouteName: "(tabs)" };

export default function RootLayout() {
  const scheme = useColorScheme();
  const dark = scheme === "dark";
  const c = dark ? palettes.dark : palettes.light;

  // Feed the palette into React Navigation so native headers, the tab bar and
  // push transitions all pick up the same colours as the screens.
  const navTheme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(dark ? DarkTheme : DefaultTheme).colors,
      primary: c.accent,
      background: c.bg,
      card: c.surface,
      text: c.text,
      border: c.border,
    },
  };

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <PortfolioProvider>
          <StatusBar style={dark ? "light" : "dark"} />
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="holding/[ticker]"
              options={{
                // A push, not a modal: it is a drill-down into a row, and the
                // back button should say which list you came from.
                title: "Holding",
                headerBackTitle: "Holdings",
              }}
            />
          </Stack>
        </PortfolioProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
