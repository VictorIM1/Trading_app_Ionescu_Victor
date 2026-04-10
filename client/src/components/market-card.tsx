import { Market } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "@tanstack/react-router";

interface MarketCardProps {
  market: Market;
}

export function MarketCard({ market }: MarketCardProps) {
  const navigate = useNavigate();
  const createdAt = market.createdAt ? new Date(market.createdAt).toLocaleString() : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl">{market.title}</CardTitle>
            <CardDescription>By: {market.creator || "Unknown"}</CardDescription>
          </div>
          <Badge variant={market.status === "active" ? "default" : "secondary"}>
            {market.status === "active" ? "Active" : market.status === "archived" ? "Archived" : "Resolved"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Outcomes */}
        <div className="space-y-2">
          {market.outcomes.map((outcome) => (
            <div
              key={outcome.id}
              className="flex items-center justify-between bg-secondary/20 p-3 rounded-md"
            >
              <div>
                <p className="text-sm font-medium">{outcome.title}</p>
                <p className="text-xs text-muted-foreground">
                  ${outcome.totalBets.toFixed(2)} total
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">{outcome.odds}%</p>
              </div>
            </div>
          ))}
        </div>

        {/* Total Market Value */}
        <div className="p-3 rounded-md border border-primary/20 bg-primary/5">
          <p className="text-xs text-muted-foreground">Total Market Value</p>
          <p className="text-2xl font-bold text-primary">${market.totalMarketBets.toFixed(2)}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-md border bg-background/70 p-3 text-xs text-muted-foreground">
          <div>
            <p className="font-medium text-foreground">Participants</p>
            <p>{market.participantsCount}</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Created</p>
            <p>{createdAt || "Unknown"}</p>
          </div>
        </div>

        {/* Action Button */}
        <Button className="w-full" onClick={() => navigate({ to: `/markets/${market.id}` })}>
          {market.status === "active" ? "Place Bet" : market.status === "archived" ? "View Archive" : "View Results"}
        </Button>
      </CardContent>
    </Card>
  );
}
