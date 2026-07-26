const API_BASE = '';
const USER_EMAIL = 'aisha@local.dev';

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-email': USER_EMAIL,
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorMsg = response.statusText;
    try {
      const errorData = await response.json();
      if (errorData?.error?.message) {
        errorMsg = errorData.error.message;
      } else if (errorData?.detail) {
        // Fallback for unhandled FastAPI errors
        errorMsg = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
      }
    } catch (e) {
      const text = await response.text().catch(() => '');
      if (text) errorMsg = text;
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export function apiSSE(path, onMessage, onError) {
  // EventSource can't set headers, so pass the identity as a query param.
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API_BASE}${path}${sep}x-user-email=${encodeURIComponent(USER_EMAIL)}`;
  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (err) {
      console.error('Failed to parse SSE payload:', err);
    }
  };

  eventSource.onerror = (err) => {
    if (onError) onError(err);
  };

  return eventSource;
}
