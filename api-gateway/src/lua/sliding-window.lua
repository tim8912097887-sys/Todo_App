local key_prefix = KEYS[1]

local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])

-- Current window timestamp
local current_window =
    math.floor(now / window) * window

-- Previous window timestamp
local previous_window =
    current_window - window

local current_key =
    key_prefix .. ":" .. current_window

local previous_key =
    key_prefix .. ":" .. previous_window

-- Get counts
local current_count =
    tonumber(redis.call(
        "GET",
        current_key
    ) or "0")

local previous_count =
    tonumber(redis.call(
        "GET",
        previous_key
    ) or "0")

-- Time passed in current window
local elapsed =
    now - current_window

-- Remaining percentage
local overlap =
    (window - elapsed) / window

-- Sliding window estimate
local estimated =
    previous_count * overlap
    + current_count

if estimated >= limit then
    return {
        0,
        estimated,
        limit
    }
end

-- Increment current window
current_count =
    redis.call("INCR", current_key)

-- Expire automatically
redis.call(
    "PEXPIRE",
    current_key,
    window * 2
)

return {
    1,
    estimated + 1,
    limit
}