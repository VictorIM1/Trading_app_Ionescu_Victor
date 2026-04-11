import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, Market, OddsHistoryPoint } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

const MARKET_REFRESH_MS = 5000;

const CHART_COLORS = ["#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#14B8A6"];

function OddsHistoryChart({ snapshots }: { snapshots: OddsHistoryPoint[] }) {
  const latestOutcomes = snapshots[snapshots.length - 1]?.outcomes || [];

  const chartData = useMemo(() => {
    if (snapshots.length <= 1 || latestOutcomes.length === 0) {
      return { lines: [], labels: [] as string[] };
    }

    const plotOffsetX = 12;
    const plotWidth = 88;
    const height = 100;
    const steps = Math.max(1, snapshots.length - 1);

    const lines = latestOutcomes.map((outcome, outcomeIndex) => {
      const points = snapshots.map((snapshot, snapshotIndex) => {
        const outcomeSnapshot = snapshot.outcomes.find((item) => item.id === outcome.id);
        const odds = outcomeSnapshot?.odds ?? 0;
        const x = plotOffsetX + (snapshotIndex / steps) * plotWidth;
        const y = height - (odds / 100) * height;
        return `${x},${y}`;
      });

      return {
        id: outcome.id,
        title: outcome.title,
        color: CHART_COLORS[outcomeIndex % CHART_COLORS.length],
        points: points.join(" "),
      };
    });

    const labels = [
      new Date(snapshots[0].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      new Date(snapshots[snapshots.length - 1].timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    ];

    return { lines, labels };
  }, [latestOutcomes, snapshots]);

  if (snapshots.length <= 1) {
    return <p className="text-sm text-muted-foreground">No bet history yet. The chart updates as bets are placed.</p>;
  }

  return (
    <div className="space-y-3">
      <svg viewBox="0 0 100 100" className="h-56 w-full rounded-md border border-border/70 bg-background">
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = 100 - tick;
          return (
            <g key={tick}>
              <line x1="12" y1={y} x2="100" y2={y} stroke="#64748B" strokeOpacity="0.35" strokeWidth="0.4" />
              <text x="1.5" y={Math.max(4, y - 1)} fontSize="4.4" fill="#E2E8F0" fontWeight="700">
                {tick}%
              </text>
            </g>
          );
        })}
        {chartData.lines.map((line) => (
          <polyline
            key={line.id}
            points={line.points}
            fill="none"
            stroke={line.color}
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{chartData.labels[0]}</span>
        <span>{chartData.labels[1]}</span>
      </div>

      <div className="flex flex-wrap gap-3">
        {chartData.lines.map((line) => (
          <div
            key={line.id}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: line.color }} />
            <span className="font-medium">{line.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketDetailPage() {
  const { id } = useParams({ from: "/markets/$id" });
  const navigate = useNavigate();
  const { isAuthenticated, user, updateUser } = useAuth();
  const [market, setMarket] = useState<Market | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [isBetting, setIsBetting] = useState(false);
  const [oddsHistory, setOddsHistory] = useState<OddsHistoryPoint[]>([]);
  const [isResolving, setIsResolving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [resolveOutcomeId, setResolveOutcomeId] = useState<number | null>(null);

  const marketId = parseInt(id, 10);

  const loadMarket = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) {
          setIsLoading(true);
        }
        setError(null);

        const [marketData, historyData] = await Promise.all([
          api.getMarket(marketId),
          api.getMarketOddsHistory(marketId),
        ]);

        setMarket(marketData);
        setOddsHistory(historyData.snapshots);
        if (!selectedOutcomeId && marketData.outcomes.length > 0) {
          setSelectedOutcomeId(marketData.outcomes[0].id);
        }
        if (!resolveOutcomeId && marketData.outcomes.length > 0) {
          setResolveOutcomeId(marketData.outcomes[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load market details");
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    },
    [marketId, resolveOutcomeId, selectedOutcomeId],
  );

  useEffect(() => {
    if (Number.isNaN(marketId)) {
      setError("Invalid market id");
      setIsLoading(false);
      return;
    }
    loadMarket(true);
  }, [loadMarket, marketId]);

  useEffect(() => {
    if (!market || market.status !== "active") {
      return;
    }

    const intervalId = setInterval(() => {
      loadMarket(false);
    }, MARKET_REFRESH_MS);

    return () => clearInterval(intervalId);
  }, [loadMarket, market]);

  const selectedOutcome = useMemo(
    () => market?.outcomes.find((outcome) => outcome.id === selectedOutcomeId) || null,
    [market, selectedOutcomeId],
  );

  const betAmountNumber = Number(betAmount);
  const betValidationError = useMemo(() => {
    if (betAmount.length === 0) return null;
    if (!Number.isFinite(betAmountNumber)) return "Enter a valid number";
    if (betAmountNumber <= 0) return "Amount must be greater than 0";
    return null;
  }, [betAmount.length, betAmountNumber]);

  const estimatedPayout = useMemo(() => {
    if (!selectedOutcome || !Number.isFinite(betAmountNumber) || betAmountNumber <= 0) {
      return null;
    }

    if (selectedOutcome.odds <= 0) {
      return null;
    }

    return Number(((betAmountNumber * 100) / selectedOutcome.odds).toFixed(2));
  }, [betAmountNumber, selectedOutcome]);

  const handlePlaceBet = async () => {
    if (!selectedOutcomeId || !betAmount) {
      setError("Please select an outcome and enter a bet amount");
      return;
    }

    if (betValidationError) {
      setError(betValidationError);
      return;
    }

    try {
      setIsBetting(true);
      setError(null);
      await api.placeBet(marketId, selectedOutcomeId, betAmountNumber);
      const currentUser = await api.getCurrentUser();
      updateUser(currentUser);
      setBetAmount("");
      await loadMarket(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place bet");
    } finally {
      setIsBetting(false);
    }
  };

  const handleResolveMarket = async () => {
    if (!resolveOutcomeId) {
      setError("Please select a winning outcome");
      return;
    }

    try {
      setIsResolving(true);
      setError(null);
      await api.resolveMarket(marketId, resolveOutcomeId);
      const currentUser = await api.getCurrentUser();
      updateUser(currentUser);
      await loadMarket(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve market");
    } finally {
      setIsResolving(false);
    }
  };

  const handleArchiveMarket = async () => {
    try {
      setIsArchiving(true);
      setError(null);
      await api.archiveMarket(marketId);
      const currentUser = await api.getCurrentUser();
      updateUser(currentUser);
      await loadMarket(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive market");
    } finally {
      setIsArchiving(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-muted-foreground">Please log in to view this market</p>
            <Button onClick={() => navigate({ to: "/auth/login" })}>Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading market...</p>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-destructive">Market not found</p>
            <Button onClick={() => navigate({ to: "/" })}>Back to Markets</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-900 py-8">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        {/* Header */}
        <Button variant="outline" onClick={() => navigate({ to: "/" })}>
          ← Back
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-4xl">{market.title}</CardTitle>
                {market.description && (
                  <CardDescription className="text-lg mt-2">{market.description}</CardDescription>
                )}
              </div>
              <Badge variant={market.status === "active" ? "default" : "secondary"}>
                {market.status === "active" ? "Active" : market.status === "archived" ? "Archived" : "Resolved"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Outcomes Display */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Outcomes</h3>
              {market.outcomes.map((outcome) => (
                <div
                  key={outcome.id}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    selectedOutcomeId === outcome.id
                      ? "border-primary bg-primary/5"
                      : "border-secondary bg-secondary/5 hover:border-primary/50"
                  }`}
                  onClick={() => market.status === "active" && setSelectedOutcomeId(outcome.id)}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <h4 className="font-semibold">{outcome.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Total bets: ${outcome.totalBets.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold text-primary">{outcome.odds}%</p>
                      <p className="text-xs text-muted-foreground">odds</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Odds History</h3>
                {market.status === "active" && (
                  <span className="text-xs text-muted-foreground">Live refresh every 5 seconds</span>
                )}
              </div>
              <OddsHistoryChart snapshots={oddsHistory} />
            </div>

            {/* Market Stats */}
            <div className="rounded-lg p-6 border border-primary/20 bg-primary/5">
              <p className="text-sm text-muted-foreground mb-1">Total Market Value</p>
              <p className="text-4xl font-bold text-primary">
                ${market.totalMarketBets.toFixed(2)}
              </p>
            </div>

            {/* Betting Section */}
            {market.status === "active" && (
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border border-border/80 bg-card/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle>Place Your Bet</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Selected Outcome</Label>
                      <div className="rounded-md border border-border bg-background p-3 text-foreground">
                        {market.outcomes.find((o) => o.id === selectedOutcomeId)?.title ||
                          "None selected"}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="betAmount">Bet Amount ($)</Label>
                      <Input
                        id="betAmount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={betAmount}
                        onChange={(e) => setBetAmount(e.target.value)}
                        placeholder="Enter amount"
                        className="bg-background text-foreground placeholder:text-zinc-400"
                        disabled={isBetting}
                      />
                      {betValidationError && (
                        <p className="text-xs text-destructive">{betValidationError}</p>
                      )}
                    </div>

                    {estimatedPayout !== null && selectedOutcome && (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                        Estimated payout if this outcome wins: <strong>${estimatedPayout.toFixed(2)}</strong>
                      </div>
                    )}

                    <Button
                      className="w-full text-lg py-6"
                      onClick={handlePlaceBet}
                      disabled={isBetting || !selectedOutcomeId || !betAmount || !!betValidationError}
                    >
                      {isBetting ? "Placing bet..." : "Place Bet"}
                    </Button>
                  </CardContent>
                </Card>

                {user?.role === "admin" && (
                  <Card className="border-amber-300 bg-amber-50/60">
                    <CardHeader>
                      <CardTitle>Admin: Resolve Market</CardTitle>
                      <CardDescription>Set a winner or archive and refund all bettors.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="resolveOutcome">Winning Outcome</Label>
                        <select
                          id="resolveOutcome"
                          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                          value={resolveOutcomeId ?? ""}
                          onChange={(e) => setResolveOutcomeId(Number(e.target.value))}
                          disabled={isResolving}
                        >
                          {market.outcomes.map((outcome) => (
                            <option key={outcome.id} value={outcome.id}>
                              {outcome.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={handleResolveMarket}
                        disabled={isResolving || !resolveOutcomeId}
                      >
                        {isResolving ? "Resolving..." : "Resolve Market"}
                      </Button>

                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={handleArchiveMarket}
                        disabled={isArchiving}
                      >
                        {isArchiving ? "Archiving..." : "Archive And Refund"}
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {market.status === "resolved" && (
              <Card>
                <CardContent className="py-6">
                  <p className="text-muted-foreground">This market has been resolved.</p>
                </CardContent>
              </Card>
            )}

            {market.status === "archived" && (
              <Card>
                <CardContent className="py-6">
                  <p className="text-muted-foreground">
                    This market has been archived and all bettors were refunded.
                  </p>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/markets/$id")({
  component: MarketDetailPage,
});
