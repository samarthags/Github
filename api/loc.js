import fetch from "node-fetch";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export default async function handler(req, res) {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: "Username required" });

  const headers = GITHUB_TOKEN
    ? { Authorization: `token ${GITHUB_TOKEN}` }
    : {};

  try {
    // Get all repos for the user
    let page = 1;
    let repos = [];
    while (true) {
      const r = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&page=${page}`, { headers });
      if (!r.ok) throw new Error("Failed to fetch repos");
      const data = await r.json();
      repos = repos.concat(data);
      if (data.length < 100) break;
      page++;
    }

    let totalLOC = 0;

    // For each repo, fetch languages count (bytes), convert to rough lines count
    for (const repo of repos) {
      const langRes = await fetch(repo.languages_url, { headers });
      if (!langRes.ok) continue;
      const langs = await langRes.json();

      // Sum bytes of all languages in the repo
      const bytes = Object.values(langs).reduce((a, b) => a + b, 0);
      // Roughly estimate lines by dividing bytes by 50 (average bytes per line)
      totalLOC += Math.round(bytes / 50);
    }

    res.status(200).json({ totalLOC });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}