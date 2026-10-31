// Tuck on the page: draws what background.js decided (see present.js) inside its own
// Shadow DOM at the top right. It reads nothing from the page. Injected with
// chrome.scripting, possibly several times into one page, so it installs once.
(() => {
  if (window.__tuckInstalled) return;
  window.__tuckInstalled = true;

  const HOST_ID = "tuck-companion";
  let root = null;
  let leaveTimer = null;
  let settleTimer = null;
  let current = null; // the view on screen

  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});

  const STYLE = `
    :host { all: initial; }
    .dock { position: fixed; top: 16px; right: 16px; z-index: 2147483647; display: flex; flex-direction: column;
            align-items: flex-end; gap: 8px; font: 14px/1.4 system-ui, -apple-system, sans-serif; color: #24262d;
            transform: translateX(140%); transition: transform .45s cubic-bezier(.2,.8,.2,1); pointer-events: none; }
    .dock.in { transform: none; }
    .avatar { all: unset; cursor: pointer; pointer-events: auto; border-radius: 16px; }
    .avatar:focus-visible { outline: 2px solid #94BFAE; outline-offset: 2px; }
    .tuck { --tuck-accent: #94BFAE; width: 72px; height: 72px; filter: drop-shadow(0 2px 6px rgba(0,0,0,.18)); }
    .bubble { pointer-events: auto; width: 260px; background: #fff; border: 1px solid #dfe3e8; border-radius: 14px;
              padding: 12px 14px; box-shadow: 0 8px 24px rgba(0,0,0,.14); position: relative; }
    .bubble[hidden] { display: none; }
    .text { margin: 0 18px 10px 0; font-weight: 600; }
    .next { margin: -6px 0 10px; color: #65616d; font-size: 13px; }
    .row { display: flex; flex-wrap: wrap; gap: 6px; }
    button.b { all: unset; cursor: pointer; border: 1px solid #cfd5dc; border-radius: 999px; padding: 5px 12px;
               font-size: 13px; color: #24262d; background: #fff; }
    button.b.primary { background: #94BFAE; border-color: #94BFAE; font-weight: 600; color: #1f2a26; }
    button.b:hover { border-color: #94BFAE; }
    button.b:focus-visible { outline: 2px solid #94BFAE; outline-offset: 1px; }
    .close { all: unset; cursor: pointer; position: absolute; top: 6px; right: 10px; color: #8a8f98; font-size: 16px; }
    form { display: grid; gap: 6px; margin: 0; }
    input { all: unset; border: 1px solid #cfd5dc; border-radius: 8px; padding: 6px 8px; font-size: 13px;
            background: #fff; color: #24262d; }
    input:focus { border-color: #94BFAE; }
    .pick { margin-bottom: 8px; display: grid; gap: 6px; }
    @media (prefers-color-scheme: dark) {
      .bubble { background: #24262d; border-color: #3a3d46; color: #eceef1; }
      .dock { color: #eceef1; }
      button.b, input { background: #2d3038; border-color: #464a54; color: #eceef1; }
      button.b.primary { color: #1f2a26; }
      .next { color: #a9adb6; }
    }`;

  function el(tag, props = {}, ...children) {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...children.filter(Boolean));
    return e;
  }

  function ensureRoot({ svg, css }) {
    if (root?.isConnected) return root;
    const host = el("div", { id: HOST_ID });
    const shadow = host.attachShadow({ mode: "open" });
    const avatar = el("button", { className: "avatar", ariaLabel: "Open Tuck", title: "Tuck" });
    avatar.innerHTML = svg;
    const art = avatar.querySelector("svg");
    art.setAttribute("aria-hidden", "true");
    art.removeAttribute("role");
    art.removeAttribute("aria-label");
    avatar.onclick = () => (current?.bubble ? hideBubble() : send({ type: "tuck-click" }));
    const bubble = el("div", { className: "bubble", hidden: true, role: "status", ariaLive: "polite" });
    // Site shortcuts (YouTube's k, Gmail's c) must not fire while typing to Tuck.
    for (const type of ["keydown", "keyup", "keypress"]) bubble.addEventListener(type, (e) => e.stopPropagation());
    shadow.append(el("style", { textContent: css + STYLE }), el("div", { className: "dock" }, avatar, bubble));
    document.documentElement.append(host);
    root = shadow;
    return root;
  }

  const dock = () => root.querySelector(".dock");
  const art = () => root.querySelector("svg.tuck");

  function setState(state) {
    const svg = art();
    svg.dataset.state = state;
    // Replay the state's entrance even when the state repeats.
    for (const part of svg.querySelectorAll("*"))
      for (const a of part.getAnimations()) if (a.effect?.getTiming().iterations !== Infinity) (a.cancel(), a.play());
  }

  function hideBubble() {
    root.querySelector(".bubble").hidden = true;
    current = { ...current, bubble: null };
  }

  function leave() {
    dock().classList.remove("in");
    current = null;
  }

  function drawBubble(view) {
    const box = root.querySelector(".bubble");
    box.replaceChildren();
    const b = view.bubble;
    if (!b) return (box.hidden = true);
    box.hidden = false;
    box.append(el("p", { className: "text", textContent: b.text }));
    if (b.kind === "nudge") {
      const row = el("div", { className: "row" });
      for (const btn of b.buttons) {
        const button = el("button", {
          className: `b${btn.primary ? " primary" : ""}`,
          textContent: btn.label,
          onclick: () => send({ type: "respond", choice: btn.choice }),
        });
        button.dataset.choice = btn.choice;
        row.append(button);
      }
      box.append(row);
    }
    if (b.kind === "card") {
      if (b.next) box.append(el("p", { className: "next", textContent: `Next: ${b.next}` }));
      box.append(
        el(
          "div",
          { className: "row" },
          el("button", {
            className: "b primary",
            textContent: "Done",
            onclick: () => send({ type: "complete-intent", from: "tuck" }),
          }),
          el("button", { className: "b", textContent: "Change", onclick: () => send({ type: "tuck-change" }) }),
        ),
      );
    }
    if (b.kind === "goal") {
      if (b.pickUp?.length) {
        const pick = el("div", { className: "pick" });
        for (const title of b.pickUp)
          pick.append(
            el("button", {
              className: "b",
              textContent: `Pick up: ${title}`,
              onclick: () => send({ type: "set-intent", title, from: "tuck" }),
            }),
          );
        box.append(pick);
      }
      const goal = el("input", { name: "goal", placeholder: "What's the goal?", required: true, maxLength: 120 });
      const step = el("input", { name: "step", placeholder: "First step (optional)", maxLength: 200 });
      const form = el(
        "form",
        {},
        goal,
        step,
        el(
          "div",
          { className: "row" },
          el("button", { className: "b primary start", type: "submit", textContent: "Start" }),
        ),
      );
      form.onsubmit = (e) => {
        e.preventDefault();
        const title = goal.value.trim();
        if (title.length >= 3) send({ type: "set-intent", title, next: step.value.trim(), from: "tuck" });
      };
      box.append(form);
      setTimeout(() => goal.focus(), 300);
    }
    if (b.dismissable || b.kind === "goal" || b.kind === "card")
      box.append(
        el("button", {
          className: "close",
          ariaLabel: "Close",
          textContent: "×",
          onclick: () => (b.kind === "nudge" ? send({ type: "respond", choice: "dismiss" }) : leave()),
        }),
      );
  }

  function show(view, assets) {
    ensureRoot(assets);
    clearTimeout(leaveTimer);
    clearTimeout(settleTimer);
    current = view;
    setState(view.tuck);
    drawBubble(view);
    requestAnimationFrame(() => dock().classList.add("in"));
    if (view.settle) settleTimer = setTimeout(() => setState(view.settle), 1400);
    if (view.leaveAfterMs) leaveTimer = setTimeout(leave, view.leaveAfterMs);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "tuck-show") show(msg.view, msg.assets);
    else if (msg?.type === "tuck-hide" && root) leave();
  });
})();
