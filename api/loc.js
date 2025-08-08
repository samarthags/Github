import fetch from "node-fetch";

export default async function handler(req, res) {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: "Username required" });

  const headers = {
    Authorization: `token ${process.env.GITHUB_TOKEN}`,
    "User-Agent": "GitHub-LOC-App"
  };

  try {
    // Get user profile
    const userRes = await fetch(`https://api.github.com/users/${username}`, { headers });
    if (!userRes.ok) throw new Error("User not found");
    const userData = await userRes.json();

    // Get all repos
    let page = 1, repos = [];
    while (true) {
      const r = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&page=${page}`, { headers });
      const data = await r.json();
      repos = repos.concat(data);
      if (data.length < 100) break;
      page++;
    }

    let totalLOC = 0;
    let totalStars = 0;
    let biggestRepo = null;
    let languagesCount = {};
    let commitsCount = 0;
    let dayActivity = Array(7).fill(0);
    let commitHours = [];
    let commitMessages = [];
    let commitDates = [];

    for (const repo of repos) {
      totalStars += repo.stargazers_count;

      // Languages
      const langRes = await fetch(repo.languages_url, { headers });
      if (langRes.ok) {
        const langs = await langRes.json();
        for (const [lang, count] of Object.entries(langs)) {
          languagesCount[lang] = (languagesCount[lang] || 0) + count;
        }
      }

      // Commit activity
      const commitRes = await fetch(`https://api.github.com/repos/${username}/${repo.name}/stats/commit_activity`, { headers });
      if (commitRes.ok) {
        const commitData = await commitRes.json();
        if (Array.isArray(commitData)) {
          commitData.forEach(week => {
            commitsCount += week.total;
            week.days.forEach((count, day) => {
              dayActivity[day] += count;
            });
          });
        }
      }

      // Commit details
      const commitsListRes = await fetch(`https://api.github.com/repos/${username}/${repo.name}/commits?per_page=50`, { headers });
      if (commitsListRes.ok) {
        const commitsList = await commitsListRes.json();
        commitsList.forEach(commit => {
          const date = new Date(commit.commit.author.date);
          commitHours.push(date.getUTCHours());
          commitDates.push(date.toISOString().split("T")[0]);
          commitMessages.push(commit.commit.message.trim());
        });
      }

      // LOC
      const filesRes = await fetch(`https://api.github.com/repos/${username}/${repo.name}/git/trees/${repo.default_branch}?recursive=1`, { headers });
      if (!filesRes.ok) continue;
      const filesData = await filesRes.json();

      let repoLOC = 0;
      if (filesData.tree) {
        for (const file of filesData.tree) {
          if (file.type === "blob" && !file.path.includes("node_modules")) {
            const rawFile = await fetch(`https://raw.githubusercontent.com/${username}/${repo.name}/${repo.default_branch}/${file.path}`);
            if (rawFile.ok) {
              const content = await rawFile.text();
              repoLOC += content.split("\n").length;
            }
          }
        }
      }

      totalLOC += repoLOC;
      if (!biggestRepo || repoLOC > biggestRepo.loc) {
        biggestRepo = { name: repo.name, loc: repoLOC };
      }
    }

    // Helper: coding mood
    function getCodingMood(hours) {
      if (!hours.length) return "Unknown";
      const counts = {};
      for (let h of hours) counts[h] = (counts[h] || 0) + 1;
      const totalCommits = hours.length;
      const [peakHour, peakCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      const percentage = ((peakCount / totalCommits) * 100).toFixed(1);

      if (peakHour >= 5 && peakHour < 12) return `Morning developer — ${percentage}% of commits between 5 AM and 12 PM`;
      if (peakHour >= 12 && peakHour < 17) return `Afternoon developer — ${percentage}% of commits between 12 PM and 5 PM`;
      if (peakHour >= 17 && peakHour < 22) return `Evening developer — ${percentage}% of commits between 5 PM and 10 PM`;
      return `Night-time developer — ${percentage}% of commits between 10 PM and 5 AM`;
    }

    // Helper: most common commit message
    function getMostCommonCommit(messages) {
      if (!messages.length) return "No commits";
      const counts = {};
      for (let msg of messages) counts[msg] = (counts[msg] || 0) + 1;
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    }

    // Helper: commit streak
    function getCommitStreak(dates) {
      if (!dates.length) return 0;
      const sortedDates = [...new Set(dates)].sort();
      let streak = 1, maxStreak = 1;
      for (let i = 1; i < sortedDates.length; i++) {
        const prev = new Date(sortedDates[i - 1]);
        const curr = new Date(sortedDates[i]);
        const diff = (curr - prev) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
          streak++;
          maxStreak = Math.max(maxStreak, streak);
        } else {
          streak = 1;
        }
      }
      return maxStreak;
    }

    const favoriteLanguage = Object.entries(languagesCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const mostActiveDay = days[dayActivity.indexOf(Math.max(...dayActivity))];
    const codingMood = getCodingMood(commitHours);
    const mostCommonCommit = getMostCommonCommit(commitMessages);
    const commitStreak = getCommitStreak(commitDates);

    // Create sortable stats list
    const stats = [
      { label: "Total Lines of Code", value: totalLOC },
      { label: "Total Commits", value: commitsCount },
      { label: "Commit Streak (days)", value: commitStreak },
      { label: "Total Stars", value: totalStars },
      { label: "Most Active Day", value: mostActiveDay },
      { label: "Favorite Language", value: favoriteLanguage },
      { label: "Largest Repository", value: biggestRepo ? `${biggestRepo.name} (${biggestRepo.loc} LOC)` : "None" },
      { label: "Coding Mood", value: codingMood },
      { label: "Most Common Commit", value: mostCommonCommit }
    ];

    // Sort by numbers first, then keep text stats at the bottom
    stats.sort((a, b) => {
      const numA = typeof a.value === "number" ? a.value : -1;
      const numB = typeof b.value === "number" ? b.value : -1;
      return numB - numA;
    });

    res.status(200).json({
      avatar: userData.avatar_url,
      name: userData.name || userData.login,
      joined: new Date(userData.created_at).toDateString(),
      repoCount: repos.length,
      stats
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}