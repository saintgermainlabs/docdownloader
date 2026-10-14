import { GithubRepoUrlInfo, GithubFileEntry } from './types';

/**
 * Returns HTTP headers for GitHub API requests, including Bearer token if configured.
 *
 * @returns Headers dictionary.
 */
export function getGithubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'AI-Doc-Downloader/1.0',
    'Accept': 'application/vnd.github.v3+json'
  };

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  return headers;
}

/**
 * Parses a GitHub repository or sub-tree URL string into owner, repo, branch, and tree path components.
 *
 * Supports full HTTPS URLs, `github.com/owner/repo`, and `owner/repo` shorthand strings.
 *
 * @param urlStr - GitHub URL string (e.g. `https://github.com/owner/repo/tree/main/docs` or `owner/repo`).
 * @throws {Error} Thrown if `urlStr` is not a valid GitHub repository identifier.
 * @returns Parsed {@link GithubRepoUrlInfo} object.
 *
 * @example
 * ```typescript
 * parseGithubUrl('https://github.com/aliaihub/awesome-hermes-usecases/tree/main/usecases');
 * parseGithubUrl('kepano/obsidian-skills');
 * ```
 */
export function parseGithubUrl(urlStr: string): GithubRepoUrlInfo {
  try {
    let cleanUrl = urlStr.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      if (cleanUrl.startsWith('github.com/')) {
        cleanUrl = `https://${cleanUrl}`;
      } else if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(cleanUrl)) {
        cleanUrl = `https://github.com/${cleanUrl}`;
      } else {
        cleanUrl = `https://${cleanUrl}`;
      }
    }

    const url = new URL(cleanUrl);
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts.length < 2) {
      throw new Error(`Invalid GitHub repository URL: ${urlStr}`);
    }

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, '');
    let branch: string | undefined;
    let treePath: string | undefined;

    if (parts[2] === 'tree' && parts.length > 3) {
      branch = parts[3];
      if (parts.length > 4) {
        treePath = parts.slice(4).join('/');
      }
    }

    return {
      owner,
      repo,
      branch,
      treePath,
      rawRepoUrl: `https://github.com/${owner}/${repo}`
    };
  } catch (err: any) {
    throw new Error(`Failed to parse GitHub URL "${urlStr}": ${err.message}`);
  }
}

/**
 * Fetches repository metadata (default branch and description) via the GitHub REST API.
 *
 * @param owner - Repository owner username.
 * @param repo - Repository name.
 * @returns Promise resolving to default branch and description.
 */
export async function fetchRepoMetadata(owner: string, repo: string): Promise<{ defaultBranch: string; description: string }> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: getGithubHeaders()
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      return {
        defaultBranch: data.default_branch || 'main',
        description: data.description || `${repo} repository`
      };
    }
  } catch {
    // fallback defaults
  }
  return { defaultBranch: 'main', description: `${repo} repository` };
}

/**
 * Fetches raw text content from a HTTP URL.
 *
 * @param url - Target download URL string.
 * @throws {Error} Thrown if HTTP request returns non-200 status.
 * @returns Raw text content string.
 */
export async function fetchFileText(url: string): Promise<string> {
  const res = await fetch(url, { headers: getGithubHeaders() });
  if (!res.ok) {
    throw new Error(`Failed to fetch file from ${url} (status: ${res.status})`);
  }
  return await res.text();
}

/**
 * Attempts to download the repository's root README file across standard filenames (`README.md`, `README.rst`, etc.).
 *
 * @param owner - Repository owner.
 * @param repo - Repository name.
 * @param branch - Git branch name.
 * @returns Object containing file content and filename, or null if no README is found.
 */
export async function fetchReadmeContent(owner: string, repo: string, branch: string): Promise<{ content: string; fileName: string } | null> {
  const candidateNames = ['README.md', 'readme.md', 'README.rst', 'README.txt', 'README'];

  for (const name of candidateNames) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${name}`;
    try {
      const content = await fetchFileText(rawUrl);
      return { content, fileName: name };
    } catch {
      // try next candidate
    }
  }

  return null;
}

/**
 * Recursively fetches all file entries under a sub-tree folder path using GitHub API.
 *
 * @param owner - Repository owner.
 * @param repo - Repository name.
 * @param branch - Git branch name.
 * @param treeSubPath - Folder sub-path inside repository (e.g. `docs` or `usecases`).
 * @returns Array of {@link GithubFileEntry} objects.
 */
export async function fetchTreeContentsRecursive(
  owner: string,
  repo: string,
  branch: string,
  treeSubPath: string
): Promise<GithubFileEntry[]> {
  const results: GithubFileEntry[] = [];
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${treeSubPath}?ref=${branch}`;

  try {
    const res = await fetch(apiUrl, { headers: getGithubHeaders() });
    if (!res.ok) {
      console.warn(`Could not list GitHub contents at ${apiUrl} (status: ${res.status})`);
      return results;
    }

    const items = (await res.json()) as any[];
    if (!Array.isArray(items)) {
      return results;
    }

    for (const item of items) {
      if (item.type === 'file') {
        results.push({
          name: item.name,
          path: item.path,
          downloadUrl: item.download_url || `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`,
          type: 'file'
        });
      } else if (item.type === 'dir') {
        const subFiles = await fetchTreeContentsRecursive(owner, repo, branch, item.path);
        results.push(...subFiles);
      }
    }
  } catch (err: any) {
    console.warn(`Failed fetching GitHub contents for ${treeSubPath}:`, err.message);
  }

  return results;
}

/**
 * Queries the GitHub Git Trees API to recursively retrieve the entire repository tree in a single call.
 *
 * @param owner - Repository owner.
 * @param repo - Repository name.
 * @param branch - Git branch or commit ref.
 * @returns Array of {@link GithubFileEntry} objects representing all files in the tree.
 */
export async function fetchGitTreeRecursive(
  owner: string,
  repo: string,
  branch: string
): Promise<GithubFileEntry[]> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const results: GithubFileEntry[] = [];

  try {
    const res = await fetch(apiUrl, { headers: getGithubHeaders() });
    if (res.ok) {
      const data = (await res.json()) as any;
      if (Array.isArray(data.tree)) {
        for (const item of data.tree) {
          if (item.type === 'blob') {
            const fileName = item.path.split('/').pop() || item.path;
            results.push({
              name: fileName,
              path: item.path,
              downloadUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`,
              type: 'file'
            });
          }
        }
        return results;
      }
    }
  } catch (err: any) {
    console.warn(`Git Trees API request failed: ${err.message}`);
  }

  return results;
}

/**
 * Queries repository root contents to discover all top-level directory names.
 *
 * @param owner - Repository owner.
 * @param repo - Repository name.
 * @param branch - Git branch name.
 * @returns Array of directory name strings.
 */
export async function fetchRepoRootDirectories(owner: string, repo: string, branch: string): Promise<string[]> {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents?ref=${branch}`;
  try {
    const res = await fetch(apiUrl, { headers: getGithubHeaders() });
    if (res.ok) {
      const items = (await res.json()) as any[];
      if (Array.isArray(items)) {
        return items.filter((item) => item.type === 'dir').map((item) => item.name);
      }
    }
  } catch {
    // ignore
  }
  return [];
}
