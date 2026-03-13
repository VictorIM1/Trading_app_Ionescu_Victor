const apiOrigin = "http://server:4001";

export async function proxyApiRequest(request: Request, targetPath: string): Promise<Response> {
  const headers = new Headers(request.headers);

  headers.delete("host");

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    if (request.body) {
      init.duplex = "half";
    }
  }

  const requestUrl = new URL(request.url);
  const targetUrl = new URL(targetPath, apiOrigin);

  if (requestUrl.search) {
    targetUrl.search = requestUrl.search;
  }

  return fetch(targetUrl, init);
}