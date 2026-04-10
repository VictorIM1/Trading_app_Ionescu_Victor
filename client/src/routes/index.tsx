import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, Market, MarketListResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { MarketCard } from "@/components/market-card";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

const PAGE_SIZE = 20;

const emptyMarketResponse: MarketListResponse = {
  items: [],
  pagination: {
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  },
};

function DashboardPage() {
  const { isAuthenticated, user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [marketResponse, setMarketResponse] = useState<MarketListResponse>(emptyMarketResponse);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"all" | "active" | "resolved" | "archived">("active");
  const [sortBy, setSortBy] = useState<"createdAt" | "totalBets" | "participants">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const loadMarkets = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);
      const data = await api.listMarkets({
        status,
        sortBy,
        sortOrder,
        page,
        pageSize: PAGE_SIZE,
      });
      setMarketResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load markets");
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [status, sortBy, sortOrder, page]);

  useEffect(() => {
    loadMarkets(true);
  }, [loadMarkets]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      loadMarkets(false);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [loadMarkets]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const refreshMe = async () => {
      try {
        const currentUser = await api.getCurrentUser();
        updateUser(currentUser);
      } catch {
        // Silent refresh: market loading already surfaces auth/network issues.
      }
    };

    refreshMe();
    const intervalId = setInterval(refreshMe, 5000);
    return () => clearInterval(intervalId);
  }, [isAuthenticated, updateUser]);

  const markets = marketResponse.items;
  const { pagination } = marketResponse;

  const showingFrom = useMemo(() => {
    if (pagination.total === 0) return 0;
    return (pagination.page - 1) * pagination.pageSize + 1;
  }, [pagination.page, pagination.pageSize, pagination.total]);

  const showingTo = useMemo(() => {
    if (pagination.total === 0) return 0;
    return Math.min(pagination.page * pagination.pageSize, pagination.total);
  }, [pagination.page, pagination.pageSize, pagination.total]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4 text-gray-900">Prediction Markets</h1>
          <p className="text-gray-600 mb-8 text-lg">Create and participate in prediction markets</p>
          <div className="space-x-4">
            <Button onClick={() => navigate({ to: "/auth/login" })}>Login</Button>
            <Button variant="outline" onClick={() => navigate({ to: "/auth/register" })}>
              Sign Up
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Markets</h1>
            <p className="text-gray-600 mt-2">Welcome back, {user?.username}!</p>
            <p className="mt-1 text-sm text-gray-700">Balance: ${Number(user?.balance ?? 0).toFixed(2)}</p>
            {user?.role === "admin" && (
              <p className="mt-1 text-sm font-medium text-amber-700">Admin mode: market resolution controls enabled.</p>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate({ to: "/leaderboard" })}>
              Leaderboard
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/profile" })}>
              Profile
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/auth/logout" })}>
              Logout
            </Button>
            <Button onClick={() => navigate({ to: "/markets/new" })}>Create Market</Button>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-6 rounded-lg border bg-white/80 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <label className="text-sm font-medium text-gray-700">
              Status
              <select
                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as "all" | "active" | "resolved" | "archived");
                  setPage(1);
                }}
              >
                <option value="active">Active</option>
                <option value="resolved">Resolved</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
            </label>

            <label className="text-sm font-medium text-gray-700">
              Sort By
              <select
                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as "createdAt" | "totalBets" | "participants");
                  setPage(1);
                }}
              >
                <option value="createdAt">Creation Date</option>
                <option value="totalBets">Total Bet Size</option>
                <option value="participants">Participants</option>
              </select>
            </label>

            <label className="text-sm font-medium text-gray-700">
              Order
              <select
                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                value={sortOrder}
                onChange={(e) => {
                  setSortOrder(e.target.value as "asc" | "desc");
                  setPage(1);
                }}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>

            <div className="flex items-end">
              <Button variant="outline" onClick={() => loadMarkets(true)} disabled={isLoading}>
                {isLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>

          <p className="mt-3 text-xs text-gray-500">Live market odds and totals update automatically every 5 seconds.</p>
        </div>

        {/* Error State */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">
            {error}
          </div>
        )}

        {/* Markets Grid */}
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading markets...</p>
            </CardContent>
          </Card>
        ) : markets.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-muted-foreground text-lg">
                  No {status === "all" ? "" : status} markets found. {status === "active" && "Create one to get started!"}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-4 text-sm text-gray-600">
              Showing {showingFrom}-{showingTo} of {pagination.total} markets
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {markets.map((market: Market) => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between rounded-lg border bg-white/80 p-4">
              <Button
                variant="outline"
                disabled={pagination.page <= 1 || isLoading}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Previous
              </Button>

              <span className="text-sm text-gray-600">
                Page {pagination.page} of {pagination.totalPages}
              </span>

              <Button
                variant="outline"
                disabled={pagination.page >= pagination.totalPages || isLoading}
                onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: DashboardPage,
});
