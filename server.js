const crypto = require("crypto");
const express = require("express");
const path = require("path");
const dns = require("dns").promises;

const app = express();

app.use(express.json({ limit: "10kb" }));
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.SERPAPI_KEY;

const platforms = [
    { name: "YouTube", domain: "youtube.com" },
    { name: "Reddit", domain: "reddit.com" },
    { name: "X / Twitter", domain: "x.com" },
    { name: "TikTok", domain: "tiktok.com" },
    { name: "Instagram", domain: "instagram.com" },
    { name: "Facebook", domain: "facebook.com" },
    { name: "Pinterest", domain: "pinterest.com" },
    { name: "Twitch", domain: "twitch.tv" },
    { name: "GitHub", domain: "github.com" },
    { name: "Steam", domain: "steamcommunity.com" },
    { name: "Roblox", domain: "roblox.com" }
];

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// CONFIGURATION SUPABASE
app.get("/api/config", (req, res) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return res.status(500).json({
            error: "Configuration Supabase manquante sur Render."
        });
    }

    res.setHeader("Cache-Control", "no-store");

    res.json({
        supabaseUrl,
        supabaseAnonKey
    });
});

function normalize(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/^@/, "")
        .replace(/[^a-z0-9]/g, "");
}

function isProfile(platform, url, pseudo) {
    const parts = url.pathname.split("/").filter(Boolean);
    const wanted = normalize(pseudo);

    if (!parts.length) return false;

    const first = normalize(parts[0]);
    const second = normalize(parts[1] || "");

    switch (platform) {
        case "YouTube":
            return (
                parts.length === 1 && first === wanted
            ) || (
                parts.length === 2 &&
                ["@", "c", "user"].some(prefix =>
                    parts[0].toLowerCase().startsWith(prefix)
                ) &&
                second === wanted
            );

        case "TikTok":
            return (
                parts.length === 1 &&
                parts[0].startsWith("@") &&
                first === wanted
            );

        case "Reddit":
            return (
                parts.length === 2 &&
                ["user", "u"].includes(parts[0].toLowerCase()) &&
                second === wanted
            );

        case "Instagram":
        case "Twitch":
        case "GitHub":
        case "X / Twitter":
        case "Pinterest":
        case "Facebook":
            return parts.length === 1 && first === wanted;

        case "Steam":
            return (
                parts.length === 2 &&
                parts[0] === "id" &&
                second === wanted
            );

        default:
            return false;
    }
}

async function searchGoogle(query, domain = null) {
    if (!API_KEY) {
        throw new Error("SERPAPI_KEY manquante sur Render.");
    }

    const q = domain
        ? `site:${domain} ${query}`
        : query;

    const params = new URLSearchParams({
        engine: "google",
        q,
        api_key: API_KEY,
        gl: "fr",
        hl: "fr",
        safe: "active",
        num: "10"
    });

    const response = await fetch(
        "https://serpapi.com/search.json?" + params,
        { signal: AbortSignal.timeout(25000) }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
        throw new Error(data.error || "Erreur SerpApi.");
    }

    return data.organic_results || [];
}

function safeResult(item) {
    try {
        const url = new URL(item.link);

        if (!["https:", "http:"].includes(url.protocol)) {
            return null;
        }

        return {
            title: String(item.title || "Page sans titre")
                .slice(0, 250),

            description: String(item.snippet || "")
                .replace(
                    /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g,
                    "[e-mail masqué]"
                )
                .replace(
                    /(?:\+?\d[\d\s().-]{7,}\d)/g,
                    "[numéro masqué]"
                )
                .slice(0, 500),

            url: url.href
        };
    } catch {
        return null;
    }
}

async function searchPlatform(platform, query, mode) {
    const raw = await searchGoogle(query, platform.domain);

    const results = raw
        .map(safeResult)
        .filter(Boolean)
        .filter(item => {
            const url = new URL(item.url);

            const validDomain =
                url.hostname === platform.domain ||
                url.hostname.endsWith("." + platform.domain);

            if (!validDomain) return false;

            if (mode === "pseudo") {
                return isProfile(platform.name, url, query);
            }

            return true;
        })
        .map(item => ({
            ...item,
            possibleMatch: mode === "pseudo",
            type: mode === "pseudo"
                ? "Profil possible à vérifier"
                : "Résultat public"
        }));

    return {
        category: platform.name,
        results
    };
}

// RECHERCHE DE PSEUDO ET RECHERCHE GÉNÉRALE

app.post("/api/search", async (req, res) => {
    try {
        const query = String(req.body.query || "").trim();
        const mode = req.body.mode;

        if (query.length < 2 || query.length > 150) {
            return res.status(400).json({
                error: "Recherche invalide."
            });
        }

        if (!["pseudo", "general"].includes(mode)) {
            return res.status(400).json({
                error: "Mode invalide."
            });
        }

        if (
            mode === "pseudo" &&
            !/^[a-zA-Z0-9_.@-]{2,50}$/.test(query)
        ) {
            return res.status(400).json({
                error: "Pseudo invalide."
            });
        }

        const tasks = mode === "general"
            ? [
                searchGoogle(query).then(raw => ({
                    category: "Google",
                    results: raw.map(safeResult).filter(Boolean)
                })),
                ...platforms.map(platform =>
                    searchPlatform(platform, query, mode)
                )
            ]
            : platforms.map(platform =>
                searchPlatform(platform, query, mode)
            );

        const settled = await Promise.allSettled(tasks);

        const output = settled.map((result, index) => {
            if (result.status === "fulfilled") {
                return {
                    name: result.value.category,
                    results: result.value.results,
                    status: result.value.results.length
                        ? "results"
                        : "empty"
                };
            }

            const platformIndex =
                mode === "general" ? index - 1 : index;

            return {
                name: mode === "general" && index === 0
                    ? "Google"
                    : platforms[platformIndex].name,
                results: [],
                status: "error",
                error: "Recherche indisponible pour cette source."
            };
        });

        res.json({
            query,
            mode,
            platforms: output
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Erreur serveur."
        });
    }
});

// OSINT : SOURCES PUBLIQUES NON SENSIBLES

app.post("/api/osint", async (req, res) => {
    try {
        const first = String(req.body.first || "").trim();
        const last = String(req.body.last || "").trim();

        const valid = /^[\p{L}\p{M}' -]{2,70}$/u;

        if (!valid.test(first) || !valid.test(last)) {
            return res.status(400).json({
                error: "Nom ou prénom invalide."
            });
        }

        const fullName = `"${first} ${last}"`;

        const searches = [
            {
                category: "Articles et actualités",
                query: `${fullName} actualité interview`
            },
            {
                category: "Informations professionnelles",
                query: `${fullName} profession entreprise parcours`
            },
            {
                category: "Organisations et sites officiels",
                query: `${fullName} site officiel organisation`
            },
            {
                category: "Profils professionnels publics",
                query: `${fullName} profil professionnel`
            }
        ];

        const groups = await Promise.all(
            searches.map(async search => {
                try {
                    const raw = await searchGoogle(search.query);

                    return {
                        category: search.category,
                        results: raw.map(safeResult).filter(Boolean)
                    };
                } catch {
                    return {
                        category: search.category,
                        results: [],
                        error: "Source indisponible."
                    };
                }
            })
        );

        const seen = new Set();

        for (const group of groups) {
            group.results = group.results.filter(item => {
                if (seen.has(item.url)) return false;

                seen.add(item.url);
                return true;
            });
        }

        res.json({
            groups,
            total: groups.reduce(
                (sum, group) => sum + group.results.length,
                0
            )
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Erreur OSINT."
        });
    }
});

// DOMAIN.FINDER : DNS PUBLIC

app.post("/api/domain", async (req, res) => {
    try {
        const domain = String(req.body.domain || "")
            .trim()
            .toLowerCase()
            .replace(/^https?:\/\//, "")
            .replace(/\/.*$/, "")
            .replace(/\.$/, "");

        const validDomain =
            /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

        if (!validDomain.test(domain)) {
            return res.status(400).json({
                error: "Nom de domaine invalide."
            });
        }

        const types = ["A", "AAAA", "MX", "NS", "TXT", "CNAME"];

        const groups = await Promise.all(
            types.map(async type => {
                try {
                    const records = await dns.resolve(domain, type);

                    return {
                        category: "DNS " + type,
                        results: records.map(record => ({
                            title: typeof record === "object"
                                ? JSON.stringify(record)
                                : String(record),
                            description: "Enregistrement DNS public",
                            url: "https://www.iana.org/domains"
                        }))
                    };
                } catch (error) {
                    return {
                        category: "DNS " + type,
                        results: [],
                        error:
                            error.code === "ENODATA" ||
                            error.code === "ENOTFOUND"
                                ? "Aucun enregistrement disponible."
                                : "Requête DNS indisponible."
                    };
                }
            })
        );

        res.json({ domain, groups });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Erreur DNS."
        });
    }
});
app.post("/api/owner/redeem", async (req, res) => {
    try {
        const code = String(req.body.code || "");
        const expectedCode = process.env.OWNER_ACCESS_CODE;

        const supabaseUrl = process.env.SUPABASE_URL;
        const anonKey = process.env.SUPABASE_ANON_KEY;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!expectedCode || !supabaseUrl || !anonKey || !serviceKey) {
            return res.status(500).json({
                error: "Configuration OWNER incomplète."
            });
        }

        const authHeader = req.headers.authorization || "";
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice(7)
            : "";

        if (!token || !code) {
            return res.status(400).json({
                error: "Connecte-toi et entre ton code."
            });
        }

        const received = Buffer.from(code);
        const expected = Buffer.from(expectedCode);

        const validCode =
            received.length === expected.length &&
            crypto.timingSafeEqual(received, expected);

        if (!validCode) {
            return res.status(403).json({
                error: "Code propriétaire incorrect."
            });
        }

        const userResponse = await fetch(
            supabaseUrl + "/auth/v1/user",
            {
                headers: {
                    apikey: anonKey,
                    Authorization: "Bearer " + token
                }
            }
        );

        if (!userResponse.ok) {
            return res.status(401).json({
                error: "Session invalide. Reconnecte-toi."
            });
        }

        const user = await userResponse.json();

        const saveResponse = await fetch(
            supabaseUrl + "/rest/v1/subscriptions?on_conflict=user_id",
            {
                method: "POST",
                headers: {
                    apikey: serviceKey,
                    Authorization: "Bearer " + serviceKey,
                    "Content-Type": "application/json",
                    Prefer: "resolution=merge-duplicates,return=minimal"
                },
                body: JSON.stringify({
                    user_id: user.id,
                    plan: "owner",
                    status: "active",
                    provider: null,
                    cancel_at_period_end: false
                })
            }
        );

        if (!saveResponse.ok) {
            console.error(await saveResponse.text());

            return res.status(500).json({
                error: "Impossible d'activer OWNER."
            });
        }

        return res.json({
            success: true,
            plan: "owner",
            message: "Accès OWNER activé."
        });

    } catch (error) {
        console.error("OWNER :", error);

        return res.status(500).json({
            error: "Erreur serveur."
        });
    }
});
app.listen(PORT, () => {
    console.log(
        "PSEUDO.FINDER V12 actif sur le port " + PORT
    );
});
