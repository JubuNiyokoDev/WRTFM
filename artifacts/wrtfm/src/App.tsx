import { AppLayout } from './components/layout';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

import Home from './pages/home';
import Login from './pages/auth/login';
import Register from './pages/auth/register';

import ClientDashboard from './pages/client/dashboard';
import ClientCampaigns from './pages/client/campaigns';
import ClientCampaignDetail from './pages/client/campaign-detail';
import ClientReports from './pages/client/reports';

import WorkerDashboard from './pages/worker/dashboard';
import WorkerTasks from './pages/worker/tasks';
import WorkerTaskDetail from './pages/worker/task-detail';
import WorkerEarnings from './pages/worker/earnings';

import AdminDashboard from './pages/admin/dashboard';
import AdminVerifications from './pages/admin/verifications';
import AdminUsers from './pages/admin/users';
import AdminCampaigns from './pages/admin/campaigns';

import NotFound from './pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        
        <Route path="/auth/login" component={Login} />
        <Route path="/auth/register" component={Register} />
        
        <Route path="/client" component={ClientDashboard} />
        <Route path="/client/campaigns" component={ClientCampaigns} />
        <Route path="/client/campaigns/:id" component={ClientCampaignDetail} />
        <Route path="/client/reports" component={ClientReports} />

        <Route path="/worker" component={WorkerDashboard} />
        <Route path="/worker/tasks" component={WorkerTasks} />
        <Route path="/worker/tasks/:id" component={WorkerTaskDetail} />
        <Route path="/worker/earnings" component={WorkerEarnings} />

        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/verifications" component={AdminVerifications} />
        <Route path="/admin/users" component={AdminUsers} />
        <Route path="/admin/campaigns" component={AdminCampaigns} />

        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
