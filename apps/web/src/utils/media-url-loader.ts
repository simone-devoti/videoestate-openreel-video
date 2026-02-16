export interface MediaLoaderOptions {
  proxyUrl?: string;
  credentials?: RequestCredentials;
  filename?: string;
  mimeType?: string;
  timeout?: number;
  onProgress?: (loaded: number, total: number) => void;
}

export interface MediaLoaderResult {
  file: File;
  originalUrl: string;
  fetchedUrl: string;
  size: number;
  mimeType: string;
}

const MIME_TYPE_MAP: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  m4v: "video/x-m4v",
  flv: "video/x-flv",
  wmv: "video/x-ms-wmv",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  opus: "audio/opus",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tiff: "image/tiff",
  tif: "image/tiff",
};

function extractFilenameFromHeader(contentDisposition: string): string | null {
  const filenameMatch = contentDisposition.match(
    /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i
  );
  
  if (filenameMatch && filenameMatch[1]) {
    return filenameMatch[1].replace(/['"]/g, "").trim();
  }
  
  return null;
}

function extractFilenameFromUrl(url: URL): string {
  const pathParts = url.pathname.split("/").filter(Boolean);
  
  if (pathParts.length > 0) {
    const lastPart = pathParts[pathParts.length - 1];
    return lastPart.split("?")[0].split("#")[0];
  }
  
  return "media";
}

function inferMimeTypeFromExtension(filename: string): string | null {
  const extension = filename.split(".").pop()?.toLowerCase();
  
  if (extension && MIME_TYPE_MAP[extension]) {
    return MIME_TYPE_MAP[extension];
  }
  
  return null;
}

function buildFetchUrl(
  url: string,
  proxyUrl?: string
): { fetchUrl: string; isProxied: boolean } {
  if (!proxyUrl) {
    const envProxyUrl = import.meta.env.VITE_MEDIA_PROXY_URL;
    if (envProxyUrl) {
      proxyUrl = envProxyUrl;
    }
  }
  
  if (!proxyUrl) {
    return { fetchUrl: url, isProxied: false };
  }
  
  const separator = proxyUrl.includes("?") ? "&" : "?";
  const fetchUrl = `${proxyUrl}${separator}url=${encodeURIComponent(url)}`;
  
  return { fetchUrl, isProxied: true };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    
    throw error;
  }
}

function validateUrl(url: string): URL {
  try {
    return new URL(url);
  } catch {
    throw new Error(`Invalid URL format: ${url}`);
  }
}

export async function fetchMediaFromUrl(
  url: string,
  options: MediaLoaderOptions = {}
): Promise<MediaLoaderResult> {
  const {
    proxyUrl,
    credentials = "omit",
    filename: customFilename,
    mimeType: customMimeType,
    timeout = 30000,
    onProgress,
  } = options;
  
  const parsedUrl = validateUrl(url);
  const { fetchUrl } = buildFetchUrl(url, proxyUrl);
  
  const fetchOptions: RequestInit = {
    method: "GET",
    mode: "cors",
    credentials,
  };
  
  let response: Response;
  
  try {
    response = await fetchWithTimeout(fetchUrl, fetchOptions, timeout);
  } catch (error) {
    if (error instanceof TypeError) {
      const errorMessage = error.message.toLowerCase();
      
      if (
        errorMessage.includes("fetch") ||
        errorMessage.includes("cors") ||
        errorMessage.includes("network")
      ) {
        throw new Error(
          `CORS error: The server at ${parsedUrl.origin} does not allow cross-origin requests.\n\n` +
            `Solutions:\n` +
            `1. Configure CORS on the server (S3 bucket, etc.) to allow your origin\n` +
            `2. Use a proxy endpoint (set VITE_MEDIA_PROXY_URL or pass proxyUrl option)\n` +
            `3. Use signed URLs with proper CORS headers\n` +
            `4. Set up a backend proxy that adds CORS headers\n\n` +
            `Current origin: ${window.location.origin}\n` +
            `Target origin: ${parsedUrl.origin}`
        );
      }
      
      if (errorMessage.includes("timeout")) {
        throw new Error(
          `Request timeout: Failed to fetch media within ${timeout}ms`
        );
      }
    }
    
    throw new Error(
      `Failed to fetch media: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
  
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText}: Failed to fetch media from URL`
    );
  }
  
  // Get content length for progress tracking
  const contentLength = response.headers.get("Content-Length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  
  let blob: Blob;
  
  try {
    if (onProgress && response.body) {
      // Read stream with progress tracking
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        chunks.push(value);
        loaded += value.length;
        
        // Call progress callback (use loaded as total if Content-Length not available)
        onProgress(loaded, total > 0 ? total : loaded);
      }
      
      // Combine all chunks into a single blob
      const allChunks = new Uint8Array(loaded);
      let position = 0;
      for (const chunk of chunks) {
        allChunks.set(chunk, position);
        position += chunk.length;
      }
      
      blob = new Blob([allChunks]);
    } else {
      // Fallback to standard blob() if no progress tracking needed
      blob = await response.blob();
      if (onProgress && blob.size > 0) {
        onProgress(blob.size, blob.size);
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to read response body: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
  
  if (!blob || blob.size === 0) {
    throw new Error("Empty response: The server returned an empty file");
  }
  
  let filename: string = customFilename || "";
  
  if (!filename) {
    const contentDisposition = response.headers.get("Content-Disposition");
    if (contentDisposition) {
      const headerFilename = extractFilenameFromHeader(contentDisposition);
      if (headerFilename) {
        filename = headerFilename;
      }
    }
    
    if (!filename) {
      filename = extractFilenameFromUrl(parsedUrl);
    }
  }
  
  if (!filename.includes(".")) {
    const contentType = response.headers.get("Content-Type");
    if (contentType) {
      const mimeToExt: Record<string, string> = {
        "video/mp4": "mp4",
        "video/webm": "webm",
        "audio/mpeg": "mp3",
        "audio/wav": "wav",
        "image/jpeg": "jpg",
        "image/png": "png",
      };
      
      const ext = Object.entries(mimeToExt).find(([mime]) =>
        contentType.includes(mime)
      )?.[1];
      
      if (ext) {
        filename = `${filename}.${ext}`;
      }
    }
  }
  
  let mimeType = customMimeType;
  
  if (!mimeType) {
    mimeType = response.headers.get("Content-Type") || "";
    
    if (mimeType) {
      mimeType = mimeType.split(";")[0].trim();
    }
    
    if (!mimeType || mimeType === "application/octet-stream") {
      mimeType = blob.type || "";
    }
    
    if (!mimeType || mimeType === "application/octet-stream") {
      const inferred = inferMimeTypeFromExtension(filename);
      if (inferred) {
        mimeType = inferred;
      } else {
        mimeType = "application/octet-stream";
      }
    }
  }
  
  const file = new File([blob], filename, { type: mimeType });
  
  return {
    file,
    originalUrl: url,
    fetchedUrl: fetchUrl,
    size: blob.size,
    mimeType,
  };
}

export async function fetchMediaFromUrlAsFile(
  url: string,
  options?: MediaLoaderOptions
): Promise<File> {
  const result = await fetchMediaFromUrl(url, options);
  return result.file;
}
