export async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs: number = 30000,
  retries: number = 0  // default: no retry. Gateway calls can pass retries=2
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });

      // Retry on transient server errors
      if (retries > 0 && attempt < retries && response.status >= 500) {
        lastError = new Error(`Server error ${response.status}`);
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); // backoff
        continue;
      }

      return response;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        lastError = new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
      } else {
        lastError = err as Error;
      }
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error(`Request failed: ${url}`);
}
