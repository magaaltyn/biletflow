import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { Loading } from "@/components/ui";
import { View } from "react-native";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LangProvider } from "@/lib/i18n";
import { useColors } from "@/lib/theme";
import { ApiError } from "@/services/apiClient";

// Default header titles (screens set a more specific title once their data has loaded).
const TITLES: Record<string, string> = {
  login: "Log in", register: "Sign up", "forgot-password": "Forgot password", "reset-password": "Reset password", "verify-email": "Confirm email",
  "event/[slug]": "Event", "c/[token]": "Promo link", orders: "My orders", "order/[id]": "Order", "pay/[id]": "DEMO payment", "ticket/[id]": "Ticket",
  "support/index": "Support", "support/new": "New support case", "support/[id]": "Support case", "org-event/[id]": "Manage event", "org-event-new": "Create event",
  "org-event-edit/[id]": "Edit event", "org-profile": "Organizer profile", "attendance/[eventId]": "Attendance",
};

function RootStack() {
  const c = useColors();
  const { ready } = useAuth();
  // Screens may be opened directly (deep link, notification, reload): wait until the stored session is restored,
  // otherwise their first requests would go out without the token.
  if (!ready)
    return (
      <View style={{ flex: 1, justifyContent: "center", backgroundColor: c.bg }}>
        <Loading label="BiletFlow" />
      </View>
    );
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.card },
          headerTintColor: c.brand,
          headerTitleStyle: { color: c.ink, fontWeight: "700" },
          contentStyle: { backgroundColor: c.bg },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="(attendee)" options={{ headerShown: false }} />
        <Stack.Screen name="(organizer)" options={{ headerShown: false }} />
        <Stack.Screen name="(staff)" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="scan/[eventId]" options={{ title: "Scanner", headerShown: false }} />
        {Object.entries(TITLES).map(([name, title]) => (
          <Stack.Screen key={name} name={name} options={{ title }} />
        ))}
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            // Do not retry rejected requests (401/403/404); retry network blips twice.
            retry: (count, err) => count < 2 && (!(err instanceof ApiError) || err.isNetwork || err.status >= 500),
          },
        },
      }),
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <LangProvider>
          <AuthProvider>
            <ErrorBoundary>
              <RootStack />
            </ErrorBoundary>
          </AuthProvider>
        </LangProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
