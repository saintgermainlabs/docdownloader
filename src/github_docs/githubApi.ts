import { GithubRepoUrlInfo, GithubFileEntry } from './types';

/**
 * Parses a GitHub repository or sub-tree URL string into owner, repo, branch, and tree path components.
 *
 * @param urlStr - GitHub URL string (e.g. `https://github.com/owner/repo/tree/main/docs`).
 * @throws {Error} Thrown if `urlStr` is not a valid GitHub repository URL.
 * @returns Parsed {@link GithubRepoUrlInfo} object.
 *
 * @example
 * ```typescript
 * parseGithubUrl('https://github.com/aliaihub/awesome-hermes-usecases/tree/main/usecases');
 * ```
 */
export function parseGithubUrl(urlStr: string): GithubRepoUrlInfo {
  try {
    const url = new URL(urlStr);
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

const DEFAULT_HEADERS = {
  'User-Agent': 'AI-Doc-Downloader/1.0',
  'Accept': 'application/vnd.github.v3+json'
};

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
      headers: DEFAULT_HEADERS
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
  const res = await fetch(url, { headers: DEFAULT_HEADERS });
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
    const res = await fetch(apiUrl, { headers: DEFAULT_HEADERS });
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
    const res = await fetch(apiUrl, { headers: DEFAULT_HEADERS });
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
