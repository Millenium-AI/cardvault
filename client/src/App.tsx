import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AppShell } from "@/components/AppShell";
import Dashboard from "@/pages/Dashboard";
import Uploads from "@/pages/Uploads";
import Inventory from "@/pages/Inventory";
import NewLabels from "@/pages/NewLabels";
import RepricingQueue from "@/pages/RepricingQueue";
import Shows from "@/pages/Shows";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
            <Route component={NotFound} />
          </Switch>
        </AppShell>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}
