/** Keep bearer capabilities out of analytics paths, locations and referrers. */
export function analyticsUrl(raw: string): string {
  if (!raw) return '';
  try {
    const absolute = /^https?:\/\//i.test(raw);
    const url = new URL(raw, 'https://redacted.invalid');
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (/^\/(?:track\/(?:customer|driver|shared)\/|tracking\/|success\/|verify-email\/|reset-password\/)/i.test(url.pathname)) {
      url.pathname = `/${url.pathname.split('/').filter(Boolean)[0]}/private`;
      url.search = '';
    } else {
      for (const key of [...url.searchParams.keys()]) {
        if (/token|secret|password|authorization|bookingAccess/i.test(key)) url.searchParams.delete(key);
      }
    }
    url.hash = '';
    return `${absolute ? url.origin : ''}${url.pathname}${url.search}`;
  } catch { return '/private'; }
}

// This self-contained function is installed before gtag.js/config, protecting
// initial automatic Ads events as well as later client-side page views.
export function analyticsPrivacyBootstrap() {
  return `window.__TR_ANALYTICS_URL=(${analyticsUrl.toString()});` +
    "function gtag(){if(arguments[0]==='config'||arguments[0]==='event'){var p=arguments[2]||{};arguments[2]=Object.assign({},p,{page_location:window.__TR_ANALYTICS_URL(p.page_location||window.location.href),page_referrer:window.__TR_ANALYTICS_URL(document.referrer||'')});if(typeof p.page_path==='string')arguments[2].page_path=window.__TR_ANALYTICS_URL(p.page_path);}dataLayer.push(arguments)}";
}
