export interface GithubRepoUrlInfo {
  owner: string;
  repo: string;
  branch?: string;
  treePath?: string;
  rawRepoUrl: string;
}

export interface GithubDocsOptions {
  repoUrl: string;
  readme?: boolean; // default: true
  type?: 'repo' | 'list'; // default: 'repo'
  listType?: string; // default: 'awesome'
  tree?: string | false; // default: false
  outputBaseDir?: string; // default: './output'
  dbPath?: string; // default: './docs.db'
}

export interface GithubFileEntry {
  name: string;
  path: string;
  downloadUrl: string;
  type: 'file' | 'dir';
}
