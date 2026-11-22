import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, Tabs } from "expo-router";
import { useAuth, workspacesFor, type Workspace } from "@/features/auth/AuthProvider";
import { useColors } from "@/lib/theme";
import { api } from "@/services/api";

export interface TabDef {
  name: string;
  title: string;
  label?: string;
  icon: keyof typeof Ionicons.glyphMap;
  badge?: "unread";
}

/** Shared tab bar for the four workspaces. The server enforces permissions; this only keeps navigation tidy. */
export function WorkspaceTabs({ tabs, require }: { tabs: TabDef[]; require?: Workspace }) {
  const c = useColors();
  const { user, ready } = useAuth();
  const unread = useQuery({
    queryKey: ["notifications"],
    enabled: Boolean(user) && tabs.some((t) => t.badge),
    refetchInterval: 30_000,
    queryFn: () => api.get<{ unread: number; items: unknown[] }>("/notifications"),
  });
  if (require && ready && !workspacesFor(user).includes(require)) return <Redirect href="/home" />;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line },
        headerStyle: { backgroundColor: c.card },
        headerTitleStyle: { color: c.ink, fontWeight: "800" },
      }}
    >
      {tabs.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarLabel: t.label ?? t.title,
            tabBarIcon: ({ color, size }) => <Ionicons name={t.icon} color={String(color)} size={size} />,
            tabBarBadge: t.badge === "unread" && unread.data?.unread ? unread.data.unread : undefined,
          }}
        />
      ))}
    </Tabs>
  );
}
