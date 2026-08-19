export function ok<T>(data: T, status = 200, meta?: object): Response {
  return new Response(JSON.stringify({ success: true, data, ...(meta && { meta }) }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
