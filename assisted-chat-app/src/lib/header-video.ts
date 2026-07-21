export const HEADER_VIDEO_STARTUP_TIMEOUT_MS = 5000;

export const HEADER_VIDEO_WEBVIEW_EVENTS = ['ready', 'playing', 'paused', 'ended', 'error'] as const;

export type HeaderVideoWebViewEvent = (typeof HEADER_VIDEO_WEBVIEW_EVENTS)[number];

export interface HeaderVideoWebViewMessage {
  type: HeaderVideoWebViewEvent;
  reason?: string;
}

export interface HeaderVideoUriValidation {
  ok: boolean;
  reason?: string;
}

const HEADER_VIDEO_EVENT_SET = new Set<string>(HEADER_VIDEO_WEBVIEW_EVENTS);
const DEVELOPMENT_HOST_PATTERN = /(?:^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/|$)|^https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)|[?&](?:platform|dev|hot|lazy)=)/i;

export function parseHeaderVideoWebViewMessage(data: unknown): HeaderVideoWebViewMessage | null {
  if (typeof data !== 'string') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const record = parsed as Record<string, unknown>;
  if (typeof record.type !== 'string' || !HEADER_VIDEO_EVENT_SET.has(record.type)) {
    return null;
  }

  return {
    type: record.type as HeaderVideoWebViewEvent,
    reason: typeof record.reason === 'string' ? sanitizeHeaderVideoDiagnostic(record.reason) : undefined,
  };
}

export function validateHeaderVideoUri(uri: string | null | undefined, production: boolean): HeaderVideoUriValidation {
  if (!uri || uri.trim().length === 0) {
    return { ok: false, reason: 'missing-video-uri' };
  }

  if (production && DEVELOPMENT_HOST_PATTERN.test(uri)) {
    return { ok: false, reason: 'development-server-uri' };
  }

  if (production && !uri.startsWith('file://')) {
    return { ok: false, reason: 'non-local-production-uri' };
  }

  return { ok: true };
}

export function getHeaderVideoReadAccessUri(videoUri: string | null) {
  if (!videoUri || !videoUri.startsWith('file://')) return videoUri;
  const lastSlashIndex = videoUri.lastIndexOf('/');
  return lastSlashIndex > 'file://'.length ? videoUri.slice(0, lastSlashIndex + 1) : videoUri;
}

export function buildHeaderVideoHtml(videoUri: string | null) {
  const sourceUriScript = JSON.stringify(videoUri);

  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
      video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        background: transparent;
        pointer-events: none;
      }
      video::-webkit-media-controls,
      video::-webkit-media-controls-panel,
      video::-webkit-media-controls-play-button,
      video::-webkit-media-controls-start-playback-button {
        display: none !important;
        opacity: 0 !important;
        -webkit-appearance: none !important;
      }
    </style>
  </head>
  <body>
    <video id="header-video" autoplay muted loop playsinline webkit-playsinline preload="auto" disablepictureinpicture controlslist="nodownload noplaybackrate nofullscreen"></video>
    <script>
      (function () {
        var video = document.getElementById('header-video');
        var sourceUri = ${sourceUriScript};
        var reportedReady = false;
        function notify(type, reason) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, reason: reason || undefined }));
          }
        }
        function playVideo() {
          if (!video || !sourceUri) return;
          var playPromise = video.play();
          if (playPromise && playPromise.catch) {
            playPromise.catch(function () {
              notify('error', 'playback-rejected');
            });
          }
        }
        window.__headerVideoControl = function (command) {
          if (!video) return;
          if (command === 'pause') {
            video.pause();
            return;
          }
          if (command === 'play') {
            playVideo();
          }
        };
        if (!sourceUri) {
          notify('error', 'missing-source');
          return;
        }
        video.controls = false;
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        video.addEventListener('loadedmetadata', function () {
          if (!reportedReady) {
            reportedReady = true;
            notify('ready');
          }
        });
        video.addEventListener('playing', function () { notify('playing'); });
        video.addEventListener('pause', function () { notify('paused'); });
        video.addEventListener('ended', function () { notify('ended'); });
        video.addEventListener('canplay', playVideo);
        video.addEventListener('error', function () { notify('error', 'media-error'); });
        video.src = sourceUri;
        video.load();
      })();
    </script>
  </body>
</html>`;
}

export function shouldShowHeaderVideoFallback(state: {
  videoStarted: boolean;
  videoFailed: boolean;
  videoUri: string | null;
}) {
  return !state.videoStarted || state.videoFailed || !state.videoUri;
}

export function sanitizeHeaderVideoDiagnostic(reason: string) {
  return reason
    .replace(/file:\/\/[^ "'<>)]+/g, 'file://[redacted]')
    .replace(/https?:\/\/[^ "'<>)]+/g, '[redacted-url]')
    .slice(0, 80);
}
