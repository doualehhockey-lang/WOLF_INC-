-- src/infra/redis/scripts/rateLimit.lua
-- Atomic fixed-window rate limiter using INCR + EXPIRE.
-- Executed via EVAL so INCR and EXPIRE are a single atomic transaction.
--
-- KEYS[1]  : rate-limit key  (e.g. "rl:twilio:<ip>")
-- ARGV[1]  : window size in seconds
-- ARGV[2]  : maximum allowed requests in that window
--
-- Returns:
--   { current_count, 1 }   — allowed  (current ≤ limit)
--   { current_count, 0 }   — blocked  (current > limit)

local key    = KEYS[1]
local window = tonumber(ARGV[1])
local limit  = tonumber(ARGV[2])

local current = redis.call('INCR', key)

-- Set TTL only on first request — subsequent INCRs must not reset the window.
if current == 1 then
  redis.call('EXPIRE', key, window)
end

if current > limit then
  return { current, 0 }
else
  return { current, 1 }
end
