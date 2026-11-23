import { WorkspaceTabs } from "@/components/TabsLayout";

export default function Layout() {
  return <WorkspaceTabs require="staff" tabs={[
    { name: "scan-events", title: "Assigned events", icon: "qr-code-outline" },
    { name: "staff-more", title: "Profile", icon: "person-circle-outline", badge: "unread" },
  ]} />;
}
