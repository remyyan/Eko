// Simple rate limiter for Gemini API
// Free tier: 5 requests per minute

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimits = new Map<string, RateLimitEntry>();
const MAX_REQUESTS_PER_MINUTE = 4; // Keep it at 4 to be safe (limit is 5)
const WINDOW_MS = 60 * 1000; // 1 minute

export function checkRateLimit(key: string = "gemini"): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || now > entry.resetTime) {
    // New window
    rateLimits.set(key, {
      count: 1,
      resetTime: now + WINDOW_MS,
    });
    return { allowed: true };
  }

  if (entry.count >= MAX_REQUESTS_PER_MINUTE) {
    // Rate limit exceeded
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Increment count
  entry.count++;
  return { allowed: true };
}

export function resetRateLimit(key: string = "gemini"): void {
  rateLimits.delete(key);
}

