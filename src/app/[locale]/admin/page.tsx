"use client";

import { useEffect, useState } from "react";

export default function AdminPage() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => {
        if (!r.ok) throw new Error("Forbidden");
        return r.json();
      })
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="text-center">
        <p className="text-red-600">{error}</p>
        <p className="mt-2 text-sm text-muted">
          Set ADMIN_EMAILS env var to grant admin access.
        </p>
      </div>
    );
  }

  if (!stats) return <p>Loading admin stats...</p>;

  const s = stats.stats as Record<string, number | string>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border p-6">
          <p className="text-sm text-muted">Total Users</p>
          <p className="text-2xl font-bold">{s.totalUsers}</p>
        </div>
        <div className="rounded-xl border p-6">
          <p className="text-sm text-muted">Paid Users</p>
          <p className="text-2xl font-bold">{s.paidUsers}</p>
        </div>
        <div className="rounded-xl border p-6">
          <p className="text-sm text-muted">Conversion Rate</p>
          <p className="text-2xl font-bold">{s.conversionRate}</p>
        </div>
      </div>
    </div>
  );
}
