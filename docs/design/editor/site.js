// site.js — ikmal editor marketing site: scroll reveals, the animated hero
// document (three drafts, cycling), and the before/after cycler. No dependencies.
(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // next paint, with a timeout fallback: background/hidden frames never fire rAF,
  // and the animation must not stall there.
  const frame = () => new Promise((r) => {
    let done = false;
    const fin = () => { if (!done) { done = true; r(); } };
    requestAnimationFrame(() => requestAnimationFrame(fin));
    setTimeout(fin, 90);
  });

  /* ---------- scroll reveals ---------- */
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add("in");
    io.unobserve(e.target);
  }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  $$(".reveal, .layer").forEach((n, i) => { n.style.transitionDelay = (n.classList.contains("layer") ? (i % 7) * 90 : 0) + "ms"; io.observe(n); });

  /* ---------- headline: flag the first word, suggest, accept ---------- */
  const h1word = $("#h1-word"), h1pop = $("#h1-pop");
  if (h1word && h1pop) {
    const place = () => {
      const w = h1word.getBoundingClientRect(), host = h1pop.offsetParent.getBoundingClientRect();
      h1pop.style.left = Math.round(w.left - host.left + w.width / 2) + "px";
      h1pop.style.top = Math.round(w.bottom - host.top + 12) + "px";
    };
    if (reduce) {
      h1word.textContent = "Nothing ever";
    } else (async () => {
      place();
      await wait(1500);
      h1word.classList.add("on");
      await wait(700);
      place(); h1pop.classList.add("on");
      await wait(2000);
      const b = $("#h1-apply");
      b.classList.add("pressed"); await wait(240); b.classList.remove("pressed");
      h1pop.classList.remove("on");
      await wait(140);
      h1word.textContent = "Nothing ever";
      h1word.classList.remove("on");
    })();
    addEventListener("resize", () => { if (h1pop.classList.contains("on")) place(); });
  }

  /* ---------- hero document ---------- */
  // Each draft is a scene: a fictional writer, a real piece of everyday writing,
  // and the three things ikmal editor would say about it.
  // Each draft is a scene: a fictional writer, a real piece of everyday writing,
  // and what ikmal editor would say about it. Tokens carry the typing performance:
  //   pause  — a beat of thought BEFORE this phrase is typed
  //   slip   — a wrong word typed first, noticed, and backspaced out
  const DRAFTS = [
    {
      title: "Notice to residents",
      scene: "Priya Raman · building manager, Ashford Court",
      tokens: [
        { t: "Dear residents, we are writing " },
        { t: "in order to", id: "a", fix: "to" },
        { t: " let you know that the lift in the north stair will be out of service from Monday " },
        { t: "the 14th", pause: 900, slip: "the 4th" },
        { t: " while the motor is replaced. " },
        { t: "At this point in time", id: "b", pause: 1100, fix: "Right now" },
        { t: ", the contractor " },
        { t: "believe", id: "c", fix: "believes" },
        { t: " the work will take three days, though we have asked them to allow for four. " },
        { t: "Ground-floor neighbours have kindly offered to take deliveries in the meantime.", pause: 1300 },
      ],
      sugs: [
        { id: "a", kind: "", src: "Conciseness", by: "ikmal", note: "Three words doing one word's work.", from: "in order to", to: "to" },
        { id: "b", kind: "s", src: "Plain English", by: "ikmal", note: "A padded way of saying “now”.", from: "At this point in time", to: "Right now" },
        { id: "c", kind: "g", src: "Grammar", by: "engine", note: "“The contractor” takes a singular verb.", from: "believe", to: "believes" },
      ],
    },
    {
      title: "Grant application, section 3",
      scene: "Tom Okafor · Southside Food Project",
      tokens: [
        { t: "Our kitchen " },
        { t: "has the ability to", id: "a", fix: "can" },
        { t: " feed forty families a week, and last winter we served " },
        { t: "eleven hundred meals", pause: 950, slip: "eleven thosuand" },
        { t: " between November and February. " },
        { t: "Due to the fact that", id: "b", pause: 1200, fix: "Because" },
        { t: " demand has kept rising every month since, we are asking for a " },
        { t: "fairly modest", id: "c", fix: "small" },
        { t: " increase to cover a second delivery van. " },
        { t: "Every pound goes to food and fuel; none of it goes to salaries.", pause: 1400 },
      ],
      sugs: [
        { id: "a", kind: "", src: "Conciseness", by: "ikmal", note: "“Has the ability to” is almost always “can”.", from: "has the ability to", to: "can" },
        { id: "b", kind: "s", src: "Plain English", by: "ikmal", note: "Four words for one conjunction.", from: "Due to the fact that", to: "Because" },
        { id: "c", kind: "g", src: "Hedging", by: "your guide", note: "Two softeners stacked. Give the number instead.", from: "fairly modest", to: "small" },
      ],
    },
    {
      title: "Wedding toast, second attempt",
      scene: "Ellen Whitmore · maid of honour",
      tokens: [
        { t: "I have known Sam for " },
        { t: "the better part of", id: "a", fix: "nearly" },
        { t: " two decades, since we shared a " },
        { t: "damp flat", pause: 1000, slip: "damp flatt" },
        { t: " above a chip shop in Leeds, and " },
        { t: "in all that time", id: "b", pause: 1150, fix: "in all those years" },
        { t: " he has never once been on time to anything. " },
        { t: "He was late to his own birthday. He was late to this rehearsal. " },
        { t: "It is my belief that", id: "c", pause: 1250, fix: "I think" },
        { t: " Maya is the first thing he has ever been early for.", pause: 700 },
      ],
      sugs: [
        { id: "a", kind: "", src: "Conciseness", by: "ikmal", note: "Four words where one will do.", from: "the better part of", to: "nearly" },
        { id: "b", kind: "s", src: "Repetition", by: "quality", note: "“time” lands three times in four lines.", from: "in all that time", to: "in all those years" },
        { id: "c", kind: "g", src: "Plain English", by: "ikmal", note: "Say it in the first person.", from: "It is my belief that", to: "I think" },
      ],
    },
  ];
  const KIND = { "": "concise", s: "style", g: "grammar" };

  const para = $("#dw-para"), list = $("#dw-list"), count = $("#dw-count"),
    title = $("#dw-title"), scene = $("#dw-scene"), hint = $("#dw-hint"),
    copyBtn = $("#dw-copy"), checkBtn = $("#dw-check"), meta = $("#dw-meta");

  if (para && list) {
    let tokens = [], cards = {};

    function mount(draft) {
      title.textContent = draft.title;
      scene.textContent = draft.scene;
      list.innerHTML = draft.sugs.map((s) => `<div class="sug terrace ${s.kind} reset" data-id="${s.id}">
  <div class="sug-top"><span class="sug-src">${s.src}</span><em>${s.by}</em></div>
  <p>${s.note}</p>
  <div class="swap"><del>${s.from}</del><span>→</span><ins>${s.to}</ins></div>
  <div class="sug-act"><button class="cnt-btn is-primary">Apply</button><button class="cnt-btn is-ghost">Ignore</button></div>
</div>`).join("");
      cards = {};
      $$(".sug", list).forEach((c) => { cards[c.dataset.id] = c; });
      tokens = draft.tokens.map((t) => ({ ...t }));
    }

    function render(chars, opts = {}) {
      let left = chars == null ? Infinity : chars, html = "";
      for (const tk of tokens) {
        if (left <= 0) break;
        const slice = tk.t.slice(0, Math.min(tk.t.length, left));
        left -= slice.length;
        html += tk.id
          ? `<span class="flag ${KIND[cardKind(tk.id)]}${opts.flagsOn ? "" : " off"}${opts.hot === tk.id ? " hot" : ""}">${slice}</span>`
          : slice;
      }
      para.innerHTML = html + (opts.tail || "") + (opts.caret ? `<span class="demo-caret"></span>` : "");
    }
    const cardKind = (id) => (cards[id] ? (cards[id].classList.contains("s") ? "s" : cards[id].classList.contains("g") ? "g" : "") : "");
    const total = () => tokens.reduce((n, t) => n + t.t.length, 0);
    const setCount = (n) => { count.textContent = n; };
    const rnd = (a, b) => a + Math.random() * (b - a);

    // Typing performance. Keystrokes vary; punctuation gets a beat; phrases the
    // writer has to think about get a longer one; and once per draft a wrong word
    // is typed, noticed a moment later, and backspaced out.
    async function type() {
      let done = 0;                       // characters already committed
      for (const tk of tokens) {
        if (tk.pause) await wait(tk.pause * rnd(0.85, 1.15));
        if (tk.slip) {
          let tail = "";
          for (const ch of tk.slip) {
            tail += ch;
            render(done, { caret: true, tail });
            await wait(keystroke(ch));
          }
          await wait(rnd(420, 720));      // the beat where you see it
          while (tail.length) {
            tail = tail.slice(0, -1);
            render(done, { caret: true, tail });
            await wait(rnd(26, 46));
          }
          await wait(rnd(160, 300));
        }
        let sinceBreak = 0;
        for (let i = 1; i <= tk.t.length; i++) {
          render(done + i, { caret: true });
          const ch = tk.t[i - 1];
          let d = keystroke(ch);
          if (ch === " ") { sinceBreak++; if (sinceBreak > 6 && Math.random() < 0.3) { d = rnd(300, 620); sinceBreak = 0; } }
          await wait(d);
        }
        done += tk.t.length;
      }
    }
    function keystroke(ch) {
      if (ch === "," || ch === ";") return rnd(190, 300);
      if (ch === "." || ch === "?" || ch === "!") return rnd(330, 520);
      if (ch === " ") return rnd(38, 96);
      return rnd(28, 62);
    }

    let n = 0;
    async function run() {
      const draft = DRAFTS[n % DRAFTS.length];
      mount(draft);                       // cards mounted with .reset: hidden, no transition
      setCount(0);
      hint.classList.remove("on");
      meta.textContent = "Scratch pad · nothing is saved";
      render(0, { caret: true });
      await frame();
      $$(".sug", list).forEach((c) => c.classList.remove("reset"));
      await wait(1100);

      await type();
      await wait(700);

      checkBtn.classList.add("pressed"); await wait(240); checkBtn.classList.remove("pressed");
      await wait(500);

      render(null, { flagsOn: true, caret: true });
      const ids = draft.sugs.map((s) => s.id);
      for (let i = 0; i < ids.length; i++) { cards[ids[i]].classList.add("in"); setCount(i + 1); await wait(520); }
      meta.textContent = ids.length + " suggestions · checked on this computer";
      await wait(2100);

      const first = ids[0];
      render(null, { flagsOn: true, caret: true, hot: first });
      cards[first].classList.add("hot");
      await wait(1600);

      const btn = $(".cnt-btn.is-primary", cards[first]);
      btn.classList.add("pressed"); await wait(240); btn.classList.remove("pressed");

      const tk = tokens.find((x) => x.id === first);
      tk.t = tk.fix; delete tk.id;
      render(null, { flagsOn: true, caret: true });
      cards[first].classList.remove("hot");
      cards[first].classList.add("out");
      setCount(ids.length - 1);
      await wait(420);
      cards[first].style.maxHeight = cards[first].scrollHeight + "px";
      cards[first].classList.add("gone");   // collapses, so the rest move up
      await frame();
      cards[first].style.maxHeight = "0px";
      await wait(1900);

      // the point of the scratch pad: take the text back out again
      copyBtn.classList.add("pressed"); await wait(240); copyBtn.classList.remove("pressed");
      hint.classList.add("on");
      meta.textContent = "Corrected text on the clipboard · paste it back";
      await wait(3400);

      n++;
      run();
    }

    if (reduce) {
      mount(DRAFTS[0]);
      $$(".sug", list).forEach((c) => { c.classList.remove("reset"); c.classList.add("in"); });
      render(null, { flagsOn: true });
      setCount(3);
    } else run();
  }

  /* ---------- before / after cycler ---------- */
  const PAIRS = [
    { src: "Conciseness", before: ["We will ", "make an attempt to", " reply by Friday."], after: "We will try to reply by Friday." },
    { src: "Plain English", before: ["Please ", "utilise the attached form", " for your request."], after: "Please use the attached form for your request." },
    { src: "Style · your guide", before: ["The launch was ", "very much a success", "."], after: "The launch succeeded." },
    { src: "Repetition", before: ["The report reports on ", "reporting", " standards."], after: "The report covers reporting standards." },
  ];
  const ba = $("#ba");
  if (ba) {
    const src = $(".ba-src", ba), before = $(".ba-before", ba), after = $(".ba-after", ba), dots = $(".ba-dots", ba);
    PAIRS.forEach(() => dots.insertAdjacentHTML("beforeend", "<i></i>"));
    let i = 0;
    function paint() {
      const p = PAIRS[i];
      src.textContent = p.src;
      before.innerHTML = p.before[0] + `<span>${p.before[1]}</span>` + p.before[2];
      after.innerHTML = `<span>${p.after}</span>`;
      $$("i", dots).forEach((d, k) => d.classList.toggle("on", k === i));
    }
    paint();
    if (!reduce) setInterval(() => {
      ba.classList.add("swapping");
      setTimeout(() => { i = (i + 1) % PAIRS.length; paint(); ba.classList.remove("swapping"); }, 620);
    }, 6400);
  }

  /* ---------- copy buttons ---------- */
  $$("[data-copy]").forEach((b) => b.addEventListener("click", () => {
    navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy);
    const t = b.textContent; b.textContent = "Copied";
    setTimeout(() => { b.textContent = t; }, 1500);
  }));
})();
