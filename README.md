# LinkedIn Voyager Job API capture (sticky UI pill for applies/views)

A Tampermonkey userscript that captures LinkedIn Voyager Job API responses for the current job and displays a small, non-invasive “pill” in the page showing Applies and Views. It persists across SPA navigation .

-   File:  ``job-stats-pill.user.js``  
-   Match:  ``https://www.linkedin.com/*``
-   Run-at:  ``document-start``

## What it does

-   Intercepts  fetch  and  XMLHttpRequest  calls matching  /voyager/api/jobs/.../{currentJobId}.
-   Extracts applies and views from the response payload.
-   Renders a sticky pill with those stats next to a target element on the job page.
-   Survives LinkedIn’s SPA route changes and React re-renders.

## Features

-   Works across SPA navigation using  history.pushState/replaceState  hooks.
-   Handles both  fetch  and  XHR  (including blob/arraybuffer/json response types).
-   Non-destructive UI: injects beside the React-managed element rather than inside it.
-   Lightweight, no external dependencies.
-   Debug and extension hooks via  window  and a CustomEvent.

## Install

1.  Install Tampermonkey (or Violentmonkey) in your browser.
2.  Click the raw link to your script in GitHub to trigger installation, e.g.:
    -   [https://raw.githubusercontent.com/](https://raw.githubusercontent.com/)//main/li-voyager-job-stats-pill.user.js
3.  Approve the install prompt. Tampermonkey will auto-update based on the  @version  field.

Alternatively, create a new userscript in Tampermonkey and paste the script contents.

## Usage

-   Navigate to a LinkedIn job page where the URL contains  ?currentJobId=....
-   When LinkedIn requests  /voyager/api/jobs/.../{currentJobId}, the script captures the response.
-   A small pill appears showing:
    -   Applies: N
    -   Views: N

If the pill doesn’t appear:

-   The target selector may have changed (see Configuration).
-   The page may not have loaded a matching API response yet. Interact with the job module or refresh.


Solution:

-   take URL and put in new tap.

## Configuration

The script injects the pill next to a specific element controlled by LinkedIn’s React app. If LinkedIn changes their DOM, update  TARGET_SELECTOR.

-   Open the script and edit the  TARGET_SELECTOR  constant:

```js
const TARGET_SELECTOR = 'body > div:nth-child(42) > ... > span:nth-child(5)';
```

Tips for choosing a resilient selector:

-   Prefer stable attributes (data-test-id,  aria-label) over deep  :nth-child  chains.
-   Use a short path that still uniquely identifies the spot where you want the pill.
-   After updating, refresh the job page.

Styling:

-   You can tweak the pill look by editing the injected CSS in the script:
    -   .li-job-stats
    -   .li-job-stat
    -   .li-job-stats .sep

## Dev and extension hooks

The script exposes lightweight hooks to help you integrate or debug:

-   Global state:
    
    -   window.__jobApiResponse: last captured payload (any job)
    -   window.__jobApiResponseByJobId[jobId]: last payload by job ID
-   Promise helper:
    

```js
// Wait for the next response for the current job (or a specific jobId)
window.waitForJobApiResponse({ once: true }).then(console.log);
// or:
window.waitForJobApiResponse('1234567890', { once: true }).then(console.log);
```

-   Custom event:

```js
window.addEventListener('job-api-response', (e) => {
  // e.detail = { data, url, source: 'fetch'|'xhr', jobId, at }
  console.log('Job API response', e.detail);
});
```

-   Rendering:
    -   The pill wrapper element has ID  li-job-stats-wrap.
    -   To re-render with your own values, you can replace its children or adjust CSS classes.

## How it works

-   Hooks  window.fetch  and  XMLHttpRequest  to identify requests hitting  /voyager/api/jobs/.../{currentJobId}.
-   Parses the response payload robustly (supports text/json/blob/arraybuffer).
-   Extracts  { applies, views }  from  payload.data.
-   Injects a pill next to your  TARGET_SELECTOR  and re-attaches it if React wipes the node.
-   Listens for SPA navigation via  history  and  popstate  to refresh or reuse last-known data.

## Privacy and scope

-   Runs only on  linkedin.com  pages.
-   Reads only responses to the targeted Job API endpoint for the current job.
-   Does not send data anywhere; all processing stays in your browser.
-   Grant used:  @grant unsafeWindow  to expose helpers and interop with page context.

## Compatibility

-   Browsers: Chromium-based and Firefox (with Tampermonkey or Violentmonkey).
-   LinkedIn UI/DOM can change at any time; you may need to update  TARGET_SELECTOR.
-   Requires job URLs with  currentJobId  query param to match the API calls.

## Troubleshooting

-   No pill appears:
    -   Confirm the URL contains  currentJobId.
    -   Open DevTools Console and check for  [LI JobAPI]  logs.
    -   Update  TARGET_SELECTOR  to a valid, visible element on the job page.
-   Zero or “-” values:
    -   The API response may not include  applies/views  for that job.
    -   Try navigating between jobs to trigger fresh responses.
-   Intermittent disappearance:
    -   React re-renders can remove siblings; the script re-attaches automatically. If it still disappears, the DOM near your target changed; update the selector.

## Safety and terms

Use at your own risk. Automating or modifying the LinkedIn experience may be restricted by LinkedIn’s Terms of Service. This script is for personal, educational use in your own browser.

## Changelog

-   1.7.0
    -   Add sticky pill that re-attaches across React re-renders
    -   Add robust XHR reader for multiple response types
    -   Add SPA navigation detection and helper APIs