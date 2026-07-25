export class TrieNode {
  children: Map<string, TrieNode> = new Map();
  isTerminal = false;
  payload: any = null;
  tokenLength = 0;
}

export class TrieDictionary {
  private readonly root = new TrieNode();

  insert(phrase: string, payload: any): void {
    const tokens = phrase
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    if (!tokens.length) return;

    let node = this.root;

    for (const token of tokens) {
      let child = node.children.get(token);

      if (!child) {
        child = new TrieNode();
        node.children.set(token, child);
      }

      node = child;
    }

    node.isTerminal = true;
    node.payload = payload;
    node.tokenLength = tokens.length;
  }

  findLongestMatch(
    tokens: string[],
    startIndex: number,
  ): { payload: any; length: number } | null {
    let node = this.root;
    let best: { payload: any; length: number } | null = null;

    for (let i = startIndex; i < tokens.length; i++) {
      const token = tokens[i].toLowerCase();

      const child = node.children.get(token);

      if (!child) break;

      node = child;

      if (node.isTerminal) {
        best = {
          payload: node.payload,
          length: node.tokenLength,
        };
      }
    }

    return best;
  }

  has(phrase: string): boolean {
    const tokens = phrase
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    let node = this.root;

    for (const token of tokens) {
      const child = node.children.get(token);

      if (!child) return false;

      node = child;
    }

    return node.isTerminal;
  }

  clear(): void {
    this.root.children.clear();
  }

  size(): number {
    let count = 0;

    const walk = (node: TrieNode) => {
      if (node.isTerminal) count++;

      for (const child of node.children.values()) {
        walk(child);
      }
    };

    walk(this.root);

    return count;
  }
}
