import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { api, LeaderboardResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PAGE_SIZE = 20;

const emptyLeaderboard: LeaderboardResponse = {
  items: [],
  pagination: {
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  },
};

function LeaderboardPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse>(emptyLeaderboard);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const loadLeaderboard = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);
      const data = await api.getLeaderboard(page, PAGE_SIZE);
      setLeaderboard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leaderboard");
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [page]);

  useEffect(() => {
    loadLeaderboard(true);
  }, [loadLeaderboard]);

  const showingFrom = useMemo(() => {
    if (leaderboard.pagination.total === 0) return 0;
    return (leaderboard.pagination.page - 1) * leaderboard.pagination.pageSize + 1;
  }, [leaderboard.pagination.page, leaderboard.pagination.pageSize, leaderboard.pagination.total]);

  const showingTo = useMemo(() => {
    if (leaderboard.pagination.total === 0) return 0;
    return Math.min(leaderboard.pagination.page * leaderboard.pagination.pageSize, leaderboard.pagination.total);
  }, [leaderboard.pagination.page, leaderboard.pagination.pageSize, leaderboard.pagination.total]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 gap-4">
            <p className="text-muted-foreground">Please log in to view the leaderboard.</p>
            <Button onClick={() => navigate({ to: "/auth/login" })}>Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="mx-auto max-w-5xl space-y-6 px-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Leaderboard</h1>
            <p className="mt-2 text-sm text-gray-600">Ranking based on net profit from resolved markets.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>
              Back to Markets
            </Button>
            <Button variant="outline" onClick={() => loadLeaderboard(true)} disabled={isLoading}>
              {isLoading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Top Traders</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="py-8 text-center text-muted-foreground">Loading leaderboard...</p>
            ) : leaderboard.items.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No resolved market activity yet.</p>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-2 py-2">Rank</th>
                        <th className="px-2 py-2">User</th>
                        <th className="px-2 py-2">Settled Bets</th>
                        <th className="px-2 py-2">Wins</th>
                        <th className="px-2 py-2">Losses</th>
                        <th className="px-2 py-2">Staked</th>
                        <th className="px-2 py-2">Payout</th>
                        <th className="px-2 py-2">Net Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.items.map((entry) => (
                        <tr key={entry.userId} className="border-b/60">
                          <td className="px-2 py-3 font-semibold">#{entry.rank}</td>
                          <td className="px-2 py-3">{entry.username}</td>
                          <td className="px-2 py-3">{entry.settledBets}</td>
                          <td className="px-2 py-3">{entry.wins}</td>
                          <td className="px-2 py-3">{entry.losses}</td>
                          <td className="px-2 py-3">${entry.totalStaked.toFixed(2)}</td>
                          <td className="px-2 py-3">${entry.totalPayout.toFixed(2)}</td>
                          <td
                            className={`px-2 py-3 font-semibold ${entry.netProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                          >
                            {entry.netProfit >= 0 ? "+" : ""}${entry.netProfit.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between rounded-md border bg-muted/20 p-3">
                  <span className="text-sm text-muted-foreground">
                    Showing {showingFrom}-{showingTo} of {leaderboard.pagination.total} users
                  </span>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      disabled={leaderboard.pagination.page <= 1 || isLoading}
                      onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {leaderboard.pagination.page} of {leaderboard.pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      disabled={leaderboard.pagination.page >= leaderboard.pagination.totalPages || isLoading}
                      onClick={() => setPage((prev) => Math.min(leaderboard.pagination.totalPages, prev + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
});
