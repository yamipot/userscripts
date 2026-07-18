const REQUEST_TIMEOUT_MS = 30_000;

export type PageRequestOptions = {
  body?: BodyInit | null;
  headers?: HeadersInit;
  method?: "GET" | "POST";
  signal?: AbortSignal;
  timeoutMs?: number | null;
};

export type PageResponse = {
  document: Document;
  url: string;
};

export async function requestPage(url: string, options: PageRequestOptions = {}): Promise<PageResponse> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeoutMs = options.timeoutMs === undefined ? REQUEST_TIMEOUT_MS : options.timeoutMs;
  const timeout = timeoutMs === null ? null : window.setTimeout(abort, timeoutMs);

  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener("abort", abort, { once: true });
  }

  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      body: options.body,
      credentials: "include",
      headers: options.headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    return {
      document: new DOMParser().parseFromString(html, "text/html"),
      url: response.url || url,
    };
  } finally {
    if (timeout !== null) {
      window.clearTimeout(timeout);
    }
    options.signal?.removeEventListener("abort", abort);
  }
}

export async function updateGalleryFavorite(actionUrl: string, value: string): Promise<void> {
  const body = new URLSearchParams();
  body.set("favcat", value);
  body.set("favnote", "");
  body.set("apply", "Apply Changes");
  body.set("update", "1");

  await requestPage(actionUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
}
