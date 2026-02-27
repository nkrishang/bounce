const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new ApiError(body.message || `HTTP ${response.status}`, response.status);
    }

    return response.json();
  }

  async post<T>(path: string, body: unknown, options?: { authToken?: string }): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options?.authToken) {
      headers['Authorization'] = `Bearer ${options.authToken}`;
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Unknown error' }));
      const err = new ApiError(body.message || `HTTP ${response.status}`, response.status);
      throw err;
    }

    return response.json();
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new ApiError(body.message || `HTTP ${response.status}`, response.status);
    }

    return response.json();
  }
}

export const api = new ApiClient(API_URL);
