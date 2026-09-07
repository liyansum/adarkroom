/* Derive a password-equivalent key in the browser, keeping expensive work off Workers.
 * The server additionally hashes this key with its own random salt. MPL-2.0. */
(function (root) {
  const encoder = new TextEncoder();
  root.AuthKey = {
    async derive(username, password) {
      if (typeof username !== 'string' || typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('密码长度需为 8—128 位');
      const normalized = username.normalize('NFKC').trim().toLowerCase();
      const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: encoder.encode(`adarkroom-realm/password/v1/${normalized}`) }, material, 256);
      return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
    }
  };
})(globalThis);
