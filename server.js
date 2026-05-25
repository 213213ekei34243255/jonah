require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());

/* =========================
   🔒 TRUSTED DOMAINS
========================= */
const trustedDomains = [
    "google.com", "youtube.com", "instagram.com",
    "facebook.com", "twitter.com", "x.com",
    "discord.com", "amazon.com", "wikipedia.org",
    "linkedin.com", "github.com", "microsoft.com",
    "apple.com", "netflix.com", "web.whatsapp.com",
    "chatgpt.com", "cogniaistudios.com",
    "bing.com", "grok.com", "snapchat.com",
    "tiktok.com", "cloudflare.com"
];

function isTrusted(domain) {
    return trustedDomains.some(d => domain.includes(d));
}

/* =========================
   🧠 BRAND EXTRACTION
========================= */
function getBrand(domain) {
    return domain
        .replace("www.", "")
        .split(".")[0]
        .replace(/[-_]/g, " ")
        .toLowerCase();
}

/* =========================
   ⏱ SLEEP HELPER
========================= */
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/* =========================
   🌐 USER AGENTS
========================= */
const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
];

function randomUA() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/* =========================
   🔥 REDDIT JSON API
========================= */
async function fetchRedditJSON(query, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=10&sort=relevance`;

            const res = await axios.get(url, {
                headers: {
                    "User-Agent": randomUA(),
                    "Accept": "application/json, text/plain, */*",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache",
                    "Sec-Fetch-Dest": "empty",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Site": "same-origin"
                },
                timeout: 10000
            });

            const posts = res.data.data.children || [];
            console.log(`✅ Reddit JSON got ${posts.length} posts for: ${query}`);
            return posts;

        } catch (e) {
            const status = e.response?.status;
            console.log(`Reddit JSON attempt ${attempt} failed: ${status}`);

            if (status === 429) {
                const wait = Math.pow(2, attempt) * 3000;
                console.log(`Rate limited. Waiting ${wait}ms...`);
                await sleep(wait);
            } else {
                break;
            }
        }
    }
    return [];
}

/* =========================
   📡 REDDIT RSS FALLBACK
========================= */
async function fetchRedditRSS(query, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const url = `https://www.reddit.com/search.rss?q=${encodeURIComponent(query)}&limit=10&sort=relevance`;

            const res = await axios.get(url, {
                headers: {
                    "User-Agent": randomUA(),
                    "Accept": "application/rss+xml, application/xml, text/xml, */*"
                },
                timeout: 10000
            });

            const titles = [...res.data.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)]
                .map(m => m[1])
                .filter(t => !t.toLowerCase().includes("reddit: the front page"));

            const posts = titles.map(title => ({
                data: { title, selftext: "" }
            }));

            console.log(`✅ Reddit RSS got ${posts.length} posts for: ${query}`);
            return posts;

        } catch (e) {
            const status = e.response?.status;
            console.log(`Reddit RSS attempt ${attempt} failed: ${status}`);

            if (status === 429) {
                const wait = Math.pow(2, attempt) * 3000;
                await sleep(wait);
            } else {
                break;
            }
        }
    }
    return [];
}

/* =========================
   🔍 GOOGLE FALLBACK
========================= */
async function fetchViaGoogle(query) {
    try {
        const url = `https://www.google.com/search?q=${encodeURIComponent(query + " reddit")}`;

        const res = await axios.get(url, {
            headers: {
                "User-Agent": randomUA(),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9"
            },
            timeout: 10000
        });

        const links = [...res.data.matchAll(/https:\/\/www\.reddit\.com\/r\/[^"&]+/g)]
            .map(m => m[0]);

        const posts = links.slice(0, 5).map(link => ({
            data: { title: link, selftext: "" }
        }));

        console.log(`✅ Google fallback got ${posts.length} links for: ${query}`);
        return posts;

    } catch (e) {
        console.log("Google fallback failed:", e.message);
        return [];
    }
}

/* =========================
   🤖 GEMINI CLASSIFIER
========================= */
async function classifyWithGemini(texts) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;

        const prompt = `
Classify each text into ONE of:
SCAM, COMPLAINT, POSITIVE, IRRELEVANT

Return ONLY a JSON array with no explanation, no markdown, no backticks.
Example: ["POSITIVE","SCAM","COMPLAINT","IRRELEVANT"]

Texts:
${texts.map((t, i) => `${i + 1}. ${t}`).join("\n")}
`;

        const res = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            { contents: [{ parts: [{ text: prompt }] }] },
            { timeout: 15000 }
        );

        const output = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
        const match = output?.match(/\[.*?\]/s);
        if (!match) return null;

        return JSON.parse(match[0]);

    } catch (err) {
        console.log("Gemini classifier failed:", err.message);
        return null;
    }
}

/* =========================
   🤖 GEMINI DIRECT ANALYSIS
   (used when ALL data sources fail)
========================= */
async function geminiDirectAnalysis(brand) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;

        const prompt = `
You are a trust and safety analyst. Analyze the brand or website called "${brand}" based on your knowledge.

Return ONLY a valid JSON object, no markdown, no explanation, no backticks:
{
  "score": <number 0-100>,
  "summary": "<one sentence summary>",
  "scamCount": <number>,
  "complaintCount": <number>,
  "positiveCount": <number>,
  "issues": ["<issue1>", "<issue2>"]
}

If you have no knowledge of this brand, return score 50 with summary "Insufficient data to evaluate".
`;

        const res = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            { contents: [{ parts: [{ text: prompt }] }] },
            { timeout: 15000 }
        );

        const output = res.data.candidates?.[0]?.content?.parts?.[0]?.text;
        const match = output?.match(/\{[\s\S]*\}/);
        if (!match) return null;

        const result = JSON.parse(match[0]);
        console.log("✅ Gemini direct analysis used for:", brand);
        return result;

    } catch (err) {
        console.log("Gemini direct analysis failed:", err.message);
        return null;
    }
}

/* =========================
   📊 SCORE CALCULATOR
========================= */
function calculateScore(scamCount, complaintCount, positiveCount) {
    let score = 50;
    score -= scamCount * 15;
    score -= complaintCount * 3;
    score += positiveCount * 6;
    return Math.max(0, Math.min(100, score));
}

/* =========================
   📌 SUMMARY GENERATOR
========================= */
function getSummary(scamCount, complaintCount, positiveCount) {
    if (scamCount >= 3) return "⚠️ High scam reports detected";
    if (scamCount >= 1 && complaintCount >= 2) return "⚠️ Some scam reports and complaints";
    if (complaintCount > positiveCount) return "Frequent complaints from users";
    if (positiveCount > scamCount + complaintCount) return "Mostly positive reputation";
    return "Mixed feedback";
}

/* =========================
   🚀 TRUST API
========================= */
app.get("/trust", async (req, res) => {
    const domain = req.query.domain;

    if (!domain) {
        return res.status(400).json({ error: "Missing domain parameter" });
    }

    const brand = getBrand(domain);
    console.log(`\n🔍 Checking trust for: ${domain} (brand: ${brand})`);

    try {
        /* ✅ TRUSTED SHORTCUT */
        if (isTrusted(domain)) {
            console.log("✅ Trusted domain shortcut");
            return res.json({
                score: 85,
                community: 85,
                security: "Trusted platform",
                issues: ["Widely recognized service"],
                breakdown: { source: "trusted-list" }
            });
        }

        const queries = [
            `${brand} scam OR fraud`,
            `${brand} review legit`
        ];

        let posts = [];
        let source = "";

        /* 1️⃣ TRY REDDIT JSON */
        console.log("Trying Reddit JSON...");
        for (const q of queries) {
            const data = await fetchRedditJSON(q);
            posts.push(...data);
            if (posts.length > 0) await sleep(3000 + Math.random() * 2000);
        }

        if (posts.length > 0) {
            source = "reddit-json";
        }

        /* 2️⃣ TRY REDDIT RSS */
        if (posts.length === 0) {
            console.log("Reddit JSON failed, trying RSS...");
            for (const q of queries) {
                const data = await fetchRedditRSS(q);
                posts.push(...data);
                if (posts.length > 0) await sleep(3000 + Math.random() * 2000);
            }
            if (posts.length > 0) source = "reddit-rss";
        }

        /* 3️⃣ TRY GOOGLE FALLBACK */
        if (posts.length === 0) {
            console.log("Reddit RSS failed, trying Google...");
            for (const q of queries) {
                const data = await fetchViaGoogle(q);
                posts.push(...data);
            }
            if (posts.length > 0) source = "google";
        }

        /* 4️⃣ GEMINI DIRECT — all sources failed */
        if (posts.length === 0) {
            console.log("All sources failed, using Gemini direct analysis...");
            const direct = await geminiDirectAnalysis(brand);

            if (direct) {
                return res.json({
                    score: direct.score,
                    community: direct.score,
                    security: direct.summary,
                    issues: direct.issues?.length ? direct.issues : [direct.summary],
                    breakdown: {
                        scamCount: direct.scamCount,
                        complaintCount: direct.complaintCount,
                        positiveCount: direct.positiveCount,
                        postsAnalyzed: 0,
                        source: "gemini-direct"
                    }
                });
            }

            /* 5️⃣ TOTAL FAILURE */
            return res.json({
                score: 65,
                community: 65,
                security: "No data found",
                issues: ["No community discussions found for this site"],
                breakdown: { source: "none" }
            });
        }

        /* =========================
           🤖 CLASSIFY POSTS
        ========================= */
        const texts = posts
            .map(p => (p.data.title + " " + p.data.selftext).toLowerCase())
            .filter(t => t.includes(brand))
            .slice(0, 10);

        console.log(`📝 ${texts.length} relevant posts found via ${source}`);

        let scamCount = 0;
        let complaintCount = 0;
        let positiveCount = 0;
        let issues = [];

        if (texts.length > 0) {
            const classifications = await classifyWithGemini(texts);

            if (classifications) {
                classifications.forEach(label => {
                    if (label === "SCAM") {
                        scamCount++;
                        issues.push("Users report scam behavior");
                    } else if (label === "COMPLAINT") {
                        complaintCount++;
                    } else if (label === "POSITIVE") {
                        positiveCount++;
                    }
                });
            } else {
                /* 🔁 KEYWORD FALLBACK */
                texts.forEach(text => {
                    if (text.includes("scam") || text.includes("fraud") || text.includes("fake")) {
                        scamCount++;
                        issues.push("Users report scam behavior");
                    } else if (text.includes("problem") || text.includes("refund") || text.includes("complaint")) {
                        complaintCount++;
                    } else if (text.includes("good") || text.includes("trusted") || text.includes("legit")) {
                        positiveCount++;
                    }
                });
            }
        }

        const score = calculateScore(scamCount, complaintCount, positiveCount);
        const summary = getSummary(scamCount, complaintCount, positiveCount);

        res.json({
            score,
            community: score,
            security: summary,
            issues: issues.length ? [...new Set(issues)] : [summary],
            breakdown: {
                scamCount,
                complaintCount,
                positiveCount,
                postsAnalyzed: texts.length,
                source
            }
        });

    } catch (err) {
        console.error("Trust API error:", err.message);
        res.json({
            score: 50,
            community: 50,
            security: "System error",
            issues: ["Internal failure"]
        });
    }
});

/* =========================
   🚀 START SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`✅ Trust API running on port ${PORT}`);
});
