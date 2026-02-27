const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
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
      throw new ApiError(body.message || body.error || `HTTP ${response.status}`, response.status, body);
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
      const respBody = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new ApiError(respBody.message || respBody.error || `HTTP ${response.status}`, response.status, respBody);
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
      throw new ApiError(body.message || body.error || `HTTP ${response.status}`, response.status, body);
    }

    return response.json();
  }
}

export const api = new ApiClient(API_URL);
