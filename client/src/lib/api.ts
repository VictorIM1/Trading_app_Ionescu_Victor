const API_BASE_URL = import.meta.env.VITE_API_URL || "";

// Types
export interface Market {
  id: number;
  title: string;
  description?: string;
  status: "active" | "resolved";
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
  status?: "all" | "active" | "resolved";
  sortBy?: "createdAt" | "totalBets" | "participants";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
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
  token: string;
}

export interface Bet {
  id: number;
  userId: number;
  marketId: number;
  outcomeId: number;
  amount: number;
  createdAt: string;
}

// API Client
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getAuthHeader() {
    const token = localStorage.getItem("auth_token");
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...this.getAuthHeader(),
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
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
}

export const api = new ApiClient(API_BASE_URL);
