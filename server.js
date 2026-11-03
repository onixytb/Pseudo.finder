const express = require("express");
const path = require("path");

const app = express();

app.use(express.json({ limit: "10kb" }));

// Afficher le site
app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

const API_KEY = process.env.SERPAPI_KEY;

const allowedSites = [
    "instagram.com",
    "tiktok.com",
    "youtube.com",
    "reddit.com",
    "github.com",
    "twitch.tv",
    "pinterest.com",
    "x.com",
    "facebook.com",
    "roblox.com",
    "steamcommunity.com"
];

app.post("/api/search", async (req, res) => {
    try {
        const pseudo = String(req.body.pseudo || "").trim();

        if (!/^[a-zA-Z0-9_.-]{2,50}$/.test(pseudo)) {
            return res.status(400).json({
                error: "Pseudo invalide."
            });
        }

        if (!API_KEY) {
            return res.status(500).json({
                error: "Clé SerpApi manquante."
            });
        }

        const query = `"${pseudo}" (` +
            allowedSites.map(s => `site:${s}`).join(" OR ") + ")";

        const params = new URLSearchParams({
            engine: "google",
            q: query,
            api_key: API_KEY,
            gl: "fr",
            hl: "fr",
            safe: "active"
        });

        const response = await fetch(
            "https://serpapi.com/search.json?" + params
        );

        const data = await response.json();

        if (!response.ok || data.error) {
            return res.status(502).json({
                error: data.error || "Erreur API."
            });
        }

        const results = (data.organic_results || [])
            .filter(item => {
                try {
                    const host = new URL(item.link).hostname
                        .replace(/^www\./, "");

                    return allowedSites.some(site =>
                        host === site || host.endsWith("." + site)
                    );
                } catch {
                    return false;
                }
            })
            .map(item => ({
                title: item.title,
                description: item.snippet,
                url: item.link
            }));

        res.json({ pseudo, results });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Erreur serveur."
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("PSEUDO.FINDER V3 démarré !");
});
