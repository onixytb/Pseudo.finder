require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: false
}));

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
}));

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAuth = supabaseUrl && anonKey
  ? createClient(supabaseUrl, anonKey)
  : null;

const supabaseAdmin = supabaseUrl && serviceKey
  ? createClient(supabaseUrl, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

const OWNER_CODE = process.env.OWNER_ACCESS_CODE;
const SERPAPI_KEY = process.env.SERPAPI_KEY;

app.use(express.static("public"));

app.get("/api/config", (req, res) => {
  res.json({
    supabaseUrl: supabaseUrl || "",
    supabaseAnonKey: anonKey || ""
  });
});

async function authenticate(req, res, next) {
  try {
    if (!supabaseAuth) {
      return res.status(503).json({
        error: "Authentification indisponible."
      });
    }

    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ")
      ? header.slice(7)
      : "";

    if (!token) {
      return res.status(401).json({
        error: "Connexion nécessaire."
      });
    }

    const { data, error } = await supabaseAuth.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        error: "Session invalide."
      });
    }

    req.user = data.user;
    req.token = token;

    next();

  } catch {
    res.status(401).json({
      error: "Authentification impossible."
    });
  }
}

async function getPlan(userId) {
  if (!supabaseAdmin) return "free";

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("plan,status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data || data.status !== "active") {
    return "free";
  }

  return data.plan || "free";
}

const ranks = {
  free: 0,
  pro: 1,
  ultimate: 2,
  owner: 3
};

function requirePlan(minimum) {
  return async (req, res, next) => {
    const plan = await getPlan(req.user.id);

    if ((ranks[plan] ?? 0) < (ranks[minimum] ?? 0)) {
      return res.status(403).json({
        error: "Cette fonctionnalité nécessite le forfait " +
          minimum.toUpperCase() + "."
      });
    }

    req.plan = plan;
    next();
  };
}

app.get("/api/me", authenticate, async (req, res) => {
  res.json({
    email: req.user.email,
    plan: await getPlan(req.user.id)
  });
});

// Recherche web via SerpAPI

async function searchWeb(query) {
  if (!SERPAPI_KEY) {
    throw new Error("La clé SERPAPI_KEY n'est pas configurée sur le serveur.");
  }

  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: SERPAPI_KEY
  });

  const response = await fetch(
    "https://serpapi.com/search.json?" + params
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || "Recherche web indisponible.");
  }

  return (data.organic_results || []).slice(0, 10).map(item => ({
    title: item.title || "Résultat",
    description: item.snippet || "",
    url: item.link || ""
  }));
}

app.post("/api/search", authenticate, async (req, res) => {
  try {
    const query = String(req.body.query || "").trim();
    const mode = String(req.body.mode || "general");

    if (query.length < 2 || query.length > 100) {
      return res.status(400).json({
        error: "Recherche invalide."
      });
    }

    if (!["pseudo", "general"].includes(mode)) {
      return res.status(400).json({
        error: "Mode de recherche invalide."
      });
    }

    const results = await searchWeb(query);

    res.json({
      platforms: [{
        name: "Résultats web",
        category: "Sources publiques",
        results
      }]
    });

  } catch (error) {
    res.status(500).json({
      error: error.message || "Recherche impossible."
    });
  }
});

// OSINT limité aux résultats publics non sensibles

app.post("/api/osint", authenticate, async (req, res) => {
  try {
    const first = String(req.body.first || "").trim();
    const last = String(req.body.last || "").trim();

    if (
      first.length < 2 ||
      last.length < 2 ||
      first.length > 50 ||
      last.length > 50
    ) {
      return res.status(400).json({
        error: "Nom ou prénom invalide."
      });
    }

    const query = `"${first}" "${last}" profil public`;
    const results = await searchWeb(query);

    res.json({
      groups: [{
        category: "Pages publiques",
        results
      }]
    });

  } catch (error) {
    res.status(500).json({
      error: error.message || "Recherche OSINT impossible."
    });
  }
});

// Analyse DNS publique

app.post("/api/domain", authenticate, async (req, res) => {
  try {
    const domain = String(req.body.domain || "")
      .trim()
      .toLowerCase();

    if (
      domain.length > 253 ||
      !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)
    ) {
      return res.status(400).json({
        error: "Nom de domaine invalide."
      });
    }

    const types = ["A", "AAAA", "MX", "NS", "TXT"];
    const groups = [];

    for (const type of types) {
      const response = await fetch(
        `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`
      );

      if (!response.ok) continue;

      const data = await response.json();

      groups.push({
        category: "DNS " + type,
        results: (data.Answer || []).map(record => ({
          title: record.name,
          description: record.data,
          url: ""
        }))
      });
    }

    res.json({ groups });

  } catch {
    res.status(500).json({
      error: "Impossible de consulter les DNS."
    });
  }
});

// Code propriétaire

app.post("/api/owner/redeem", authenticate, async (req, res) => {
  try {
    if (!OWNER_CODE || !supabaseAdmin) {
      return res.status(503).json({
        error: "Activation propriétaire non configurée."
      });
    }

    const code = String(req.body.code || "");

    if (code !== OWNER_CODE) {
      return res.status(403).json({
        error: "Code propriétaire incorrect."
      });
    }

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .upsert({
        user_id: req.user.id,
        plan: "owner",
        status: "active",
        provider: "owner_code",
        updated_at: new Date().toISOString()
      }, {
        onConflict: "user_id"
      });

    if (error) {
      console.error("Owner activation:", error);

      return res.status(500).json({
        error: "Impossible d'activer le forfait propriétaire. Vérifie la table subscriptions."
      });
    }

    res.json({
      success: true,
      plan: "owner"
    });

  } catch {
    res.status(500).json({
      error: "Erreur pendant l'activation."
    });
  }
});

// Page d'accueil

app.get("*", (req, res) => {
  res.sendFile(require("path").join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log("PSEUDO.FINDER lancé sur le port " + PORT);
});
