import { AppLayout } from "./components/layout";
import type { ComponentType } from "react";
import { Redirect, Route, Switch, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSession } from "@/hooks/use-session";
import ErrorBoundary from "./components/error-boundary";

import Home from "./pages/home";
import Login from "./pages/auth/login";
import Register from "./pages/auth/register";

import ClientDashboard from "./pages/client/dashboard";
import ClientCampaigns from "./pages/client/campaigns";
import ClientCampaignDetail from "./pages/client/campaign-detail";
import ClientReports from "./pages/client/reports";
import ClientProfile from "./pages/client/profile";
import ClientWallet from "./pages/client/wallet";

import WorkerDashboard from "./pages/worker/dashboard";
import WorkerTasks from "./pages/worker/tasks";
import WorkerTaskDetail from "./pages/worker/task-detail";
import WorkerEarnings from "./pages/worker/earnings";
import WorkerProfile from "./pages/worker/profile";
import WorkerHistory from "./pages/worker/history";
import WorkerAssignment from "./pages/worker/assignment";

import AdminDashboard from "./pages/admin/dashboard";
import AdminVerifications from "./pages/admin/verifications";
import AdminUsers from "./pages/admin/users";
import AdminCampaigns from "./pages/admin/campaigns";
import AdminKycCompliance from "./pages/admin/kyc-compliance";
import AdminKycDebugPage from "./pages/admin/kyc-debug";

import NotFound from "./pages/not-found";
import PrivacyPolicy from "./pages/privacy";
import TermsOfService from "./pages/terms";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

type AppRole = "client" | "worker" | "admin";

const dashboardPath = (role: AppRole) => `/${role}`;

function ProtectedRoute({
  path,
  role,
  component: Component,
}: {
  path: string;
  role: AppRole;
  component: ComponentType<any>;
}) {
  const { role: currentRole, token } = useSession();

  return (
    <Route path={path}>
      {(params) => {
        if (!token || !currentRole) {
          return <Redirect to="/auth/login" />;
        }

        if (currentRole !== role) {
          return <Redirect to={dashboardPath(currentRole)} />;
        }

        return <Component {...params} />;
      }}
    </Route>
  );
}

function PublicAuthRoute({
  path,
  component: Component,
}: {
  path: string;
  component: ComponentType<any>;
}) {
  const { role, token } = useSession();

  return (
    <Route path={path}>
      {(params) => {
        if (token && role) {
          return <Redirect to={dashboardPath(role)} />;
        }

        return <Component {...params} />;
      }}
    </Route>
  );
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />

        <PublicAuthRoute path="/auth/login" component={Login} />
        <PublicAuthRoute path="/auth/register" component={Register} />

        <ProtectedRoute
          path="/client/campaigns/:id"
          role="client"
          component={ClientCampaignDetail}
        />
        <ProtectedRoute
          path="/client/campaigns"
          role="client"
          component={ClientCampaigns}
        />
        <ProtectedRoute
          path="/client/wallet"
          role="client"
          component={ClientWallet}
        />
        <ProtectedRoute
          path="/client/profile"
          role="client"
          component={ClientProfile}
        />
        <ProtectedRoute
          path="/client/reports"
          role="client"
          component={ClientReports}
        />
        <ProtectedRoute
          path="/client"
          role="client"
          component={ClientDashboard}
        />

        <ProtectedRoute
          path="/worker/tasks/:id"
          role="worker"
          component={WorkerTaskDetail}
        />
        <ProtectedRoute
          path="/worker/tasks"
          role="worker"
          component={WorkerTasks}
        />
        <ProtectedRoute
          path="/worker/earnings"
          role="worker"
          component={WorkerEarnings}
        />
        <ProtectedRoute
          path="/worker/history"
          role="worker"
          component={WorkerHistory}
        />
        <ProtectedRoute
          path="/worker/profile"
          role="worker"
          component={WorkerProfile}
        />
        <ProtectedRoute
          path="/worker/assignment/:id"
          role="worker"
          component={WorkerAssignment}
        />
        <ProtectedRoute
          path="/worker"
          role="worker"
          component={WorkerDashboard}
        />

        <ProtectedRoute
          path="/admin/verifications"
          role="admin"
          component={AdminVerifications}
        />
        <ProtectedRoute
          path="/admin/users"
          role="admin"
          component={AdminUsers}
        />
        <ProtectedRoute
          path="/admin/campaigns"
          role="admin"
          component={AdminCampaigns}
        />
        <ProtectedRoute
          path="/admin/kyc-debug"
          role="admin"
          component={AdminKycDebugPage}
        />
        <ProtectedRoute
          path="/admin/kyc"
          role="admin"
          component={AdminKycCompliance}
        />
        <ProtectedRoute path="/admin" role="admin" component={AdminDashboard} />

        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/terms" component={TermsOfService} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ErrorBoundary>
            <Router />
          </ErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
