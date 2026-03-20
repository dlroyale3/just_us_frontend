import { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { useDynamicBackgroundControls } from "./DynamicBackgroundLayout";

function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

export function DashboardLayout({
  children,
  forceSidebarCollapsed = false,
  isFullscreenApp = false
}) {
  const {
    isControlPanelOpen,
    setIsControlPanelOpen,
    toggleControlPanel,
    isSidebarOpen,
    setIsSidebarOpen,
    setControlsPresentation,
    notificationCounts
  } = useDynamicBackgroundControls();

  useEffect(() => {
    setControlsPresentation("sidebar-popover");
    setIsControlPanelOpen(false);

    if (forceSidebarCollapsed) {
      setIsSidebarOpen(false);
    }

    return () => {
      setControlsPresentation("fixed");
      setIsControlPanelOpen(false);
    };
  }, [forceSidebarCollapsed, setControlsPresentation, setIsControlPanelOpen, setIsSidebarOpen]);

  return (
    <div
      className={classNames(
        "relative w-screen",
        isFullscreenApp ? "h-screen overflow-hidden" : "min-h-screen"
      )}
      style={{ marginLeft: "calc(50% - 50vw)" }}
    >
      <Sidebar
        isOpen={isSidebarOpen}
        onToggleOpen={() => {
          setIsSidebarOpen((previousValue) => !previousValue);
        }}
        onSettingsClick={toggleControlPanel}
        isSettingsPanelOpen={isControlPanelOpen}
        notificationCounts={notificationCounts}
      />

      <main
        className={classNames(
          "transition-all duration-300 ease-in-out",
          isSidebarOpen ? "ml-64" : "ml-20",
          isFullscreenApp
            ? "h-screen min-h-0 overflow-hidden p-4"
            : "min-h-screen p-8 sm:p-10"
        )}
      >
        {children}
      </main>
    </div>
  );
}
