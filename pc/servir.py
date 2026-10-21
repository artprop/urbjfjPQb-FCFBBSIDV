# Abre Estudio BBS en la PC: sirve la carpeta www en http://localhost y lo abre en su propia ventana.
# Todo el programa corre dentro de esa ventana; esto entrega los archivos y suma dos cosas que solo hay en la PC:
#   /pc/guardar  -> guarda lo que se genera en la carpeta Salida (al lado de este archivo)
#   /pc/rhubarb  -> bocas exactas con Rhubarb (programa de Windows)
# Al abrir, busca una version nueva en GitHub y la baja sola (se puede saltear apretando una tecla, y no hace falta internet).
# Cuando se cierra la ventana del programa, esta caja negra se cierra sola. No escribe nunca en la carpeta de Minecraft.
import hashlib
import http.server
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import shutil
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
import zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(AQUI, 'www')
SALIDA = os.path.join(AQUI, 'Salida')
CACHE = os.path.join(AQUI, 'cache')
PUERTO = int(os.environ.get('ESTUDIO_PUERTO') or 8780)
# actualizacion automatica (las direcciones se pueden cambiar con variables de entorno, para probar)
URL_VERSION = os.environ.get('ESTUDIO_URL_VERSION') or 'https://raw.githubusercontent.com/artprop/urbjfjPQb-FCFBBSIDV/main/index.html'
URL_ZIP = os.environ.get('ESTUDIO_URL_ZIP') or 'https://github.com/artprop/urbjfjPQb-FCFBBSIDV/archive/refs/heads/main.zip'
ESPERA_VERSION = float(os.environ.get('ESTUDIO_ESPERA_VERSION') or 6)     # segundos para saber si hay version nueva
ESPERA_TOTAL = float(os.environ.get('ESTUDIO_ESPERA_TOTAL') or 90)        # segundos maximos para bajarla
GRACIA_ADIOS = float(os.environ.get('ESTUDIO_GRACIA_ADIOS') or 6)         # tras cerrar la ventana, espera esto por si fue un "recargar"
GRACIA_SIN_LATIDO = float(os.environ.get('ESTUDIO_GRACIA_LATIDO') or 120)  # si la ventana deja de avisar (pestana dormida)
GRACIA_SIN_VENTANA = float(os.environ.get('ESTUDIO_GRACIA_INICIO') or 180) # si nunca se abrio ninguna ventana
RHUBARB_DIR = 'Rhubarb-Lip-Sync-1.14.0-Windows'
# Rhubarb: el de esta carpeta, o el que ya tiene el Director al lado
RHUBARB = next((p for p in (os.path.join(AQUI, 'herramientas', RHUBARB_DIR, 'rhubarb.exe'),
                            os.path.join(AQUI, '..', 'Director', 'herramientas', RHUBARB_DIR, 'rhubarb.exe'))
                if os.path.isfile(p)), None)

# tipos fijos: en Windows el registro a veces dice text/plain para .mjs y el navegador no lo carga
TIPOS = {'.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json',
         '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.task': 'application/octet-stream'}


# ---------- ventanas abiertas (la pagina avisa cada 5 s con /pc/latido y al cerrar con /pc/adios) ----------
VENTANAS = {}           # id -> ultimo aviso
ESTADO = {'vacia_desde': None, 'hubo': False}
CANDADO = threading.Lock()


def ventana_latido(i):
    with CANDADO:
        VENTANAS[i] = time.monotonic()
        ESTADO['hubo'] = True
        ESTADO['vacia_desde'] = None


def ventana_adios(i):
    with CANDADO:
        VENTANAS.pop(i, None)
        if ESTADO['hubo'] and not VENTANAS and ESTADO['vacia_desde'] is None:
            ESTADO['vacia_desde'] = time.monotonic()


def vigilar(srv, inicio):
    """Cierra el servidor (y con eso la caja negra) cuando ya no queda ninguna ventana abierta."""
    while True:
        time.sleep(0.5)
        ahora = time.monotonic()
        with CANDADO:
            for i, t in list(VENTANAS.items()):
                if ahora - t > GRACIA_SIN_LATIDO:
                    del VENTANAS[i]
                    if not VENTANAS:
                        ESTADO['vacia_desde'] = ahora - GRACIA_ADIOS   # ya esperó de más
            cerrar = (ESTADO['vacia_desde'] is not None and not VENTANAS and ahora - ESTADO['vacia_desde'] >= GRACIA_ADIOS) \
                or (not ESTADO['hubo'] and ahora - inicio > GRACIA_SIN_VENTANA)
        if cerrar:
            srv.shutdown()
            return


# ---------- actualizacion automatica desde GitHub ----------
def version_de(texto):
    m = re.search(r'v\.(\d+)', texto or '')
    return int(m.group(1)) if m else None


def version_local():
    try:
        with open(os.path.join(WWW, 'index.html'), encoding='utf-8', errors='replace') as f:
            return version_de(f.read(20000))
    except OSError:
        return None


def tecla_apretada():
    if os.environ.get('ESTUDIO_TEST_TECLA'):   # solo para pruebas: simula apretar una tecla a los N segundos
        return time.monotonic() - T0 >= float(os.environ['ESTUDIO_TEST_TECLA'])
    try:
        import msvcrt
        if msvcrt.kbhit():
            msvcrt.getch()
            return True
    except ImportError:
        pass
    return False


T0 = time.monotonic()


class Cancelado(Exception):
    pass


def pedir(url, plazo):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'EstudioBBS', 'Cache-Control': 'no-cache'}), timeout=plazo)


def bajar_zip(destino, cancelar, limite):
    """Baja el zip a un archivo temporal mostrando el avance. Corta si se cancela o se pasa del limite."""
    inicio = time.monotonic()
    with pedir(URL_ZIP, 15) as r, open(destino, 'wb') as f:
        total = int(r.headers.get('Content-Length') or 0)
        hecho = 0
        while True:
            if cancelar.is_set():
                raise Cancelado('cancelado')
            if time.monotonic() - inicio > limite:
                raise Cancelado('tardó demasiado')
            trozo = r.read(65536)
            if not trozo:
                break
            f.write(trozo)
            hecho += len(trozo)
            print(f'\r  Bajando… {hecho // 1024} KB' + (f' de {total // 1024} KB' if total else '') + '   ', end='', flush=True)
    print()


def instalar(zip_ruta, aqui):
    """Descomprime en una carpeta aparte, la revisa y recien despues copia a www (index.html al final)."""
    prueba = os.path.join(aqui, '_actualizando')
    shutil.rmtree(prueba, ignore_errors=True)
    try:
        with zipfile.ZipFile(zip_ruta) as z:
            if z.testzip() is not None:
                raise RuntimeError('el zip bajado está dañado')
            z.extractall(prueba)
        carpetas = [d for d in os.listdir(prueba) if os.path.isdir(os.path.join(prueba, d))]
        raiz = os.path.join(prueba, carpetas[0]) if len(carpetas) == 1 and not os.path.isfile(os.path.join(prueba, 'index.html')) else prueba
        if not os.path.isfile(os.path.join(raiz, 'index.html')) or version_de(open(os.path.join(raiz, 'index.html'), encoding='utf-8', errors='replace').read(20000)) is None:
            raise RuntimeError('lo bajado no parece Estudio BBS')
        archivos = []
        for base, dirs, nombres in os.walk(raiz):
            dirs[:] = [d for d in dirs if d != '.git' and not (base == raiz and d == 'pc')]   # pc/ es de la PC (este mismo programa): no se toca solo
            for n in nombres:
                if n == '.nojekyll':
                    continue
                ruta = os.path.join(base, n)
                archivos.append((ruta, os.path.relpath(ruta, raiz)))
        archivos.sort(key=lambda a: a[1] == 'index.html')   # index.html al final: si se corta, la proxima vez se reintenta
        os.makedirs(WWW, exist_ok=True)
        for ruta, rel in archivos:
            dest = os.path.join(WWW, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            tmp = dest + '.nuevo'
            shutil.copyfile(ruta, tmp)
            os.replace(tmp, dest)
        return len(archivos)
    finally:
        shutil.rmtree(prueba, ignore_errors=True)


def actualizar(aqui=AQUI):
    """Busca y baja la ultima version. Nunca tira error: si algo falla se abre con lo que ya hay."""
    if '--sin-internet' in sys.argv or os.path.isfile(os.path.join(aqui, 'sin_internet.txt')) or os.environ.get('ESTUDIO_SIN_INTERNET'):
        print('Modo sin internet: no se busca nada nuevo.')
        return
    print('Buscando una versión nueva… (apretá cualquier tecla para saltear)')
    cancelar = threading.Event()
    resultado = {}

    def trabajo():
        try:
            with pedir(URL_VERSION, ESPERA_VERSION) as r:
                remota = version_de(r.read(20000).decode('utf-8', 'replace'))
            resultado['remota'] = remota
            local = version_local()
            if remota is None or (local is not None and remota <= local):
                return
            print(f'  Hay una versión nueva (v.{remota:03d}; acá tenés ' + (f'v.{local:03d}' if local else 'ninguna') + ').')
            tmp = os.path.join(aqui, '_descarga.zip')
            try:
                bajar_zip(tmp, cancelar, ESPERA_TOTAL)
                n = instalar(tmp, aqui)
                resultado['ok'] = n
            finally:
                try:
                    os.remove(tmp)
                except OSError:
                    pass
        except Cancelado as e:
            resultado['salto'] = str(e)
        except Exception as e:
            resultado['error'] = str(getattr(e, 'reason', None) or e)

    h = threading.Thread(target=trabajo, daemon=True)
    h.start()
    inicio = time.monotonic()
    while h.is_alive():
        if tecla_apretada():
            cancelar.set()
            resultado.setdefault('salto', 'saltado con una tecla')
            break
        # si ni siquiera se pudo saber la version en el plazo, no se espera mas
        if 'remota' not in resultado and time.monotonic() - inicio > ESPERA_VERSION + 1:
            cancelar.set()
            resultado.setdefault('salto', 'no hay respuesta de internet')
            break
        time.sleep(0.1)
    h.join(1.5)
    if 'ok' in resultado:
        print(f'  Actualizado ({resultado["ok"]} archivos).')
    elif 'salto' in resultado:
        print('  Sigo con la versión que ya tenés (' + resultado['salto'] + ').')
    elif 'error' in resultado:
        print('  No pude actualizar (' + resultado['error'] + '). Sigo con la versión que ya tenés.')
    else:
        print('  Ya tenés la última versión.')


def nombre_seguro(n):
    n = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', n).strip(' .')
    return n or 'archivo'


def rhubarb(datos):
    """Corre Rhubarb sobre un .wav y devuelve su JSON (guardado en cache por contenido)."""
    h = hashlib.sha1(datos).hexdigest()[:16]
    os.makedirs(CACHE, exist_ok=True)
    salida = os.path.join(CACHE, f'rhubarb_{h}.json')
    if not os.path.isfile(salida):
        fd, wav = tempfile.mkstemp(suffix='.wav')
        with os.fdopen(fd, 'wb') as f:
            f.write(datos)
        try:
            r = subprocess.run([RHUBARB, '-r', 'phonetic', '-f', 'json', '--extendedShapes', 'GHX', '-q', '-o', salida, wav],
                               capture_output=True, text=True, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            if r.returncode != 0 or not os.path.isfile(salida):
                raise RuntimeError('Rhubarb fallo: ' + (r.stderr or r.stdout or '').strip()[-400:])
        finally:
            os.remove(wav)
    with open(salida, encoding='utf-8') as f:
        return json.load(f)


class Manejador(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **TIPOS}

    def __init__(self, *a, **k):
        super().__init__(*a, directory=WWW, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')   # siempre la version nueva despues de actualizar
        super().end_headers()

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def _ventana(self, u):
        i = urllib.parse.parse_qs(u.query).get('id', [''])[0][:40]
        if i:
            (ventana_latido if u.path == '/pc/latido' else ventana_adios)(i)
        return self._json({'ok': True})

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path == '/pc/hola':
            return self._json({'pc': True, 'rhubarb': bool(RHUBARB), 'salida': SALIDA})
        if u.path in ('/pc/latido', '/pc/adios'):
            return self._ventana(u)
        if u.path == '/pc/abrir_salida':
            os.makedirs(SALIDA, exist_ok=True)
            if hasattr(os, 'startfile'):
                os.startfile(SALIDA)
            return self._json({'ok': True})
        return super().do_GET()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        datos = self.rfile.read(int(self.headers.get('Content-Length') or 0))
        try:
            if u.path in ('/pc/latido', '/pc/adios'):
                return self._ventana(u)
            if u.path == '/pc/guardar':
                modo = nombre_seguro(q.get('modo', ['otros'])[0])
                nombre = nombre_seguro(q.get('nombre', ['salida'])[0])
                carpeta = os.path.join(SALIDA, modo)
                if q.get('carpeta'):   # una subcarpeta (por ejemplo, un modelo con su .obj y su .png); con "/" se arman subcarpetas adentro de subcarpetas
                    for tramo in q['carpeta'][0].split('/'):
                        if tramo.strip(' .'):
                            carpeta = os.path.join(carpeta, nombre_seguro(tramo))
                os.makedirs(carpeta, exist_ok=True)
                ruta = os.path.join(carpeta, nombre)
                with open(ruta, 'wb') as f:
                    f.write(datos)
                return self._json({'ok': True, 'ruta': ruta})
            if u.path == '/pc/rhubarb':
                if not RHUBARB:
                    return self._json({'error': 'No encuentro Rhubarb (carpeta herramientas).'}, 404)
                return self._json(rhubarb(datos))
            return self._json({'error': 'no existe'}, 404)
        except Exception as e:   # el error se muestra en la ventana
            return self._json({'error': str(e)}, 500)


def libre(p):
    with socket.socket() as s:
        return s.connect_ex(('127.0.0.1', p)) != 0


def buscar_navegador():
    rutas = []
    for base in (os.environ.get('ProgramFiles(x86)'), os.environ.get('ProgramFiles'), os.environ.get('LOCALAPPDATA')):
        if base:
            rutas += [os.path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
                      os.path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe')]
    return next((r for r in rutas if os.path.isfile(r)), None)


def abrir_ventana(url):
    nav = buscar_navegador()
    if nav:
        try:
            subprocess.Popen([nav, f'--app={url}', '--window-size=1400,900'])
            return
        except OSError:
            pass
    webbrowser.open(url)   # sin Edge ni Chrome: navegador comun


def main():
    p = PUERTO
    url = f'http://localhost:{p}/'
    if not libre(p):   # ya esta abierto: solo abrir otra ventana
        abrir_ventana(url)
        return
    if '--sin-actualizar' not in sys.argv:
        try:
            actualizar()
        except Exception as e:
            print('  No pude actualizar:', e)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', p), Manejador)
    print(f'Estudio BBS abierto en {url}\nEsta ventana se cierra sola cuando cerrás el programa.')
    threading.Thread(target=vigilar, args=(srv, time.monotonic()), daemon=True).start()
    if '--sin-ventana' not in sys.argv:
        threading.Timer(0.5, lambda: abrir_ventana(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    sys.exit(main())
