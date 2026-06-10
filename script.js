/* =================================================================
   LOGICA CONDIVISA  (index.html + project.html)
   ================================================================= */

/* ---------- Stato (lingua + tema), salvato nel browser ---------- */
const store = {
  get lang() { return localStorage.getItem("ec_lang") || "en"; },
  set lang(v) { localStorage.setItem("ec_lang", v); },
  get theme() { return localStorage.getItem("ec_theme") || "dark"; },
  set theme(v) { localStorage.setItem("ec_theme", v); }
};

/* ---------- Miniatura di anteprima di un progetto ---------- */
function thumbFor(p) {
  if (p.videoId) return `https://img.youtube.com/vi/${p.videoId}/hqdefault.jpg`;
  return p.image || "";
}
function thumbFallback(img, p) {
  // se maxres/hqdefault non c'è, prova un formato sempre presente
  if (p.videoId) img.src = `https://img.youtube.com/vi/${p.videoId}/0.jpg`;
}

/* ---------- Traduzioni dell'interfaccia ---------- */
function applyStaticTranslations(lang) {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (dict[key] != null) el.innerHTML = dict[key];
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(el => {
    const key = el.getAttribute("data-i18n-ph");
    if (dict[key] != null) el.setAttribute("placeholder", dict[key]);
  });
  document.documentElement.lang = lang;
  // stato dei pulsanti lingua
  document.querySelectorAll(".lang-toggle button").forEach(b => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });
}

/* ---------- Tema ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = document.querySelector("#themeBtn i");
  if (icon) icon.className = theme === "dark" ? "fas fa-moon" : "fas fa-sun";
}

/* =================================================================
   HOME — griglia progetti
   ================================================================= */
let cardRefs = []; // { el, project } per aggiornare i testi al cambio lingua
let sortAsc = false;

function buildCard(p, index) {
  const lang = store.lang;
  const t = p[lang] || p.en;
  const year = p.date ? p.date.slice(0, 4) : "";

  const card = document.createElement("article");
  card.className = "card reveal project-item";
  card.dataset.name = p.id;
  card.dataset.title = t.title.toLowerCase();
  card.dataset.engine = p.engine;
  card.dataset.date = p.date;

  card.innerHTML = `
    <div class="card-media">
      <img loading="lazy" alt="${t.title}" src="${thumbFor(p)}">
    </div>
    <div class="card-body">
      <div class="card-engine">${p.engine === "unreal" ? "Unreal" : "Unity"} · ${year}</div>
      <h3>${t.title}</h3>
      <p class="card-short">${t.short}</p>
      <div class="tech-row">${p.tech.map(x => `<span class="tech">${x}</span>`).join("")}</div>
      <div class="card-foot">
        <a class="see-more stretched" href="project.html?id=${p.id}">
          <span class="sm-label">${(TRANSLATIONS[lang] || TRANSLATIONS.en)["card.see_more"]}</span>
          <i class="fas fa-arrow-right"></i>
        </a>
        <a class="gh" href="${p.github}" target="_blank" rel="noopener" aria-label="GitHub"><i class="fab fa-github"></i></a>
      </div>
    </div>`;

  const img = card.querySelector("img");
  img.addEventListener("error", () => thumbFallback(img, p), { once: true });

  cardRefs.push({ el: card, project: p });
  return card;
}

function buildWipCard() {
  const lang = store.lang;
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  const card = document.createElement("article");
  card.className = "card card-wip reveal";
  card.innerHTML = `
    <i class="fas fa-hammer" aria-hidden="true"></i>
    <h3 data-i18n="card.wip_title">${dict["card.wip_title"]}</h3>
    <span class="mono" style="color:var(--text-faint);font-size:.78rem" data-i18n="card.wip_sub">${dict["card.wip_sub"]}</span>`;
  return card;
}

function renderCards() {
  const grid = document.getElementById("project-grid");
  if (!grid) return;
  cardRefs = [];
  grid.innerHTML = "";

  // ordina i dati secondo lo stato corrente
  const ordered = [...PROJECTS].sort((a, b) => {
    const d = parseInt(a.date) - parseInt(b.date);
    return sortAsc ? d : -d;
  });
  ordered.forEach((p, i) => grid.appendChild(buildCard(p, i)));
  grid.appendChild(buildWipCard());

  applyFilters();
  observeReveals();
}

function applyFilters() {
  const search = (document.getElementById("searchInput")?.value || "").toLowerCase();
  const engine = document.getElementById("engineFilter")?.value || "all";
  let visible = 0;

  cardRefs.forEach(({ el, project }) => {
    const t = project[store.lang] || project.en;
    const matchesSearch = t.title.toLowerCase().includes(search) || project.id.includes(search);
    const matchesEngine = engine === "all" || project.engine === engine;
    const show = matchesSearch && matchesEngine;
    el.style.display = show ? "" : "none";
    if (show) visible++;
  });

  // messaggio "nessun risultato"
  const grid = document.getElementById("project-grid");
  let empty = document.getElementById("emptyMsg");
  if (visible === 0) {
    if (!empty) {
      empty = document.createElement("p");
      empty.id = "emptyMsg";
      empty.className = "empty-msg";
      grid.appendChild(empty);
    }
    empty.textContent = (TRANSLATIONS[store.lang] || TRANSLATIONS.en)["card.empty"];
  } else if (empty) {
    empty.remove();
  }
}

/* aggiorna i testi delle card quando si cambia lingua, senza perdere ordine/filtro */
function refreshCardTexts() {
  const dict = TRANSLATIONS[store.lang] || TRANSLATIONS.en;
  cardRefs.forEach(({ el, project }) => {
    const t = project[store.lang] || project.en;
    el.querySelector("h3").textContent = t.title;
    el.querySelector(".card-short").textContent = t.short;
    el.querySelector(".sm-label").textContent = dict["card.see_more"];
    el.dataset.title = t.title.toLowerCase();
  });
  applyFilters();
}

/* =================================================================
   PROJECT.HTML — pagina dettaglio
   ================================================================= */
function getProjectFromUrl() {
  const id = new URLSearchParams(location.search).get("id");
  return PROJECTS.find(p => p.id === id) || null;
}

function renderDetail() {
  const p = getProjectFromUrl();
  const lang = store.lang;
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;

  if (!p) {
    const root = document.getElementById("detail-root");
    if (root) root.innerHTML =
      `<p class="empty-msg">${dict["detail.notfound"]}</p>
       <p style="text-align:center"><a class="btn btn-primary" href="index.html">${dict["detail.notfound_back"]}</a></p>`;
    return;
  }

  const t = p[lang] || p.en;
  document.title = `${t.title} — Edoardo Cremente`;

  // media: video se c'è, altrimenti immagine
  const media = document.getElementById("detail-media");
  if (p.videoId) {
    media.innerHTML = `<iframe src="https://www.youtube.com/embed/${p.videoId}?rel=0"
      title="${t.title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  } else if (p.image) {
    media.innerHTML = `<img src="${p.image}" alt="${t.title}">`;
  } else {
    media.style.display = "none";
  }

  document.getElementById("detail-engine").textContent =
    `${p.engine === "unreal" ? "Unreal Engine" : "Unity"} · ${p.date.slice(0, 4)}`;
  document.getElementById("detail-title").textContent = t.title;
  document.getElementById("detail-tech").innerHTML =
    p.tech.map(x => `<span class="tech">${x}</span>`).join("");

  // "Di cosa mi sono occupato": accetta sia stringa che array di paragrafi
  const workedEl = document.getElementById("detail-worked");
  workedEl.innerHTML = (Array.isArray(t.worked) ? t.worked : [t.worked])
    .filter(s => s && String(s).trim())
    .map(s => `<p>${s}</p>`).join("");

  // "La storia": salta i paragrafi vuoti e nasconde l'intestazione se non c'è testo
  const story = (Array.isArray(t.long) ? t.long : [t.long]).filter(s => s && String(s).trim());
  document.getElementById("detail-story").innerHTML = story.map(par => `<p>${par}</p>`).join("");
  const storyH = document.querySelector('#detail-root [data-i18n="detail.story_h"]');
  if (storyH) storyH.style.display = story.length ? "" : "none";

  // Showcase opzionale (clip dimostrative per ogni feature)
  buildShowcase(p, lang, dict);

  document.getElementById("info-engine-val").textContent = p.engine === "unreal" ? "Unreal" : "Unity";
  document.getElementById("info-time-val").textContent = t.devtime;
  document.getElementById("info-year-val").textContent = p.date.slice(0, 4);

  const gh = document.getElementById("detail-github");
  gh.href = p.github;

  const dl = document.getElementById("detail-download");
  dl.href = p.download.url;
  dl.querySelector(".dl-label").textContent = p.download[lang] || p.download.en;

  const gp = document.getElementById("detail-gameplay");
  if (p.gameplay) { gp.href = p.gameplay; gp.style.display = ""; }
  else { gp.style.display = "none"; }

  observeReveals();
}

/* =================================================================
   SHOWCASE — clip dimostrative per le feature (opzionale)
   -----------------------------------------------------------------
   Si attiva solo se il progetto ha un array "showcase" in data.js.
   Ogni voce: { type, media, poster?, en:{title,desc}, it:{title,desc} }
     type  : "video" (consigliato) | "image" | "gif" | "youtube"
     media : percorso del file (.mp4/.webm/.gif) oppure, per youtube, l'ID
   Finché il file non esiste, mostra un placeholder ordinato; appena
   il file è presente al percorso indicato, la clip compare da sola.
   I video partono da soli SOLO quando entrano nello schermo (e si
   fermano quando escono), sono muti e in loop. Con "reduce motion"
   attivo mostrano invece i controlli e non partono in automatico.
   ================================================================= */
let showcaseObserver = null;

function observeShowcaseVideo(video) {
  if (!("IntersectionObserver" in window)) { video.setAttribute("autoplay", ""); return; }
  if (!showcaseObserver) {
    showcaseObserver = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { const pr = e.target.play && e.target.play(); if (pr) pr.catch(() => {}); }
        else if (e.target.pause) e.target.pause();
      });
    }, { threshold: 0.35 });
  }
  showcaseObserver.observe(video);
}

function buildShowcase(p, lang, dict) {
  const host = document.getElementById("detail-showcase");
  if (!host) return;
  host.innerHTML = "";
  const items = Array.isArray(p.showcase) ? p.showcase : [];
  if (!items.length) { host.style.display = "none"; return; }
  host.style.display = "";

  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const head = document.createElement("h3");
  head.className = "showcase-head";
  head.textContent = dict["detail.showcase_h"];
  host.appendChild(head);

  items.forEach(item => {
    const tx = item[lang] || item.en || {};
    const wrap = document.createElement("div");
    wrap.className = "showcase-item reveal";

    const cap = document.createElement("div");
    cap.className = "showcase-cap";
    cap.innerHTML = `<h4>${tx.title || ""}</h4>${tx.desc ? `<p>${tx.desc}</p>` : ""}`;
    wrap.appendChild(cap);

    const box = document.createElement("div");
    box.className = "showcase-media";

    const showPlaceholder = () => {
      box.classList.add("is-empty");
      box.innerHTML =
        `<div class="showcase-ph">
           <i class="fas fa-clapperboard" aria-hidden="true"></i>
           <span class="mono">${dict["showcase.soon"]}</span>
         </div>`;
    };

    const type = item.type || "video";
    const src = item.media || "";

    if (!src) {
      showPlaceholder();
    } else if (type === "youtube") {
      box.innerHTML =
        `<iframe src="https://www.youtube.com/embed/${src}?rel=0" title="${tx.title || ""}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
    } else if (type === "gif" || type === "image") {
      const img = document.createElement("img");
      img.loading = "lazy"; img.alt = tx.title || ""; img.src = src;
      img.addEventListener("error", showPlaceholder, { once: true });
      box.appendChild(img);
    } else { // video
      let settled = false;
      const fail = () => { if (!settled) { settled = true; showPlaceholder(); } };
      const v = document.createElement("video");
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = "metadata";
      if (item.poster) v.poster = item.poster;
      if (reduce) v.controls = true;
      const s = document.createElement("source");
      s.src = src;
      s.type = src.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4";
      v.appendChild(s);
      v.addEventListener("loadeddata", () => { settled = true; }, { once: true });
      v.addEventListener("error", fail, { once: true });
      s.addEventListener("error", fail, { once: true });
      box.appendChild(v);
      if (!reduce) observeShowcaseVideo(v);
    }

    wrap.appendChild(box);
    host.appendChild(wrap);
  });
}

/* =================================================================
   Lingua / tema — applica e aggiorna tutto
   ================================================================= */
function setLang(lang) {
  store.lang = lang;
  applyStaticTranslations(lang);
  if (document.getElementById("project-grid")) refreshCardTexts();
  if (document.body.dataset.page === "detail") renderDetail();
}

function setTheme(theme) {
  store.theme = theme;
  applyTheme(theme);
}

/* ---------- Reveal on scroll ---------- */
let revealObserver = null;
function observeReveals() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal").forEach(el => el.classList.add("in"));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          e.target.style.transitionDelay = (Math.min(i, 4) * 60) + "ms";
          e.target.classList.add("in");
          revealObserver.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  }
  document.querySelectorAll(".reveal:not(.in)").forEach(el => revealObserver.observe(el));
}

/* =================================================================
   Avvio
   ================================================================= */
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(store.theme);
  applyStaticTranslations(store.lang);

  // controlli navbar
  document.querySelectorAll(".lang-toggle button").forEach(b => {
    b.addEventListener("click", () => setLang(b.dataset.lang));
  });
  const themeBtn = document.getElementById("themeBtn");
  if (themeBtn) themeBtn.addEventListener("click", () =>
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"));

  const navToggle = document.getElementById("navToggle");
  if (navToggle) navToggle.addEventListener("click", () =>
    document.querySelector(".nav").classList.toggle("open"));
  document.querySelectorAll(".nav-links a").forEach(a =>
    a.addEventListener("click", () => document.querySelector(".nav").classList.remove("open")));

  // home
  if (document.getElementById("project-grid")) {
    renderCards();
    document.getElementById("searchInput")?.addEventListener("input", applyFilters);
    document.getElementById("engineFilter")?.addEventListener("change", applyFilters);
    document.getElementById("sortDateBtn")?.addEventListener("click", () => {
      sortAsc = !sortAsc;
      renderCards();
    });
  }

  // dettaglio
  if (document.body.dataset.page === "detail") renderDetail();

  observeReveals();
});
