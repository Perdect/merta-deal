/**
 * Launch splash for the first page load (customer site and admin).
 *
 * How it stays honest and cheap:
 * - Ships inside the first HTML chunk as inline CSS + a ~1 KB inline script. No extra requests,
 *   and it does not wait for React or any JS bundle.
 * - Invisible for the first 200 ms: fast loads (cached pages, ISR) never show it at all.
 * - Hidden the moment the page content is in the DOM: the root layout's end sentinel has parsed and
 *   no route loading fallback (`[data-route-loading]`) remains. No minimum display time, no fake
 *   progress, and it never waits for its own animation.
 * - Lives in the root layout, which persists across client navigations, so it never replays while
 *   browsing, filtering or updating the cart (route-level skeletons and local spinners handle those).
 * - After 12 s of visible waiting without content it swaps to an error with Retry (time in a
 *   background tab doesn't count: browsers defer revealing streamed content until the tab is shown);
 *   if content arrives later it still hides. A CSS fail-safe hides it after 15 s even if the script never runs, so it cannot get stuck.
 * - Only attributes change on the client (React hydrates the element with suppressHydrationWarning).
 * - Reduced motion: no scaling or sliding, static indicator.
 */

export const SPLASH_DELAY_MS = 200;
export const SPLASH_TIMEOUT_MS = 12000;

export const SPLASH_CSS = `
#md-splash{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:max(24px,env(safe-area-inset-top)) 24px max(24px,env(safe-area-inset-bottom));background:radial-gradient(120% 80% at 50% 35%,#ffffff 0%,#f3faf3 70%,#eaf5eb 100%);color:#17201c;text-align:center;visibility:hidden;opacity:0;animation:md-s-in .28s ease-out ${SPLASH_DELAY_MS}ms forwards,md-s-guard 0s linear 15s forwards}
#md-splash[data-state=leaving]{animation:md-s-out .2s ease-in forwards;pointer-events:none}
#md-splash[data-state=error]{animation:none;visibility:visible;opacity:1}
#md-splash[hidden]{display:none!important}
#md-splash .md-s-logo{display:flex;align-items:center;gap:12px;transform-origin:center;animation:md-s-pop .5s cubic-bezier(.2,.8,.2,1) ${SPLASH_DELAY_MS}ms both}
#md-splash .md-s-word{font-family:var(--font-jakarta),var(--font-inter),system-ui,sans-serif;font-weight:800;font-size:28px;letter-spacing:-.02em}
#md-splash .md-s-word b{color:#329537;font-weight:800}
#md-splash .md-s-line{margin:0;font-family:var(--font-inter),system-ui,sans-serif;font-size:15px;color:#4b5550}
#md-splash .md-s-admin{display:none}
#md-splash[data-variant=admin] .md-s-shop{display:none}
#md-splash[data-variant=admin] .md-s-admin{display:inline}
#md-splash .md-s-bar{position:relative;width:96px;height:4px;overflow:hidden;border-radius:99px;background:#dbf0dc}
#md-splash .md-s-bar i{position:absolute;inset:0;width:40%;border-radius:99px;background:#329537;animation:md-s-slide 1.1s cubic-bezier(.45,0,.55,1) infinite}
#md-splash .md-s-err{display:none;flex-direction:column;align-items:center;gap:12px;max-width:320px}
#md-splash[data-state=error] .md-s-err{display:flex}
#md-splash[data-state=error] .md-s-bar,#md-splash[data-state=error] .md-s-line{display:none}
#md-splash .md-s-err p{margin:0;font:15px/1.45 var(--font-inter),system-ui,sans-serif;color:#4b5550}
#md-splash .md-s-err strong{display:block;margin-bottom:2px;font-size:16px;color:#17201c}
#md-splash button{height:44px;padding:0 22px;border:0;border-radius:12px;background:#329537;color:#fff;font:600 15px var(--font-inter),system-ui,sans-serif;cursor:pointer}
#md-splash button:focus-visible{outline:3px solid #b9dfbb;outline-offset:2px}
@keyframes md-s-in{from{visibility:visible;opacity:0}to{visibility:visible;opacity:1}}
@keyframes md-s-out{from{visibility:visible;opacity:1}to{visibility:hidden;opacity:0}}
@keyframes md-s-guard{to{visibility:hidden;opacity:0}}
@keyframes md-s-pop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
@keyframes md-s-slide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
@media (prefers-reduced-motion:reduce){
#md-splash{animation:md-s-in 0s linear ${SPLASH_DELAY_MS}ms forwards,md-s-guard 0s linear 15s forwards}
#md-splash[data-state=leaving]{animation:md-s-out 0s forwards}
#md-splash .md-s-logo{animation:none}
#md-splash .md-s-bar i{animation:none;width:100%;opacity:.55}
}
`.replace(/\n/g, "");

export const SPLASH_JS = `(function(){var s=document.getElementById("md-splash");if(!s)return;var p=location.pathname;
if(/^\\/(admin|rider)(\\/|$)/.test(p)){s.hidden=true;return}
if(/^\\/admin(\\/|$)/.test(p))s.setAttribute("data-variant","admin");
var done=false,mo=null,timer=0;
function ready(){return !!document.querySelector("[data-md-shell-end]")&&!document.querySelector("[data-route-loading]")}
function finish(){if(done)return;done=true;if(mo)mo.disconnect();clearTimeout(timer);if(s.contains(document.activeElement))document.activeElement.blur();s.setAttribute("aria-hidden","true");s.removeAttribute("role");
var shown=getComputedStyle(s).visibility==="visible"&&+getComputedStyle(s).opacity>0.05;
if(!shown){s.hidden=true;s.setAttribute("data-state","done");return}
s.setAttribute("data-state","leaving");setTimeout(function(){s.hidden=true;s.setAttribute("data-state","done")},220)}
function check(){if(!done&&ready())finish()}
var r=document.getElementById("md-splash-retry");if(r)r.addEventListener("click",function(){location.reload()});
if(window.MutationObserver){mo=new MutationObserver(check);mo.observe(document.documentElement,{childList:true,subtree:true})}
document.addEventListener("DOMContentLoaded",check);window.addEventListener("load",check);
function fail(){if(done)return;s.setAttribute("data-state","error");s.setAttribute("role","alert");if(r)r.focus()}
function arm(){clearTimeout(timer);timer=setTimeout(function(){if(document.hidden){return}fail()},${SPLASH_TIMEOUT_MS})}
document.addEventListener("visibilitychange",function(){if(done)return;if(document.hidden)clearTimeout(timer);else arm()});
if(!document.hidden)arm();
check()})();`;

function Mark() {
  return (
    <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#329537" />
      <g transform="translate(0 -2.5)">
        <path d="M12 18h6l5 22h22l5-16H21" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="26" cy="48" r="3.5" fill="#fff" />
        <circle cx="42" cy="48" r="3.5" fill="#fff" />
        <path d="M37 25l-6.5 9h5.5l-3 7.5 7.5-9.5h-5.5z" fill="#F2A93B" />
      </g>
    </svg>
  );
}

/** Rendered once as the first child of <body>; pair with <SplashShellEnd /> as the last child. */
export function LaunchSplash() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
      {/* Without JavaScript the server-rendered page is already complete, so no splash at all. */}
      <noscript><style>{"#md-splash{display:none!important}"}</style></noscript>
      <div id="md-splash" role="status" aria-live="polite" suppressHydrationWarning>
        <div className="md-s-logo">
          <Mark />
          <span className="md-s-word">Merta<b>Deal</b></span>
        </div>
        <p className="md-s-line">
          <span className="md-s-shop">Your daily essentials, delivered.</span>
          <span className="md-s-admin">Preparing your workspace.</span>
        </p>
        <span className="md-s-bar" aria-hidden="true"><i /></span>
        <span className="sr-only">Loading Merta Deal</span>
        <div className="md-s-err">
          <p><strong>This is taking too long</strong>Check your internet connection and try again.</p>
          <button id="md-splash-retry" type="button">Retry</button>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SPLASH_JS }} />
    </>
  );
}

/** Marks the end of the server-rendered shell; the splash only hides once this has been parsed. */
export function SplashShellEnd() {
  return <div data-md-shell-end="" hidden />;
}
