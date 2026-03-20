import { Inbox, Leaf, Menu, MessageCircle, PenTool, Settings, X } from "lucide-react";
import { NavLink } from "react-router-dom";

function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

function SidebarIconButton({
  icon: Icon,
  label,
  isActive = false,
  onClick,
  to,
  isSidebarOpen,
  badgeCount = 0,
  dataSettingsToggle = false,
  className,
  disabled = false
}) {
  const getBaseClassName = (activeState) => classNames(
    "relative flex h-12 items-center justify-center rounded-xl p-3 backdrop-blur-md transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
    isSidebarOpen ? "w-full justify-start gap-3" : "w-12",
    activeState
      ? "bg-emerald-500 border border-emerald-400 text-white scale-105 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
      : "bg-white/5 border border-white/10 text-white hover:bg-emerald-500/20 hover:border-emerald-500/30 hover:scale-110 hover:shadow-[0_0_15px_rgba(16,185,129,0.15)]",
    disabled ? "cursor-not-allowed opacity-60" : "",
    className
  );

  const content = (
    <>
      <div className="relative inline-flex shrink-0">
        <Icon size={19} strokeWidth={2.1} className="shrink-0" />
        {badgeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-white/20 bg-red-500/80 px-1 text-[10px] text-white shadow-lg backdrop-blur-md">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </div>
      <span
        className={classNames(
          "whitespace-nowrap text-xs font-semibold uppercase tracking-[0.14em] transition-all duration-300",
          isSidebarOpen ? "max-w-[10rem] opacity-100" : "max-w-0 overflow-hidden opacity-0"
        )}
      >
        {label}
      </span>
    </>
  );

  if (to) {
    return (
      <NavLink
        to={to}
        aria-label={label}
        title={label}
        data-settings-toggle={dataSettingsToggle ? "true" : undefined}
        className={({ isActive: isRouteActive }) => getBaseClassName(isRouteActive || isActive)}
      >
        {content}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-settings-toggle={dataSettingsToggle ? "true" : undefined}
      className={getBaseClassName(isActive)}
      disabled={disabled}
    >
      {content}
    </button>
  );
}

export function Sidebar({
  isOpen,
  onToggleOpen,
  onSettingsClick,
  isSettingsPanelOpen = false,
  notificationCounts = { live: 0, scheduled: 0 }
}) {
  return (
    <aside
      className={classNames(
        "fixed inset-y-0 left-0 z-50 flex h-screen flex-col border border-white/40 bg-white/20 shadow-2xl backdrop-blur-[64px] backdrop-saturate-150 transition-all duration-300 ease-in-out",
        isOpen ? "w-64" : "w-20"
      )}
    >
      <div className="flex h-full flex-col px-3 py-5">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          className="inline-flex h-12 w-12 items-center justify-center self-start rounded-2xl border border-white/40 bg-white/20 text-white/95 shadow-2xl backdrop-blur-[64px] backdrop-saturate-150 transition-all duration-300 hover:bg-emerald-500/20 hover:border-emerald-500/30 hover:shadow-[0_0_15px_rgba(16,185,129,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/65"
        >
          <div className={`transition-transform duration-300 ${isOpen ? "rotate-90" : "rotate-0"}`}>
            {isOpen ? <X size={19} strokeWidth={2.2} /> : <Menu size={19} strokeWidth={2.2} />}
          </div>
        </button>

        <div className={classNames("mt-4", isOpen ? "w-full" : "w-12")}>
          <SidebarIconButton
            icon={Leaf}
            label="Relax Mode"
            isSidebarOpen={isOpen}
            to="/relax"
          />
        </div>

        <nav className={classNames("mt-6 flex flex-col gap-3", isOpen ? "items-stretch" : "items-start")}>
          <SidebarIconButton
            icon={Inbox}
            label="Inbox"
            to="/dashboard"
            isSidebarOpen={isOpen}
            badgeCount={notificationCounts?.scheduled ?? 0}
          />
          <SidebarIconButton
            icon={PenTool}
            label="Write capsule"
            to="/vault"
            isSidebarOpen={isOpen}
          />
          <SidebarIconButton
            icon={MessageCircle}
            label="Live chat"
            to="/live-chat"
            isSidebarOpen={isOpen}
            badgeCount={notificationCounts?.live ?? 0}
          />
        </nav>

        <div className={classNames("mt-auto", isOpen ? "w-full" : "w-12")}>
          <SidebarIconButton
            icon={Settings}
            label="Environment"
            isSidebarOpen={isOpen}
            onClick={onSettingsClick}
            isActive={isSettingsPanelOpen}
            dataSettingsToggle
            className={isSettingsPanelOpen ? "animate-pulseGlow" : ""}
          />
        </div>
      </div>
    </aside>
  );
}
