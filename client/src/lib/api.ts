const API_BASE_URL = import.meta.env.VITE_API_URL || "";

// Types
export interface Market {
  id: number;
  title: string;
  description?: string;
  status: "active" | "resolved" | "archived";
  creator?: string;
  createdAt?: string;
  participantsCount: number;

  outcomes: MarketOutcome[];
  totalMarketBets: number;
}

export interface MarketListResponse {
  items: Market[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ListMarketsParams {
  status?: "all" | "active" | "resolved" | "archived";
  sortBy?: "createdAt" | "totalBets" | "participants";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface UserBet {
  id: number;
  marketId: number;
  marketTitle: string;
  outcomeId: number;
  outcomeTitle: string;
  amount: number;
  placedAt: string;
  currentOdds: number;
  status: "active" | "resolved" | "archived";
  didWin: boolean | null;
}

export interface UserBetListResponse {
  items: UserBet[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface OddsHistoryPoint {
  timestamp: string;
  outcomes: Array<{
    id: number;
    title: string;
    totalBets: number;
    odds: number;
  }>;
}

export interface OddsHistoryResponse {
  marketId: number;
  snapshots: OddsHistoryPoint[];
}

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  username: string;
  settledBets: number;
  wins: number;
  losses: number;
  totalStaked: number;
  totalPayout: number;
  netProfit: number;
}

export interface LeaderboardResponse {
  items: LeaderboardEntry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface MarketOutcome {
  id: number;
  title: string;
  odds: number;
  totalBets: number;
}

export interface User {
  id: number;
  username: string;
  email: string;
  role: "user" | "admin";
  balance?: number;
  token: string;
}

export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  role: "user" | "admin";
  balance: number;
}

export interface Bet {
  id: number;
  userId: number;
  marketId: number;
  outcomeId: number;
  amount: number;
  createdAt: string;
}

export interface ResolveMarketResponse {
  success: boolean;
  marketId: number;
  resolvedOutcomeId: number;
  totalPool: number;
  winningPool: number;
  totalPayout: number;
  payouts: Array<{
    userId: number;
    amount: number;
  }>;
}

export interface ArchiveMarketResponse {
  success: boolean;
  marketId: number;
  archived: boolean;
  totalRefunded: number;
  refunds: Array<{
    userId: number;
    username: string;
    amount: number;
  }>;
}

// API Client
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getAuthHeader() {
    const token = localStorage.getItem("auth_token");
    if (!token) return null;
    return `Bearer ${token}`;
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");

    const authHeader = this.getAuthHeader();
    if (authHeader) {
      headers.set("Authorization", authHeader);
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401 && typeof window !== "undefined") {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        window.dispatchEvent(new Event("auth-expired"));
      }

      // If there are validation errors, throw them
      if (data.errors && Array.isArray(data.errors)) {
        const errorMessage = data.errors.map((e: any) => `${e.field}: ${e.message}`).join(", ");
        throw new Error(errorMessage);
      }
      throw new Error(data.error || `API Error: ${response.status}`);
    }

    return data ?? {};
  }

  // Auth endpoints
  async register(username: string, email: string, password: string): Promise<User> {
    return this.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    });
  }

  async login(email: string, password: string): Promise<User> {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async getCurrentUser(): Promise<CurrentUser> {
    return this.request("/api/users/me");
  }

  // Markets endpoints
  async listMarkets(params: ListMarketsParams = {}): Promise<MarketListResponse> {
    const search = new URLSearchParams();

    if (params.status) search.set("status", params.status);
    if (params.sortBy) search.set("sortBy", params.sortBy);
    if (params.sortOrder) search.set("sortOrder", params.sortOrder);
    if (params.page) search.set("page", String(params.page));
    if (params.pageSize) search.set("pageSize", String(params.pageSize));

    const queryString = search.toString();
    const endpoint = queryString ? `/api/markets?${queryString}` : "/api/markets";

    return this.request(endpoint);
  }

  async getMarket(id: number): Promise<Market> {
    return this.request(`/api/markets/${id}`);
  }

  async getMarketOddsHistory(id: number): Promise<OddsHistoryResponse> {
    return this.request(`/api/markets/${id}/odds-history`);
  }

  async createMarket(title: string, description: string, outcomes: string[]): Promise<Market> {
    return this.request("/api/markets", {
      method: "POST",
      body: JSON.stringify({ title, description, outcomes }),
    });
  }

  // Bets endpoints
  async placeBet(marketId: number, outcomeId: number, amount: number): Promise<Bet> {
    return this.request(`/api/markets/${marketId}/bets`, {
      method: "POST",
      body: JSON.stringify({ outcomeId, amount }),
    });
  }

  async resolveMarket(marketId: number, outcomeId: number): Promise<ResolveMarketResponse> {
    return this.request(`/api/markets/${marketId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ outcomeId }),
    });
  }

  async archiveMarket(marketId: number): Promise<ArchiveMarketResponse> {
    return this.request(`/api/markets/${marketId}/archive`, {
      method: "POST",
    });
  }

  async listMyBets(
    status: "active" | "resolved",
    page = 1,
    pageSize = 20,
  ): Promise<UserBetListResponse> {
    const query = new URLSearchParams({
      status,
      page: String(page),
      pageSize: String(pageSize),
    });

    return this.request(`/api/users/me/bets?${query.toString()}`);
  }

  async getLeaderboard(page = 1, pageSize = 20): Promise<LeaderboardResponse> {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });

    return this.request(`/api/users/leaderboard?${query.toString()}`);
  }
}

export const api = new ApiClient(API_BASE_URL);
