import { Suspense } from "react";
import { DashboardContent } from "./dashboard-content";

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-center text-muted">Loading...</p>}>
      <DashboardContent />
    </Suspense>
  );
}
