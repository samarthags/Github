import fetch from "node-fetch";

function countLOC(content) {
  return content.split("\n").length;
}

export default async function handler(req, res) {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: "Username required" });

  try {
    let page = 1, repos = [];

    // Get all public repos
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
      if (!repo.default_branch) continue;

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

    res.status(200).json({ totalLOC, repos: repoResults });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}