// El azar de Python (random.Random con semilla), copiado tal cual: con la misma semilla salen los mismos
// parpadeos que en el Director de la PC. Es el "Mersenne Twister" que usa Python.

const N = 624, M = 397;

export class Azar {
  constructor(semilla = 0) { this.mt = new Uint32Array(N); this.i = N + 1; this.semilla(semilla); }

  _iniciar(s) {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, p) + i) >>> 0;
    }
    this.i = N;
  }

  // random.seed(entero): Python usa el valor absoluto partido en pedazos de 32 bits
  semilla(n) {
    let v = BigInt(typeof n === 'bigint' ? n : Math.trunc(Number(n) || 0));
    if (v < 0n) v = -v;
    const clave = [];
    while (v > 0n) { clave.push(Number(v & 0xffffffffn)); v >>= 32n; }
    if (!clave.length) clave.push(0);
    this._iniciar(19650218);
    const mt = this.mt;
    let i = 1, j = 0;
    for (let k = Math.max(N, clave.length); k; k--) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(p, 1664525)) + clave[j] + j) >>> 0;
      i++; j++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
      if (j >= clave.length) j = 0;
    }
    for (let k = N - 1; k; k--) {
      const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(p, 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
    }
    mt[0] = 0x80000000;
  }

  _u32() {
    const mt = this.mt;
    if (this.i >= N) {
      let k = 0, y;
      for (; k < N - M; k++) { y = (mt[k] & 0x80000000) | (mt[k + 1] & 0x7fffffff); mt[k] = mt[k + M] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0); }
      for (; k < N - 1; k++) { y = (mt[k] & 0x80000000) | (mt[k + 1] & 0x7fffffff); mt[k] = mt[k + (M - N)] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0); }
      y = (mt[N - 1] & 0x80000000) | (mt[0] & 0x7fffffff);
      mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      this.i = 0;
    }
    let y = mt[this.i++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  random() {                                   // número entre 0 y 1, igual que random.random()
    const a = this._u32() >>> 5, b = this._u32() >>> 6;
    return (a * 67108864 + b) * (1 / 9007199254740992);
  }
  uniform(a, b) { return a + (b - a) * this.random(); }
  getrandbits(k) { return this._u32() >>> (32 - k); }      // k entre 1 y 32
  _randbelow(n) {
    const k = n.toString(2).length;
    let r = this.getrandbits(k);
    while (r >= n) r = this.getrandbits(k);
    return r;
  }
  choice(lista) { return lista[this._randbelow(lista.length)]; }
  randint(a, b) { return a + this._randbelow(b - a + 1); }
}
