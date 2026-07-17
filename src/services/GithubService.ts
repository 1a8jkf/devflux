import { Platform } from 'react-native';
import { readAsStringAsync, writeAsStringAsync, documentDirectory } from 'expo-file-system/legacy';

const IS_WEB = Platform.OS === 'web';
const AUTH_FILE = IS_WEB ? 'DevFluxProjects/.github_auth' : `${documentDirectory || ''}DevFluxProjects/.github_auth`;

export interface GithubUser {
  login: string;
  avatar_url: string;
  name: string;
}

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string;
  updated_at: string;
  default_branch: string;
}

export interface GithubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

export interface GithubTreeResponse {
  sha: string;
  url: string;
  tree: GithubTreeItem[];
  truncated: boolean;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export const GithubService = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  
  notify() {
    listeners.forEach(l => l());
  },

  async getToken(): Promise<string | null> {
    if (IS_WEB) {
      return localStorage.getItem('@devflux_github_token');
    }
    try {
      const content = await readAsStringAsync(AUTH_FILE);
      if (content.trim() === '') return null;
      return content.trim();
    } catch(e) {
      return null;
    }
  },

  async setToken(token: string): Promise<void> {
    if (IS_WEB) {
      localStorage.setItem('@devflux_github_token', token);
    } else {
      await writeAsStringAsync(AUTH_FILE, token);
    }
    this.notify();
  },

  async removeToken(): Promise<void> {
    if (IS_WEB) {
      localStorage.removeItem('@devflux_github_token');
    } else {
      await writeAsStringAsync(AUTH_FILE, '');
    }
    this.notify();
  },

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getToken();
    if (!token) throw new Error('Not authenticated');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers
    };

    const res = await fetch(`https://api.github.com${endpoint}`, {
      ...options,
      headers
    });

    if (!res.ok) {
      throw new Error(`GitHub API Error: ${res.status} ${res.statusText}`);
    }

    return res.json();
  },

  async getUser(): Promise<GithubUser> {
    return this.request<GithubUser>('/user');
  },

  async createRepo(name: string, description: string = '', isPrivate: boolean = false): Promise<GithubRepo> {
    return this.request<GithubRepo>('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description,
        private: isPrivate,
        auto_init: false // We will initialize it locally
      })
    });
  },

  async getRepos(): Promise<GithubRepo[]> {
    return this.request<GithubRepo[]>('/user/repos?sort=updated&per_page=50');
  },

  async getRepoTree(fullName: string, branch: string): Promise<GithubTreeResponse> {
    return this.request<GithubTreeResponse>(`/repos/${fullName}/git/trees/${branch}?recursive=1`);
  },

  async getFileContent(fullName: string, path: string): Promise<string> {
    const token = await this.getToken();
    if (!token) throw new Error('Not authenticated');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3.raw',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const res = await fetch(`https://api.github.com/repos/${fullName}/contents/${path}`, {
      headers
    });

    if (!res.ok) {
      throw new Error(`GitHub API Error: ${res.status} ${res.statusText}`);
    }

    return res.text();
  },

  async getPullRequests(): Promise<any[]> {
    const res = await this.request<any>('/search/issues?q=is:pr+author:@me+state:open&sort=updated');
    return res.items || [];
  },

  async getIssues(): Promise<any[]> {
    const res = await this.request<any>('/search/issues?q=is:issue+assignee:@me+state:open&sort=updated');
    return res.items || [];
  },

  async getGists(): Promise<any[]> {
    return this.request<any[]>('/gists');
  },

  async getStarredRepos(): Promise<GithubRepo[]> {
    return this.request<GithubRepo[]>('/user/starred?sort=created');
  },

  // --- Git Database API Methods ---

  async getRef(fullName: string, branch: string): Promise<any> {
    return this.request<any>(`/repos/${fullName}/git/ref/heads/${branch}`);
  },

  async getCommit(fullName: string, commitSha: string): Promise<any> {
    return this.request<any>(`/repos/${fullName}/git/commits/${commitSha}`);
  },

  async createBlob(fullName: string, content: string, encoding: 'utf-8' | 'base64' = 'utf-8'): Promise<any> {
    const res = await fetch(`https://api.github.com/repos/${fullName}/git/blobs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await this.getToken()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ content, encoding })
    });
    if (!res.ok) throw new Error('Failed to create blob');
    return res.json();
  },

  async createTree(fullName: string, baseTreeSha: string, tree: Array<{path: string, mode: string, type: 'blob'|'tree', sha?: string, content?: string}>): Promise<any> {
    const res = await fetch(`https://api.github.com/repos/${fullName}/git/trees`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await this.getToken()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({ base_tree: baseTreeSha, tree })
    });
    if (!res.ok) throw new Error('Failed to create tree');
    return res.json();
  },

  async createCommit(fullName: string, message: string, treeSha: string, parentShas: string[]): Promise<any> {
    const res = await fetch(`https://api.github.com/repos/${fullName}/git/commits`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await this.getToken()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({ message, tree: treeSha, parents: parentShas })
    });
    if (!res.ok) throw new Error('Failed to create commit');
    return res.json();
  },

  async updateRef(fullName: string, branch: string, commitSha: string): Promise<any> {
    const res = await fetch(`https://api.github.com/repos/${fullName}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${await this.getToken()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({ sha: commitSha, force: false })
    });
    if (!res.ok) throw new Error('Failed to update ref');
    return res.json();
  }
};
