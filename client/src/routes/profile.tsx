import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, ApiKeyInfoResponse, UserBet, UserBetListResponse } from "@/lib/api";
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

const emptyApiKeyState: ApiKeyInfoResponse = {
  hasApiKey: false,
  keyId: null,
  createdAt: null,
  lastUsedAt: null,
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
  const { isAuthenticated, user, updateUser } = useAuth();
  const navigate = useNavigate();

  const [activePage, setActivePage] = useState(1);
  const [resolvedPage, setResolvedPage] = useState(1);

  const [activeData, setActiveData] = useState<UserBetListResponse>(emptyResponse);
  const [resolvedData, setResolvedData] = useState<UserBetListResponse>(emptyResponse);

  const [isLoadingActive, setIsLoadingActive] = useState(true);
  const [isLoadingResolved, setIsLoadingResolved] = useState(true);
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(true);
  const [isGeneratingApiKey, setIsGeneratingApiKey] = useState(false);
  const [isRevokingApiKey, setIsRevokingApiKey] = useState(false);
  const [apiKeyInfo, setApiKeyInfo] = useState<ApiKeyInfoResponse>(emptyApiKeyState);
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);

  const loadActiveBets = useCallback(
    async (showLoading = false) => {
      try {
        if (showLoading) setIsLoadingActive(true);
        const data = await api.listMyBets("active", activePage, PAGE_SIZE);
        setActiveData(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load active bets";
        if (message.toLowerCase().includes("unauthorized")) return;
        setError(message);
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
      const message = err instanceof Error ? err.message : "Failed to load resolved bets";
      if (message.toLowerCase().includes("unauthorized")) return;
      setError(message);
    } finally {
      setIsLoadingResolved(false);
    }
  }, [resolvedPage]);

  const loadApiKeyInfo = useCallback(async () => {
    try {
      setIsLoadingApiKey(true);
      const data = await api.getMyApiKey();
      setApiKeyInfo(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load API key info";
      if (message.toLowerCase().includes("unauthorized")) return;
      setError(message);
    } finally {
      setIsLoadingApiKey(false);
    }
  }, []);

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
    loadApiKeyInfo();
  }, [isAuthenticated, loadApiKeyInfo]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const intervalId = setInterval(() => {
      loadActiveBets(false);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [isAuthenticated, loadActiveBets]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const refreshMe = async () => {
      try {
        const currentUser = await api.getCurrentUser();
        updateUser(currentUser);
      } catch {
        // Keep profile usable even if balance refresh fails temporarily.
      }
    };

    refreshMe();
    return;
  }, [isAuthenticated, updateUser]);

  const handleGenerateApiKey = async () => {
    try {
      setIsGeneratingApiKey(true);
      setCopyStatus("idle");
      const data = await api.generateMyApiKey();
      setGeneratedApiKey(data.apiKey);
      setApiKeyInfo({
        hasApiKey: true,
        keyId: data.keyId,
        createdAt: data.createdAt,
        lastUsedAt: data.lastUsedAt,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate API key");
    } finally {
      setIsGeneratingApiKey(false);
    }
  };

  const handleRevokeApiKey = async () => {
    try {
      setIsRevokingApiKey(true);
      setCopyStatus("idle");
      await api.revokeMyApiKey();
      setGeneratedApiKey(null);
      setApiKeyInfo(emptyApiKeyState);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke API key");
    } finally {
      setIsRevokingApiKey(false);
    }
  };

  const handleCopyApiKey = async () => {
    if (!generatedApiKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedApiKey);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-900">
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
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-slate-900 to-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-zinc-100">{user?.username}'s Profile</h1>
            <p className="mt-2 text-zinc-300">Track resolved and active bets in one place.</p>
            <p className="mt-1 text-sm text-zinc-200">Current balance: ${Number(user?.balance ?? 0).toFixed(2)}</p>
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

          <Card>
            <CardHeader>
              <CardTitle>Bot API Key</CardTitle>
              <CardDescription>
                Use this key with the x-api-key header to place bets and call authenticated endpoints programmatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingApiKey ? (
                <p className="text-sm text-muted-foreground">Loading API key status...</p>
              ) : (
                <>
                  <div className="rounded-md border bg-background p-4 text-sm">
                    <p className="text-foreground">
                      Status: {apiKeyInfo.hasApiKey ? "Active" : "Not generated"}
                    </p>
                    {apiKeyInfo.keyId && (
                      <p className="mt-1 text-muted-foreground">Key ID: {apiKeyInfo.keyId}</p>
                    )}
                    {apiKeyInfo.createdAt && (
                      <p className="mt-1 text-muted-foreground">
                        Created: {new Date(apiKeyInfo.createdAt).toLocaleString()}
                      </p>
                    )}
                    {apiKeyInfo.lastUsedAt && (
                      <p className="mt-1 text-muted-foreground">
                        Last used: {new Date(apiKeyInfo.lastUsedAt).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {generatedApiKey && (
                    <div className="rounded-md border border-amber-300/40 bg-amber-50/10 p-4">
                      <p className="text-sm font-medium text-amber-200">
                        Save this key now. For security, you will not be able to view it again.
                      </p>
                      <p className="mt-2 break-all rounded-md bg-background px-3 py-2 font-mono text-xs text-foreground">
                        {generatedApiKey}
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        <Button variant="outline" onClick={handleCopyApiKey}>
                          Copy key
                        </Button>
                        {copyStatus === "copied" && (
                          <span className="text-xs text-emerald-300">Copied to clipboard.</span>
                        )}
                        {copyStatus === "failed" && (
                          <span className="text-xs text-destructive">Copy failed. Please copy manually.</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={handleGenerateApiKey}
                      disabled={isGeneratingApiKey || isRevokingApiKey}
                    >
                      {isGeneratingApiKey
                        ? "Generating..."
                        : apiKeyInfo.hasApiKey
                          ? "Regenerate API Key"
                          : "Generate API Key"}
                    </Button>

                    <Button
                      variant="outline"
                      onClick={handleRevokeApiKey}
                      disabled={!apiKeyInfo.hasApiKey || isRevokingApiKey || isGeneratingApiKey}
                    >
                      {isRevokingApiKey ? "Revoking..." : "Revoke API Key"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});