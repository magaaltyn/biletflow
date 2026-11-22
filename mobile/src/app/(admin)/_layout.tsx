import { WorkspaceTabs } from "@/components/TabsLayout";

export default function Layout() {
  return <WorkspaceTabs require="admin" tabs={[
    { name: "admin", title: "Overview", icon: "speedometer-outline" },
    { name: "admin-search", title: "Search", icon: "search-outline" },
    { name: "admin-review", title: "Review", icon: "shield-checkmark-outline" },
    { name: "admin-support", title: "Support", icon: "chatbubbles-outline" },
    { name: "admin-more", title: "Settings", icon: "settings-outline", badge: "unread" },
  ]} />;
}
