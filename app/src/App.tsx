import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AppLayout } from "./components/layout/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { MaterialsPage } from "./pages/MaterialsPage";
import { MaterialDetailPage } from "./pages/MaterialDetailPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { RequestsPage } from "./pages/RequestsPage";
import { RequestCreatePage } from "./pages/RequestCreatePage";
import { RequestDetailPage } from "./pages/RequestDetailPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { DataStatusPage } from "./pages/DataStatusPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LogsPage } from "./pages/LogsPage";
import { ImportsPage } from "./pages/ImportsPage";

export const App: React.FC = () => {
  return (
    <>
      <Toaster position="top-right" richColors />
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="materials" element={<MaterialsPage />} />
            <Route path="materials/:id" element={<MaterialDetailPage />} />
            <Route path="suppliers" element={<SuppliersPage />} />
            <Route path="imports" element={<ImportsPage />} />
            <Route path="requests" element={<RequestsPage />} />
            <Route path="requests/new" element={<RequestCreatePage />} />
            <Route path="requests/:id" element={<RequestDetailPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="data-status" element={<DataStatusPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </>
  );
};
