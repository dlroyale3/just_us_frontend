import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { DynamicBackgroundLayout } from "./components/layout/DynamicBackgroundLayout";
import { GlassLoader } from "./components/ui/GlassLoader";
import { ServerOfflineOverlay } from "./components/ui/ServerOfflineOverlay";
import { DashboardPage } from "./pages/DashboardPage";
import { InvitePage } from "./pages/InvitePage";
import { LandingPage } from "./pages/LandingPage";
import { LiveChatPage } from "./pages/LiveChatPage";
import { PairingPage } from "./pages/PairingPage";
import { RelaxPage } from "./pages/RelaxPage";
import { WriteCapsulePage } from "./pages/WriteCapsulePage";
import { useAuth } from "./context/AuthContext";

function targetPathForStatus(status) {
  if (status === "unpaired") {
    return "/pairing";
  }

  if (status === "paired") {
    return "/dashboard";
  }

  return "/login";
}

function LoggedOutOnlyRoute() {
  const { status } = useAuth();

  if (status === "loading") {
    return <GlassLoader message="Securing your private space..." />;
  }

  if (status === "logged_out") {
    return <Outlet />;
  }

  return <Navigate to={targetPathForStatus(status)} replace />;
}

function UnpairedOnlyRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <GlassLoader message="Securing your private space..." />;
  }

  if (status === "logged_out") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (status === "unpaired") {
    return <Outlet />;
  }

  return <Navigate to={targetPathForStatus(status)} replace />;
}

function PairedOnlyRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <GlassLoader message="Securing your private space..." />;
  }

  if (status === "logged_out") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (status === "paired") {
    return <Outlet />;
  }

  return <Navigate to={targetPathForStatus(status)} replace />;
}

function AppRoutes() {
  const { status } = useAuth();

  return (
    <Routes>
      <Route element={<DynamicBackgroundLayout />}>
        <Route path="/invite/:code" element={<InvitePage />} />

        <Route element={<LoggedOutOnlyRoute />}>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LandingPage />} />
        </Route>

        <Route element={<UnpairedOnlyRoute />}>
          <Route path="/pairing" element={<PairingPage />} />
        </Route>

        <Route element={<PairedOnlyRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/relax" element={<RelaxPage />} />
          <Route path="/vault" element={<WriteCapsulePage />} />
          <Route path="/live-chat" element={<LiveChatPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={targetPathForStatus(status)} replace />} />
    </Routes>
  );
}

export function AppRouter() {
  const { isServerDown } = useAuth();
  const isBlockingForServerDowntime = isServerDown;

  return (
    <BrowserRouter>
      {isBlockingForServerDowntime ? <ServerOfflineOverlay /> : <AppRoutes />}
    </BrowserRouter>
  );
}
