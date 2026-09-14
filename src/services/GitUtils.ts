import * as Crypto from 'expo-crypto';

export const GitUtils = {
  /**
   * Calcula o hash SHA-1 de um conteúdo no formato do Git Blob.
   * O Git calcula o hash como: sha1("blob " + content.byteLength + "\0" + content)
   */
  async calculateGitBlobSha1(content: string): Promise<string> {
    const byteLength = unescape(encodeURIComponent(content)).length;
    const prefix = `blob ${byteLength}\0`;
    const fullContent = prefix + content;

    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA1,
      fullContent
    );
  },

  /**
   * Verifica se o conteúdo local difere do SHA do GitHub, 
   * checando tanto o conteúdo exato quanto o normalizado (LF) para evitar falsos positivos de CRLF.
   */
  async isContentModified(localContent: string, remoteSha: string): Promise<boolean> {
    const exactSha = await this.calculateGitBlobSha1(localContent);
    if (exactSha === remoteSha) return false;

    const normalizedContent = localContent.replace(/\r\n/g, '\n');
    const normalizedSha = await this.calculateGitBlobSha1(normalizedContent);
    if (normalizedSha === remoteSha) return false;

    return true;
  }
};
