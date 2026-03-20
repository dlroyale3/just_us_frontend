import React from "react";
import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "./context/AuthContext";
import { SettingsProvider } from "./context/SettingsContext";
import { AppRouter } from "./AppRouter";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <SettingsProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </SettingsProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
