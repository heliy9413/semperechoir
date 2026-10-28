// Supabase stores its session in localStorage under sb-<project-ref>-auth-token.
// AuthContext only needs a truthy token to decide whether to attempt auth.me().
const hasSession = () => {
  if (typeof window === 'undefined') return false;
  try {
    return Object.keys(window.localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
      || window.location.hash.includes('access_token')
      || window.location.search.includes('code=');
  } catch { return false; }
};

export const appParams = { token: hasSession() ? 'supabase-session' : null };
