import { WorkspaceTabs } from "@/components/TabsLayout";

export default function Layout() {
  return <WorkspaceTabs require="organizer" tabs={[
    { name: "dashboard", title: "Dashboard", icon: "stats-chart-outline" },
    { name: "org-events", title: "My events", icon: "calendar-outline" },
    { name: "org-support", title: "Support", icon: "chatbubbles-outline" },
    { name: "org-more", title: "Profile", icon: "person-circle-outline", badge: "unread" },
  ]} />;
}
