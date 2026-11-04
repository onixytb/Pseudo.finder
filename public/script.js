const $ = id => document.getElementById(id);
const home = $("home"), workspace = $("workspace");
const PLAN_RANK = { free: 0, pro: 1, ultimate: 2, owner: 3 };

const toolList = [
  { id:"pseudo", title:"PSEUDO.FINDER", desc:"Recherche des profils publics sur plusieurs plateformes.", icon:"⌕", min:"free", type:"search", mode:"pseudo" },
  { id:"general", title:"GENERAL SEARCH", desc:"Recherche générale sur le web et des sites publics.", icon:"◎", min:"free", type:"search", mode:"general" },
  { id:"osint", title:"OSINT.FINDER", desc:"Recherche des publications et sources publiques, sans données privées.", icon:"⌘", min:"free", type:"search", mode:"osint" },
  { id:"ip", title:"IP.LOOKUP", desc:"Affiche l'adresse IP publique de ta connexion.", icon:"⌗", min:"free", type:"ip" },
  { id:"url", title:"URL.ANALYZER", desc:"Examine la structure d'une URL sans ouvrir le site.", icon:"↗", min:"free", type:"url" },
  { id:"domain", title:"DOMAIN.FINDER", desc:"Consulte les enregistrements DNS publics.", icon:"🌐", min:"free", type:"domain" },
  { id:"network", title:"NETWORK.FINDER", desc:"Sélection Bluetooth avec l'autorisation du navigateur.", icon:"⌁", min:"free", type:"network" },
  { id:"history", title:"HISTORY", desc:"Retrouve tes recherches récentes.", icon:"◷", min:"free", type:"history" },
  { id:"favorites", title:"FAVORITES", desc:"Enregistre les résultats utiles.", icon:"☆", min:"pro", type:"favorites" },
  { id:"sitecheck", title:"SITE.CHECK", desc:"Contrôles locaux simples d'une adresse web.", icon:"✓", min:"pro", type:"sitecheck" },
  { id:"footprint", title:"DIGITAL.FOOTPRINT", desc:"Recherche ton propre pseudo dans les sources publiques.", icon:"◉", min:"ultimate", type:"search", mode:"pseudo" },
  { id:"usernamehistory", title:"USERNAME.HISTORY", desc:"Recherche des pages publiques indexées autour d'un pseudo.", icon:"⌁", min:"ultimate", type:"search", mode:"pseudo" },
  { id:"qr", title:"QR.GENERATOR", desc:"Crée un QR code à partir d'un texte ou d'un lien.", icon:"▦", min:"ultimate", type:"qr" },
  { id:"metadata", title:"IMAGE.METADATA", desc:"Examine les métadonnées disponibles dans une image locale.", icon:"▧", min:"ultimate", type:"metadata" },
  { id:"security", title:"SECURITY.CHECK", desc:"Vérifications de base sur la structure d'un lien.", icon:"⬡", min:"ultimate", type:"sitecheck" }
];

let historyItems = load("pf_history", []);
let favorites = load("pf_favorites", []);
let lastResults = [];
let currentTool = null;

function load(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function rank(plan) {
  return PLAN_RANK[plan] ?? 0;
}

function canUse(minPlan) {
  return rank(window.currentPlan || "free") >= rank(minPlan);
}

function renderPlan() {
  const plan = window.currentPlan || "free";

  $("homePlan").textContent = plan.toUpperCase();
  $("dashPlanText").textContent = plan.toUpperCase() + " — fonctionnalités disponibles selon ton accès";
  $("freeCurrent").textContent = plan === "free" ? "TON FORFAIT ACTUEL" : "OFFRE GRATUITE";

  updateDashboard();
  renderTools();
}

window.renderPlan = renderPlan;
window.currentPlan = "free";

function renderTools() {
  $("toolGrid").innerHTML = "";

  toolList.forEach(tool => {
    const unlocked = canUse(tool.min);
    const button = document.createElement("button");

    button.className = "tool" + (unlocked ? "" : " locked");
    button.innerHTML = `<span class="tool-icon"></span><strong></strong><small></small><span class="tool-arrow">${unlocked ? "↗" : "🔒"}</span>`;

    button.querySelector(".tool-icon").textContent = tool.icon;
    button.querySelector("strong").textContent = tool.title;
    button.querySelector("small").textContent = tool.desc;

    if (!unlocked) {
      const lock = document.createElement("span");
      lock.className = "lock-label";
      lock.textContent = tool.min.toUpperCase();
      button.appendChild(lock);
    }

    button.addEventListener("click", () => openTool(tool.id));
    $("toolGrid").appendChild(button);
  });
}

function updateDashboard() {
  $("homeSearchCount").textContent = historyItems.length;
  $("homeFavorites").textContent = favorites.length;
  $("dashSearches").textContent = historyItems.length;
  $("dashFavorites").textContent = favorites.length;

  $("dashLast").textContent = historyItems[0]
    ? new Date(historyItems[0].time).toLocaleDateString("fr-FR")
    : "—";
}

function addHistory(type, value, count) {
  historyItems.unshift({
    type,
    value,
    count,
    time: Date.now()
  });

  const max = canUse("pro") ? 10000 : 20;

  historyItems = historyItems.slice(0, max);

  save("pf_history", historyItems);
  updateDashboard();
}

function openTool(id) {
  const tool = toolList.find(t => t.id === id);

  if (!tool) return;

  if (!canUse(tool.min)) {
    alert("Cet outil nécessite le forfait " + tool.min.toUpperCase() + ". Consulte les abonnements.");
    location.hash = "plans";
    return;
  }

  currentTool = tool;

  home.classList.add("hidden");
  workspace.classList.remove("hidden");

  $("pageTitle").textContent = tool.title;
  $("pageDescription").textContent = tool.desc;
  $("toolAccess").textContent = "ACCÈS " + (window.currentPlan || "free").toUpperCase();

  [
    "searchForm",
    "domainForm",
    "urlForm",
    "ipPanel",
    "bluetoothPanel",
    "qrPanel",
    "imagePanel",
    "favoritesPanel",
    "historyPanel",
    "output"
  ].forEach(id => $(id).classList.add("hidden"));

  if (tool.type === "search") {
    $("searchForm").classList.remove("hidden");
    $("nameFields").classList.toggle("hidden", tool.mode !== "osint");
    $("query").classList.toggle("hidden", tool.mode === "osint");

    $("query").placeholder =
      tool.mode === "pseudo"
        ? "Entre un pseudo..."
        : "Entre ta recherche...";

  } else if (tool.type === "domain") {
    $("domainForm").classList.remove("hidden");

  } else if (tool.type === "url" || tool.type === "sitecheck") {
    $("urlForm").classList.remove("hidden");

    $("urlBtn").textContent =
      tool.type === "sitecheck"
        ? "VÉRIFIER LE SITE"
        : "ANALYSER LE LIEN";

  } else if (tool.type === "ip") {
    $("ipPanel").classList.remove("hidden");

  } else if (tool.type === "network") {
    $("bluetoothPanel").classList.remove("hidden");

  } else if (tool.type === "qr") {
    $("qrPanel").classList.remove("hidden");

  } else if (tool.type === "metadata") {
    $("imagePanel").classList.remove("hidden");

  } else if (tool.type === "history") {
    $("historyPanel").classList.remove("hidden");
    displayHistory();

  } else if (tool.type === "favorites") {
    $("favoritesPanel").classList.remove("hidden");
    displayFavorites();
  }

  if (["search", "domain", "url", "sitecheck"].includes(tool.type)) {
    $("output").classList.remove("hidden");
    $("results").innerHTML = "";
    $("status").textContent = "";
    $("resultFilter").value = "";
  }
}

function goHome() {
  workspace.classList.add("hidden");
  home.classList.remove("hidden");
  currentTool = null;
  updateDashboard();
}

$("logoHome").addEventListener("click", e => {
  e.preventDefault();
  goHome();
});

$("back").addEventListener("click", goHome);

document.querySelectorAll("[data-open]").forEach(b => {
  b.addEventListener("click", () => openTool(b.dataset.open));
});

function displayHistory() {
  const list = $("historyList");
  list.innerHTML = "";

  if (!historyItems.length) {
    list.textContent = "Aucune recherche enregistrée.";
    return;
  }

  historyItems.forEach(item => {
    const row = document.createElement("div");
    row.className = "history-item";

    const info = document.createElement("div");

    const strong = document.createElement("strong");
    strong.textContent = item.type + " — " + item.value;

    const small = document.createElement("small");
    small.textContent =
      new Date(item.time).toLocaleString("fr-FR") +
      " · " +
      item.count +
      " résultat(s)";

    info.append(strong, small);
    row.append(info);
    list.appendChild(row);
  });
}

function displayFavorites() {
  const list = $("favoritesList");
  list.innerHTML = "";

  if (!favorites.length) {
    list.textContent = "Aucun favori pour le moment.";
    return;
  }

  favorites.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "history-item";

    const info = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent = item.title;

    const small = document.createElement("small");
    small.textContent = item.url || item.description || "";

    info.append(title, small);

    const remove = document.createElement("button");
    remove.textContent = "RETIRER";

    remove.addEventListener("click", () => {
      favorites.splice(index, 1);
      save("pf_favorites", favorites);
      displayFavorites();
      updateDashboard();
    });

    row.append(info, remove);
    list.appendChild(row);
  });
}

$("clearHistory").addEventListener("click", () => {
  if (!confirm("Effacer l'historique ?")) return;

  historyItems = [];
  save("pf_history", historyItems);
  displayHistory();
  updateDashboard();
});

$("clearFavorites").addEventListener("click", () => {
  if (!confirm("Effacer les favoris ?")) return;

  favorites = [];
  save("pf_favorites", favorites);
  displayFavorites();
  updateDashboard();
});

async function apiFetch(url, body) {
  const token = window.getAccessToken
    ? await window.getAccessToken()
    : null;

  if (!token) {
    throw new Error("Connecte-toi à ton compte pour utiliser les recherches.");
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token
    },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Erreur de recherche.");
  }

  return data;
}

$("runSearch").addEventListener("click", async () => {
  const mode = currentTool?.mode;

  if (!mode) return;

  const body = { mode };

  if (mode === "osint") {
    body.first = $("firstName").value.trim();
    body.last = $("lastName").value.trim();

    if (!body.first || !body.last) {
      $("status").textContent = "Entre un nom et un prénom.";
      return;
    }
  } else {
    body.query = $("query").value.trim();

    if (body.query.length < 2) {
      $("status").textContent = "Recherche trop courte.";
      return;
    }
  }

  const button = $("runSearch");
  button.disabled = true;
  button.textContent = "RECHERCHE EN COURS...";

  $("results").innerHTML = "";
  $("status").textContent = "Recherche des sources publiques...";

  try {
    const data = await apiFetch(
      mode === "osint" ? "/api/osint" : "/api/search",
      body
    );

    const groups =
      mode === "osint"
        ? (data.groups || [])
        : (data.platforms || []);

    displayGroups(groups);

    const count = groups.reduce(
      (n, g) => n + (g.results || []).length,
      0
    );

    addHistory(
      currentTool.title,
      mode === "osint"
        ? body.first + " " + body.last
        : body.query,
      count
    );

    $("status").textContent = count + " résultat(s) trouvé(s).";

  } catch (e) {
    $("status").textContent = e.message;

  } finally {
    button.disabled = false;
    button.textContent = "LANCER LA RECHERCHE ↗";
  }
});

function displayGroups(groups) {
  lastResults = [];
  $("results").innerHTML = "";

  groups.forEach(group => {
    const card = document.createElement("article");
    card.className = "result-card";

    const heading = document.createElement("h3");
    heading.textContent = group.category || group.name || "Résultats";

    card.appendChild(heading);

    if (group.error) {
      const p = document.createElement("p");
      p.textContent = group.error;
      card.appendChild(p);
    }

    (group.results || []).forEach(item => {
      lastResults.push({
        ...item,
        group: heading.textContent
      });

      const title = document.createElement("h3");
      title.textContent = item.title || "Résultat sans titre";

      const description = document.createElement("p");
      description.textContent = item.description || "";

      const favorite = document.createElement("button");
      favorite.className = "favorite-button";
      favorite.textContent = "☆ Favori";

      favorite.addEventListener("click", () => addFavorite(item));

      card.append(favorite, title, description);

      if (item.url) {
        const link = document.createElement("a");
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "OUVRIR LA SOURCE ↗";
        card.appendChild(link);
      }
    });

    if (!(group.results || []).length && !group.error) {
      const p = document.createElement("p");
      p.textContent = "Aucun résultat trouvé.";
      card.appendChild(p);
    }

    $("results").appendChild(card);
  });
}

function addFavorite(item) {
  if (!canUse("pro")) {
    return alert("Les favoris nécessitent PRO.");
  }

  if (
    favorites.some(
      f => f.url === item.url && f.title === item.title
    )
  ) {
    return alert("Déjà dans tes favoris.");
  }

  favorites.unshift({
    title: item.title || "Résultat",
    url: item.url || "",
    description: item.description || "",
    time: Date.now()
  });

  save("pf_favorites", favorites);
  updateDashboard();

  alert("Ajouté aux favoris.");
}

$("resultFilter").addEventListener("input", () => {
  const q = $("resultFilter").value.toLowerCase();

  document.querySelectorAll("#results .result-card").forEach(card => {
    card.style.display =
      card.textContent.toLowerCase().includes(q)
        ? ""
        : "none";
  });
});

$("exportPdf").addEventListener("click", () => {
  if (!canUse("pro")) {
    return alert("L'export PDF nécessite PRO.");
  }

  if (!lastResults.length) {
    return alert("Aucun résultat à exporter.");
  }

  if (!window.jspdf?.jsPDF) {
    return alert("Le module PDF n'a pas chargé.");
  }

  const doc = new window.jspdf.jsPDF();
  let y = 18;

  doc.setFontSize(16);
  doc.text("PSEUDO.FINDER — Rapport", 14, y);
  y += 10;

  doc.setFontSize(9);
  doc.text("Généré le " + new Date().toLocaleString("fr-FR"), 14, y);
  y += 10;

  lastResults.forEach((item, i) => {
    const lines = doc.splitTextToSize(
      (i + 1) + ". " +
      (item.title || "Résultat") + "\n" +
      (item.description || "") + "\n" +
      (item.url || ""),
      180
    );

    if (y + lines.length * 5 > 280) {
      doc.addPage();
      y = 18;
    }

    doc.text(lines, 14, y);
    y += lines.length * 5 + 5;
  });

  doc.save("pseudo-finder-rapport.pdf");
});

// DOMAIN.FINDER

$("domainBtn").addEventListener("click", async () => {
  const domain = $("domainInput").value.trim();

  if (!domain) {
    $("status").textContent = "Entre un domaine.";
    return;
  }

  const button = $("domainBtn");
  button.disabled = true;
  $("status").textContent = "Analyse DNS...";

  try {
    const data = await apiFetch("/api/domain", {
      domain,
      advanced: canUse("pro")
    });

    displayGroups(data.groups || []);
    $("status").textContent = "Analyse DNS terminée.";

    addHistory(
      "DOMAIN.FINDER",
      domain,
      (data.groups || []).length
    );

  } catch (e) {
    $("status").textContent = e.message;

  } finally {
    button.disabled = false;
  }
});

// IP.LOOKUP : affiche uniquement ton IP publique

$("ipBtn").addEventListener("click", async () => {
  const b = $("ipBtn");

  b.disabled = true;
  $("myIP").textContent = "Chargement...";

  try {
    const r = await fetch("https://api.ipify.org?format=json");

    if (!r.ok) throw Error();

    const d = await r.json();

    $("myIP").textContent = d.ip;

    addHistory("IP.LOOKUP", "Mon IP publique", 1);

  } catch {
    $("myIP").textContent = "Impossible de récupérer l'IP.";

  } finally {
    b.disabled = false;
  }
});

// Bluetooth : nécessite l'autorisation du navigateur

$("bluetoothBtn").addEventListener("click", async () => {
  const out = $("bluetoothResult");

  if (!navigator.bluetooth) {
    out.textContent = "Bluetooth Web non disponible dans ce navigateur.";
    return;
  }

  $("bluetoothBtn").disabled = true;

  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true
    });

    out.textContent =
      "Appareil sélectionné : " +
      (device.name || "Nom non communiqué");

    addHistory(
      "NETWORK.FINDER",
      "Appareil Bluetooth sélectionné",
      1
    );

  } catch {
    out.textContent = "Sélection annulée ou indisponible.";

  } finally {
    $("bluetoothBtn").disabled = false;
  }
});

// URL.ANALYZER : vérifications simples, sans scan antivirus

$("urlBtn").addEventListener("click", () => {
  const raw = $("urlInput").value.trim();

  $("results").innerHTML = "";

  try {
    const url = new URL(raw);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw Error();
    }

    const host = url.hostname.toLowerCase();
    const warnings = [];

    if (url.protocol !== "https:") {
      warnings.push("Le lien n'utilise pas HTTPS.");
    }

    if (host.startsWith("xn--") || host.includes(".xn--")) {
      warnings.push("Le domaine contient des caractères internationalisés.");
    }

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      warnings.push("Le domaine est une adresse IP.");
    }

    if (url.username || url.password) {
      warnings.push("Le lien contient des identifiants intégrés.");
    }

    if (host.length > 60) {
      warnings.push("Le nom de domaine est long.");
    }

    const group = {
      category:
        currentTool?.type === "sitecheck"
          ? "SITE.CHECK"
          : "URL.ANALYZER",

      results: [{
        title: host,
        description:
          "Protocole : " +
          url.protocol +
          "\n" +
          (
            warnings.length
              ? warnings.join("\n")
              : "Aucun indicateur simple détecté."
          ) +
          "\nCette vérification ne garantit pas que le site est sûr.",
        url: url.href
      }]
    };

    displayGroups([group]);

    $("status").textContent =
      warnings.length + " indicateur(s) relevé(s).";

    addHistory(group.category, host, warnings.length);

  } catch {
    $("status").textContent =
      "URL invalide. Utilise une adresse http:// ou https://.";
  }
});

// QR.GENERATOR

$("qrBtn").addEventListener("click", () => {
  const text = $("qrText").value.trim();
  const out = $("qrOutput");

  out.innerHTML = "";

  if (!text) return;

  if (!window.QRCode) {
    out.textContent = "Module QR indisponible.";
    return;
  }

  new QRCode(out, {
    text,
    width: 210,
    height: 210,
    correctLevel: QRCode.CorrectLevel.M
  });

  addHistory("QR.GENERATOR", text.slice(0, 60), 1);
});

// IMAGE.METADATA : lecture locale uniquement

$("imageFile").addEventListener("change", () => {
  const file = $("imageFile").files?.[0];
  const out = $("imageMetadata");

  out.innerHTML = "";

  if (!file) return;

  const rows = [
    ["Nom", file.name],
    ["Type", file.type || "Inconnu"],
    ["Taille", (file.size / 1024).toFixed(1) + " Ko"],
    ["Dernière modification", new Date(file.lastModified).toLocaleString("fr-FR")]
  ];

  if (file.type.startsWith("image/")) {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      rows.push([
        "Dimensions",
        img.naturalWidth + " × " + img.naturalHeight + " px"
      ]);

      URL.revokeObjectURL(url);
      renderRows();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      renderRows();
    };

    img.src = url;
  }

  fun
