const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.static("public")); // Serve frontend files

// Count LOC from file text
function countLOC(content) {
  return content.split("\n").length;
}

// Endpoint: Get LOC for all repos of a user
app.get("/loc/:username", async (req, res) => {
  const username = req.params.username;
  try {
    let page = 1, repos = [];

    // Fetch all repos
    while (true) {
      const r = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&page=${page}`);
      if (!r.ok) throw new Error("Failed to fetch repos");
      const data = await r.json();
      repos = repos.concat(data);
      if (data.length < 100) break;
      page++;
    }

    let totalLOC = 0;
    let repoResults = [];

    for (const repo of repos) {
      const filesRes = await fetch(`https://api.github.com/repos/${username}/${repo.name}/git/trees/${repo.default_branch}?recursive=1`);
      if (!filesRes.ok) continue;
      const filesData = await filesRes.json();

      let repoLOC = 0;
      if (filesData.tree) {
        for (const file of filesData.tree) {
          if (file.type === "blob" && !file.path.includes("node_modules") && !file.path.includes("dist")) {
            const rawFile = await fetch(`https://raw.githubusercontent.com/${username}/${repo.name}/${repo.default_branch}/${file.path}`);
            if (rawFile.ok) {
              const content = await rawFile.text();
              repoLOC += countLOC(content);
            }
          }
        }
      }

      totalLOC += repoLOC;
      repoResults.push({ repo: repo.name, loc: repoLOC });
    }

    res.json({ totalLOC, repos: repoResults });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));