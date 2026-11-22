import { WorkspaceTabs } from "@/components/TabsLayout";
import { useT } from "@/lib/i18n";

export default function Layout() {
  const { t } = useT();
  return <WorkspaceTabs tabs={[
    { name: "home", title: "BiletFlow", label: t("home"), icon: "home-outline" },
    { name: "search", title: t("search"), icon: "search-outline" },
    { name: "my-tickets", title: t("myTickets"), icon: "ticket-outline" },
    { name: "inbox", title: t("notifications"), icon: "notifications-outline", badge: "unread" },
    { name: "profile", title: t("account"), icon: "person-circle-outline" },
  ]} />;
}
