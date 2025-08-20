// ==UserScript==
// @name         LinkedIn Voyager Job API capture (sticky UI pill for applies/views)
// @namespace    http://tampermonkey.net/
// @version      1.8.0
// @description  Capture responses to /voyager/api/jobs/.../{currentJobId} on LinkedIn; works across SPA URL changes and renders applies/views in-page without being overwritten by SPA Framework use by LinkedIn. Renders above .job-details-fit-level-preferences.
// @match        https://www.linkedin.com/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  install(unsafeWindow);

  function install(W) {
    if (W.__liJobApiInterceptorInstalled) return;
    W.__liJobApiInterceptorInstalled = true;

    // ====== CONFIG: anchor selectors to insert above ======
    const ANCHOR_SELECTORS = [
      '.job-details-fit-level-preferences',
      '[class*="job-details-fit-level-preferences"]'
    ];

    // Wrapper ID for the pill we inject
    const WRAP_ID = 'li-job-stats-wrap';

    // State
    W.__jobApiResponse = null;
    W.__jobApiResponseByJobId = W.__jobApiResponseByJobId || Object.create(null);
    const listenersByJobId = new Map();

    // Inject styles for the pill
    (function injectStatsCSS() {
      if (document.getElementById('li-job-stats-style')) return;
      const style = document.createElement('style');
      style.id = 'li-job-stats-style';
      style.textContent = `
        .li-job-stats { display: inline-flex; gap: 8px; align-items: center; font-weight: 600; margin: 8px 0; vertical-align: middle; }
        .li-job-stat { padding: 2px 6px; border-radius: 999px; background: #eef3f8; color: #0a66c2; font-size: 12px; line-height: 1.4; }
        .li-job-stats .sep { color: #666; font-weight: 400; }
      `;
      (document.head || document.documentElement).appendChild(style);
    })();

    const getCurrentJobId = () => {
      try {
        return new URLSearchParams(W.location.search).get('currentJobId') || '';
      } catch {
        return '';
      }
    };

    function matchUrlForCurrentJob(rawUrl) {
      const jobId = getCurrentJobId();
      if (!jobId) return { ok: false };

      try {
        const u = typeof rawUrl === 'string'
          ? new URL(rawUrl, W.location.origin)
          : new URL(rawUrl.url, W.location.origin);

        const path = u.pathname || '';
        if (path.includes('/voyager/api/jobs/') && path.includes(`/${jobId}`)) {
          return { ok: true, jobId, urlStr: u.toString() };
        }
      } catch { }
      return { ok: false };
    }

    // Wait for the first element that matches any of the given selectors
    function waitForAny(selectors, timeoutMs = 30000) {
      const queryStr = Array.isArray(selectors) ? selectors.join(', ') : String(selectors);
      const tryFind = () => document.querySelector(queryStr);

      const immediate = tryFind();
      if (immediate) return Promise.resolve(immediate);

      return new Promise((resolve, reject) => {
        let done = false;
        const finish = (fn) => {
          if (done) return;
          done = true;
          try { observer.disconnect(); } catch {}
          fn();
        };

        const observer = new MutationObserver(() => {
          const el = tryFind();
          if (el) finish(() => resolve(el));
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });

        const to = setTimeout(() => {
          finish(() => reject(new Error('Not found: ' + queryStr)));
        }, timeoutMs);

        // If DOM becomes ready and the element is present, resolve sooner
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            const el = tryFind();
            if (el) {
              clearTimeout(to);
              finish(() => resolve(el));
            }
          }, { once: true });
        }
      });
    }

    // Extract applies/views from payload.data (string or JSON)
    function extractAppliesViews(data) {
      try {
        let d = data;
        if (typeof d === 'string') {
          try { d = JSON.parse(d); } catch { }
        }
        const applies = d?.data?.applies;
        const views = d?.data?.views;
        return { applies, views };
      } catch {
        return { applies: undefined, views: undefined };
      }
    }

    // Helpers to build nodes
    function makeStat(text) {
      const s = document.createElement('span');
      s.className = 'li-job-stat';
      s.textContent = text;
      return s;
    }
    function makeSep(text) {
      const s = document.createElement('span');
      s.className = 'sep';
      s.textContent = text;
      return s;
    }

    // Keep re-attaching the pill if React wipes it out
    function persistWrap(targetSelectors, wrap) {
      if (wrap.__liObserverInstalled) return;
      wrap.__liObserverInstalled = true;

      const selectorStr = Array.isArray(targetSelectors) ? targetSelectors.join(', ') : String(targetSelectors);

      let rafId = 0;
      const schedule = (fn) => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(fn);
      };

      const reattach = () => {
        const currentWrap = document.getElementById(WRAP_ID);
        if (!currentWrap || !document.contains(currentWrap)) {
          const freshTarget = document.querySelector(selectorStr);
          if (freshTarget) {
            const w = currentWrap || wrap;
            // Insert above the anchor
            freshTarget.insertAdjacentElement('beforebegin', w);
          }
        }
      };

      const mo = new MutationObserver(() => {
        schedule(reattach);
      });

      if (document.body) {
        mo.observe(document.body, { childList: true, subtree: true });
      } else {
        const mo2 = new MutationObserver(() => {
          if (document.body) {
            mo2.disconnect();
            mo.observe(document.body, { childList: true, subtree: true });
          }
        });
        mo2.observe(document.documentElement, { childList: true, subtree: true });
      }

      // Also handle URL changes that remount content
      W.addEventListener('locationchange', () => schedule(reattach));
    }

    // Render the pill above the .job-details-fit-level-preferences block
    async function renderJobStatsIntoTarget(applies, views) {
      try {
        const anchor = await waitForAny(ANCHOR_SELECTORS, 30000);

        // Create or reuse wrapper
        let wrap = document.getElementById(WRAP_ID);
        if (!wrap || !document.contains(wrap)) {
          wrap = document.createElement('div'); // block-level line above section
          wrap.id = WRAP_ID;
          wrap.className = 'li-job-stats';
        }

        // Update content
        const appliesSpan = makeStat(`Applies: ${applies ?? '-'}`);
        const sep = makeSep('•');
        const viewsSpan = makeStat(`Views: ${views ?? '-'}`);
        wrap.replaceChildren(appliesSpan, sep, viewsSpan);

        // Insert above the anchor
        anchor.insertAdjacentElement('beforebegin', wrap);

        // Make it sticky across React re-renders
        persistWrap(ANCHOR_SELECTORS, wrap);
      } catch (e) {
        console.warn('[LI JobAPI] Could not find anchor to mount above:', e);
      }
    }

    // Deliver captured data + render
    function deliver({ data, url, source, jobId }) {
      const payload = { data, url, source, jobId, at: Date.now() };
      W.__jobApiResponse = payload;
      if (jobId) W.__jobApiResponseByJobId[jobId] = payload;

      // Log applies/views for debug and render in the page
      try {
        const { applies, views } = extractAppliesViews(payload.data);
        console.log('[LI JobAPI] applies:', applies, 'views:', views, { jobId: payload.jobId });
        renderJobStatsIntoTarget(applies, views);
      } catch (e) {
        console.warn('[LI JobAPI] Failed to print/render applies/views:', e);
      }

      // Fire event
      try { W.dispatchEvent(new CustomEvent('job-api-response', { detail: payload })); } catch { }

      // Resolve waiters
      const notify = (key) => {
        const arr = listenersByJobId.get(key);
        if (!arr || !arr.length) return;
        const toResolve = arr.splice(0, arr.length);
        toResolve.forEach(({ resolve }) => { try { resolve(payload); } catch { } });
      };
      notify(jobId || '*');
      notify('*');
    }

    function waitForJobApiResponse(jobIdOrOpts, opts) {
      let jobId = '';
      let once = false;
      if (typeof jobIdOrOpts === 'string') {
        jobId = jobIdOrOpts;
        once = !!(opts && opts.once);
      } else {
        jobId = getCurrentJobId();
        once = !!(jobIdOrOpts && jobIdOrOpts.once);
      }
      const key = jobId || '*';

      return new Promise((resolve) => {
        if (!once && jobId && W.__jobApiResponseByJobId[jobId]) {
          resolve(W.__jobApiResponseByJobId[jobId]);
          return;
        }
        const arr = listenersByJobId.get(key) || [];
        arr.push({ resolve });
        listenersByJobId.set(key, arr);
      });
    }
    W.waitForJobApiResponse = W.waitForJobApiResponse || waitForJobApiResponse;

    // FETCH hook
    function hookFetch() {
      const orig = W.fetch;
      if (!orig || W.__liFetchHooked) return;
      W.__liFetchHooked = true;

      W.fetch = async function (input, init) {
        const urlStr = typeof input === 'string' ? input : (input && input.url);
        const match = urlStr ? matchUrlForCurrentJob(urlStr) : { ok: false };

        const res = await orig.apply(this, arguments);

        if (match.ok) {
          try {
            const clone = res.clone();
            const ct = (clone.headers.get('content-type') || '').toLowerCase();
            const isJson = ct.includes('json'); // handles vendor JSON types
            const data = isJson ? await clone.json() : await clone.text();
            deliver({ data, url: match.urlStr || String(urlStr), source: 'fetch', jobId: match.jobId });
          } catch (e) {
            console.warn('[LI JobAPI] Failed to read fetch response:', e);
          }
        }
        return res;
      };
    }

    // Helper: robustly read XHR response across responseTypes
    async function readXhrResponse(xhr) {
      const ct = (xhr.getResponseHeader('content-type') || '').toLowerCase();
      const looksJson = ct.includes('json');

      const rt = xhr.responseType || '';
      try {
        if (rt === '' || rt === 'text') {
          const txt = xhr.responseText;
          if (looksJson) {
            try { return JSON.parse(txt); } catch { return txt; }
          }
          return txt;
        }
        if (rt === 'json') {
          if (xhr.response != null) return xhr.response;
          const txt = xhr.responseText;
          try { return JSON.parse(txt); } catch { return txt; }
        }
        if (rt === 'blob') {
          const blob = xhr.response;
          if (!blob) return null;
          if (typeof blob.text === 'function') {
            const text = await blob.text();
            if (looksJson) {
              try { return JSON.parse(text); } catch { return text; }
            }
            return text;
          }
          const text = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result || ''));
            fr.onerror = reject;
            fr.readAsText(blob);
          });
          if (looksJson) {
            try { return JSON.parse(text); } catch { return text; }
          }
          return text;
        }
        if (rt === 'arraybuffer') {
          const buf = xhr.response;
          if (!buf) return null;
          const dec = new TextDecoder('utf-8');
          const text = dec.decode(buf);
          if (looksJson) {
            try { return JSON.parse(text); } catch { return text; }
          }
          return text;
        }
        // Other / unknown types
        return xhr.response ?? xhr.responseText ?? null;
      } catch (e) {
        console.warn('[LI JobAPI] XHR read error:', e);
        try {
          const txt = xhr.responseText;
          if (looksJson) {
            try { return JSON.parse(txt); } catch { return txt; }
          }
          return txt;
        } catch {
          return null;
        }
      }
    }

    // XHR hook (handles blob/arraybuffer/etc.)
    function hookXHR() {
      const XHRProto = W.XMLHttpRequest && W.XMLHttpRequest.prototype;
      if (!XHRProto || W.__liXHRHooked) return;
      W.__liXHRHooked = true;

      const origOpen = XHRProto.open;
      const origSend = XHRProto.send;

      XHRProto.open = function (method, url) {
        this.__liInterceptUrl = url;
        return origOpen.apply(this, arguments);
      };

      XHRProto.send = function (body) {
        const url = this.__liInterceptUrl;
        const match = url ? matchUrlForCurrentJob(url) : { ok: false };

        if (match.ok) {
          this.addEventListener('loadend', function () {
            // Only proceed when request actually completed
            if (typeof this.status === 'number' && this.status === 0 && this.readyState !== 4) return;

            (async () => {
              try {
                const data = await readXhrResponse(this);
                deliver({ data, url: String(url), source: 'xhr', jobId: match.jobId });
              } catch (e) {
                console.warn('[LI JobAPI] Failed to parse XHR response:', e);
              }
            })();
          });
        }
        return origSend.apply(this, arguments);
      };
    }

    // URL change detection for SPA navigation
    function installLocationChangeEvents() {
      const fire = () => {
        try { W.dispatchEvent(new Event('locationchange')); } catch { }
      };
      const origPush = W.history.pushState;
      const origReplace = W.history.replaceState;

      if (!W.__liHistoryPatched) {
        W.__liHistoryPatched = true;
        W.history.pushState = function () { const ret = origPush.apply(this, arguments); fire(); return ret; };
        W.history.replaceState = function () { const ret = origReplace.apply(this, arguments); fire(); return ret; };
        W.addEventListener('popstate', fire);
        W.addEventListener('hashchange', fire);
      }

      const onChange = () => {
        const jid = getCurrentJobId();
        if (jid) {
          try { console.log('[LI JobAPI] URL changed. currentJobId =', jid, '— waiting for matching job API response...'); } catch { }
          waitForJobApiResponse(jid, { once: true }).then(r => {
            try { console.log('[LI JobAPI] Received matching response after URL change:', r); } catch { }
          }).catch(() => { });
          // Re-render on URL change using last-known for this jobId (if any)
          const last = W.__jobApiResponseByJobId && W.__jobApiResponseByJobId[jid];
          if (last) {
            const { applies, views } = extractAppliesViews(last.data);
            renderJobStatsIntoTarget(applies, views);
          }
        } else {
          try { console.log('[LI JobAPI] URL changed. No currentJobId in query.'); } catch { }
        }
      };

      W.addEventListener('locationchange', onChange);
      onChange(); // initial
    }

    hookFetch();
    hookXHR();
    installLocationChangeEvents();

    try { console.log('[LI JobAPI] Interceptor installed. Waiting for /voyager/api/jobs/.../{currentJobId}'); } catch { }
  }
})();
