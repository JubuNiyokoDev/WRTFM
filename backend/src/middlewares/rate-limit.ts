// Rate Limiting Middleware
// Protects API endpoints from abuse using in-memory sliding window

import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup old entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000);

export interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds (default: 60000 = 1 minute)
  maxRequests?: number; // Max requests per window (default: 100)
  skipSuccessfulRequests?: boolean; // Don't count successful requests (default: false)
  keyGenerator?: (req: Request) => string; // Custom key generator (default: IP-based)
}

export function rateLimit(options: RateLimitOptions = {}) {
  const {
    windowMs = 60000,
    maxRequests = 100,
    skipSuccessfulRequests = false,
    keyGenerator = (req) => {
      // Use IP address as key, fallback to user ID if authenticated
      const ip = req.ip || 
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || 
        'unknown';
      const userId = (req as any).userId;
      return userId ? `user:${userId}` : `ip:${ip}`;
    },
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator(req);
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime < now) {
      // Create new entry or reset expired one
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, entry);
    } else {
      // Increment counter
      entry.count++;
    }

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetTime = Math.ceil(entry.resetTime / 1000);

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', resetTime);

    if (entry.count > maxRequests) {
      // Rate limit exceeded
      res.setHeader('Retry-After', Math.ceil((entry.resetTime - now) / 1000));
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil((entry.resetTime - now) / 1000)} seconds.`,
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
    }

    // Skip counting successful requests if configured
    if (skipSuccessfulRequests) {
      const originalJson = res.json;
      res.json = function(data) {
        if (res.statusCode < 400) {
          entry!.count--;
        }
        return originalJson.call(this, data);
      };
    }

    return next();
  };
}

// Pre-configured rate limiters for different endpoint types
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts per 15 minutes
});

export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
});

export const strictRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20, // 20 requests per minute
});

export const uploadRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 uploads per minute
});
