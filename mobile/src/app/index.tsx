import { Redirect } from "expo-router";
import { useAuth } from "@/features/auth/AuthProvider";
import { Loading, Screen } from "@/components/ui";

/** Entry: open the workspace the user last used (attendee for guests). */
export default function Index() {
  const { ready, user, workspace } = useAuth();
  if (!ready)
    return (
      <Screen scroll={false}>
        <Loading />
      </Screen>
    );
  if (!user) return <Redirect href="/welcome" />;
  if (workspace === "organizer") return <Redirect href="/dashboard" />;
  if (workspace === "staff") return <Redirect href="/scan-events" />;
  if (workspace === "admin") return <Redirect href="/admin" />;
  return <Redirect href="/home" />;
}
