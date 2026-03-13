import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, UserBet, UserBetListResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const PAGE_SIZE = 20;

const emptyResponse: UserBetListResponse = {
  items: [],
  pagination: {
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  },
};

function BetRow({ bet, isResolved }: { bet: UserBet; isResolved: boolean }) {
  return (
    <div className="rounded-md border bg-background p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-foreground">{bet.marketTitle}</p>
          <p className="text-sm text-muted-foreground">Outcome: {bet.outcomeTitle}</p>
        </div>
        {isResolved ? (
          <span
            className={`rounded px-2 py-1 text-xs font-medium ${
              bet.didWin ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}
          >
            {bet.didWin ? "Won" : "Lost"}
          </span>
        ) : (
          <span className="rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
            {bet.currentOdds.toFixed(2)}% current odds
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>Bet amount: ${bet.amount.toFixed(2)}</span>
        <span>Placed: {new Date(bet.placedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

function BetSection({
  title,
  description,
  data,
  isResolved,
  isLoading,
  onPrev,
  onNext,
}: {
  title: string;
  description: string;
  data: UserBetListResponse;
  isResolved: boolean;
  isLoading: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bets found.</p>
        ) : (
          data.items.map((bet) => <BetRow key={bet.id} bet={bet} isResolved={isResolved} />)
        )}

        <div className="flex items-center justify-between border-t pt-4">
          <Button
            variant="outline"
            disabled={isLoading || data.pagination.page <= 1}
            onClick={onPrev}
          >
            Previous
          </Button>

          <span className="text-sm text-muted-foreground">
            Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} total)
          </span>

          <Button
            variant="outline"
            disabled={isLoading || data.pagination.page >= data.pagination.totalPages}
            onClick={onNext}
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProfilePage() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [activePage, setActivePage] = useState(1);
  const [resolvedPage, setResolvedPage] = useState(1);

  const [activeData, setActiveData] = useState<UserBetListResponse>(emptyResponse);
  const [resolvedData, setResolvedData] = useState<UserBetListResponse>(emptyResponse);

  const [isLoadingActive, setIsLoadingActive] = useState(true);
  const [isLoadingResolved, setIsLoadingResolved] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActiveBets = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) setIsLoadingActive(true);
        const data = await api.listMyBets("active", activePage, PAGE_SIZE);
        setActiveData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load active bets");
      } finally {
        if (showLoading) setIsLoadingActive(false);
      }
    },
    [activePage],
  );

  const loadResolvedBets = useCallback(async () => {
    try {
      setIsLoadingResolved(true);
      const data = await api.listMyBets("resolved", resolvedPage, PAGE_SIZE);
      setResolvedData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load resolved bets");
    } finally {
      setIsLoadingResolved(false);
    }
  }, [resolvedPage]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setError(null);
    loadActiveBets(true);
  }, [isAuthenticated, loadActiveBets]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadResolvedBets();
  }, [isAuthenticated, loadResolvedBets]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const intervalId = setInterval(() => {
      loadActiveBets(false);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [isAuthenticated, loadActiveBets]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card>
          <CardContent className="py-10 text-center">
            <p className="mb-4 text-muted-foreground">Please log in to view your profile.</p>
            <Button onClick={() => navigate({ to: "/auth/login" })}>Go to Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">{user?.username}'s Profile</h1>
            <p className="mt-2 text-gray-600">Track resolved and active bets in one place.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>
              Back to Markets
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: "/auth/logout" })}>
              Logout
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <BetSection
            title="Active Bets"
            description="Current odds update automatically every 5 seconds."
            data={activeData}
            isResolved={false}
            isLoading={isLoadingActive}
            onPrev={() => setActivePage((p) => Math.max(1, p - 1))}
            onNext={() => setActivePage((p) => Math.min(activeData.pagination.totalPages, p + 1))}
          />

          <BetSection
            title="Resolved Bets"
            description="Each bet shows whether you won or lost."
            data={resolvedData}
            isResolved={true}
            isLoading={isLoadingResolved}
            onPrev={() => setResolvedPage((p) => Math.max(1, p - 1))}
            onNext={() =>
              setResolvedPage((p) => Math.min(resolvedData.pagination.totalPages, p + 1))
            }
          />
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});