import { DashboardLayout } from "../components/layout/DashboardLayout";
import { RelaxFireworks } from "../components/relax/RelaxFireworks";
import { useSettings } from "../context/SettingsContext";

export function RelaxPage() {
  const { notificationVolume, isNotificationMuted } = useSettings();

  return (
    <DashboardLayout forceSidebarCollapsed isFullscreenApp>
      <RelaxFireworks notificationVolume={notificationVolume} isNotificationMuted={isNotificationMuted} />
    </DashboardLayout>
  );
}
