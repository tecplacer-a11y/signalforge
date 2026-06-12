import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { Logo } from "@/components/Logo";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Leads from "@/pages/Leads";
import LeadDetail from "@/pages/LeadDetail";
import Outreach from "@/pages/Outreach";
import Targeting from "@/pages/Targeting";
import Scoring from "@/pages/Scoring";
import Runs from "@/pages/Runs";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";

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

// Auth gate: splash while the session loads; login/signup when
// unauthenticated; the full app once a session exists (or when auth is
// disabled server-side — single-tenant dev/demo mode).
function Gate() {
  const { state } = useAuth();
  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="text-primary animate-pulse">
          <Logo size={40} />
        </span>
      </div>
    );
  }
  if (state.status === "unauthed") {
    return (
      <Switch>
        <Route path="/signup" component={Signup} />
        <Route component={Login} />
      </Switch>
    );
  }
  return (
    <AppLayout>
      <AppRouter />
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <AuthProvider>
            <Router hook={useHashLocation}>
              <Gate />
            </Router>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
