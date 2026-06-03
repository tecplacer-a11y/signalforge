import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { AppLayout } from "@/components/AppLayout";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Leads from "@/pages/Leads";
import LeadDetail from "@/pages/LeadDetail";
import Outreach from "@/pages/Outreach";
import Targeting from "@/pages/Targeting";
import Scoring from "@/pages/Scoring";
import Runs from "@/pages/Runs";
import Settings from "@/pages/Settings";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/leads" component={Leads} />
      <Route path="/leads/:leadId" component={LeadDetail} />
      <Route path="/outreach" component={Outreach} />
      <Route path="/targeting" component={Targeting} />
      <Route path="/scoring" component={Scoring} />
      <Route path="/runs" component={Runs} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppLayout>
              <AppRouter />
            </AppLayout>
          </Router>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
