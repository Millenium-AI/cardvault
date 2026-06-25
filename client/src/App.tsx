import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { AppShell } from "@/components/AppShell";
import Dashboard from "@/pages/Dashboard";
import Uploads from "@/pages/Uploads";
import Inventory from "@/pages/Inventory";
import NewLabels from "@/pages/NewLabels";
import RepricingQueue from "@/pages/RepricingQueue";
import Shows from "@/pages/Shows";
import Settings from "@/pages/Settings";
import Admin from "@/pages/Admin";
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";
import { Component, ReactNode } from "react";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-8">
          <p className="text-destructive font-medium text-sm">
            Something went wrong. Try refreshing.
          </p>
          <pre className="text-xs text-muted-foreground max-w-lg overflow-auto">
            {(this.state.error as Error | null)?.message}
          </pre>
          <button
            className="text-xs text-primary underline"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <Router hook={useHashLocation}>
      <AppShell>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/uploads" component={Uploads} />
          <Route path="/inventory" component={Inventory} />
          <Route path="/new-labels" component={NewLabels} />
          <Route path="/repricing" component={RepricingQueue} />
          <Route path="/shows" component={Shows} />
          <Route path="/settings" component={Settings} />
          <Route path="/admin" component={Admin} />
          <Route component={NotFound} />
        </Switch>
      </AppShell>
    </Router>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppRoutes />
          <Toaster />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
