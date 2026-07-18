import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Shell } from '@/components/layout/shell';
import NotFound from '@/pages/not-found';

import Companion from '@/pages/companion';
import Dashboard from '@/pages/dashboard';
import ProjectDetail from '@/pages/project-detail';
import Vault from '@/pages/vault';
import Audit from '@/pages/audit';
import Tasks from '@/pages/tasks';
import Council from '@/pages/council';

const queryClient = new QueryClient();

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Companion} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/projects/:id" component={ProjectDetail} />
        <Route path="/vault" component={Vault} />
        <Route path="/audit" component={Audit} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/council" component={Council} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
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
