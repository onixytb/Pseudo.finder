
const express = require("express");
const path = require("path");

const app = express();

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

const API_KEY = process.env.GOOGLE_API_KEY;
const SEARCH_ENGINE_ID = process.env.GOOGLE_CX;

app.post("/api/search", async (req, res) => {
    try {
        const pseudo = String(req.body.pseudo || "").trim();

        if (!/^[a-zA-Z0-9_.-]{2,50}$/.test(pseudo)) {
            return res.status(400).json({
                error: "Pseudo invalide."
            });
        }

        if (!API_KEY || !SEARCH_ENGINE_ID) {
            return res.status(500).json({
                error: "Clés API non configurées."
            });
        }

        const query = `"${pseudo}"`;

        const params = new URLSearchParams({
            key: API_KEY,
            cx: SEARCH_ENGINE_ID,
            q: query,
            num: "10"
        });

        const response = await fetch(
            "https://www.googleapis.com/customsearch/v1?" +
            params.toString()
        );

        if (!response.ok) {
            return res.status(502).json({
                error: "Le moteur de recherche a refusé la requête."
            });
        }

        const data = await response.json();

        const results = (data.items || []).map(item => ({
            title: item.title,
            description: item.snippet,
            url: item.link
        }));

        res.json({
            pseudo,
            results
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Erreur pendant la recherche."
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("PSEUDO.FINDER actif sur le port " + PORT);
});
