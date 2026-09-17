// CommonJS copy of maskPushToken/redactPushTokens from apps/web/src/lib/expo-push.ts
// for the plain-node scripts; apps/web/src/lib/__tests__/expo-push.test.mjs checks
// both implementations against the same cases.

const VISIBLE_TOKEN_CHARS = 6;
const EXPO_TOKEN_PATTERN = /(Expo(?:nent)?PushToken\[)([^\]]*)\]/g;

const maskValue = (value) =>
    `${value.slice(0, Math.min(VISIBLE_TOKEN_CHARS, Math.floor(value.length / 2)))}…`;

function maskPushToken(token) {
    if (!token) return '<none>';
    const wrapped = /^(Expo(?:nent)?PushToken\[)([^\]]*)\]$/.exec(token);
    return wrapped ? `${wrapped[1]}${maskValue(wrapped[2])}]` : maskValue(token);
}

function redactPushTokens(text) {
    return String(text).replace(EXPO_TOKEN_PATTERN, (token) => maskPushToken(token));
}

module.exports = { maskPushToken, redactPushTokens };
