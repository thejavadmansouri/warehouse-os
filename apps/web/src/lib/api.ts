const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    cache: "no-store",
    ...options,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const message = Array.isArray(errorData.message)
      ? errorData.message.join(" - ")
      : errorData.message || `خطایی با کد ${res.status} رخ داد`;
    throw new Error(message);
  }

  return res.json();
}
