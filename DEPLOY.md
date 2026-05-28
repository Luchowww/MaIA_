# Guía de despliegue — MaIA (servidor on-premise)

> La base de datos sigue en **Supabase Cloud**. Lo que se instala en el servidor de la universidad es únicamente la aplicación (backend FastAPI + frontend React).

---

## Requisitos del servidor

| Requisito | Versión mínima |
|-----------|----------------|
| Ubuntu/Debian | 22.04 LTS |
| Python | 3.11+ |
| Node.js | 18+ |
| npm | 9+ |
| Nginx | cualquier versión reciente |
| Ollama | última versión estable |
| Tesseract OCR | 5.x |

---

## 1. Clonar el repositorio

```bash
git clone <URL_DEL_REPO>
cd MaIA_
```

---

## 2. Backend (FastAPI)

### 2.1 Crear entorno virtual e instalar dependencias

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2.2 Configurar variables de entorno

Crear el archivo `apps/api/.env`:

```env
DATABASE_URL=postgresql+asyncpg://[usuario]:[password]@[host-supabase-pooler]:5432/postgres
SUPABASE_URL=https://[PROJECT_REF].supabase.co
SUPABASE_KEY=eyJ...          # clave service_role (Settings > API)
SUPABASE_JWT_SECRET=...      # JWT secret (Settings > API)
OLLAMA_URL=http://localhost:11434
```

> **Nota sobre DATABASE_URL:** usar el host del **pooler** de Supabase (Session mode, puerto 5432) que se encuentra en Settings > Database > Connection string.

### 2.3 Marcar migraciones como aplicadas

La BD ya tiene las tablas creadas en Supabase — no ejecutar `upgrade head`.

```bash
cd apps/api
source .venv/bin/activate
alembic stamp head
```

### 2.4 Probar que el backend levanta

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

Debe responder en `http://localhost:8000/health` con `{"status":"ok"}`.

### 2.5 Configurar como servicio systemd

Crear `/etc/systemd/system/maia-api.service`:

```ini
[Unit]
Description=MaIA API
After=network.target

[Service]
User=www-data
WorkingDirectory=/ruta/absoluta/MaIA_/apps/api
ExecStart=/ruta/absoluta/MaIA_/apps/api/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable maia-api
sudo systemctl start maia-api
```

---

## 3. Frontend (React + Vite)

### 3.1 Instalar dependencias y compilar

```bash
cd apps/web
npm install
npm run build
```

Esto genera la carpeta `apps/web/dist/` con los archivos estáticos listos para producción.

### 3.2 Configurar variables de entorno ANTES del build

Crear `apps/web/.env` antes de correr `npm run build`:

```env
VITE_SUPABASE_URL=https://[PROJECT_REF].supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...     # clave anon/public (Settings > API)
VITE_API_URL=https://[dominio-o-IP-del-servidor]
```

> Las variables `VITE_*` se embeben en el build. Si cambian, hay que volver a correr `npm run build`.

---

## 4. Ollama (IA local)

### 4.1 Instalar

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 4.2 Descargar los modelos requeridos

```bash
ollama pull gemma3:4b        # extrae materias de la malla curricular
ollama pull nomic-embed-text # embeddings para el chat
```

### 4.3 Verificar que corre

```bash
ollama list
# debe mostrar gemma3:4b y nomic-embed-text
```

Ollama corre por defecto en `http://localhost:11434`, que es el valor por defecto de `OLLAMA_URL`.

---

## 5. Tesseract OCR

Necesario para leer PDFs escaneados e imágenes al importar la malla curricular.

```bash
sudo apt update
sudo apt install tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng
```

Verificar instalación:

```bash
tesseract --version
tesseract --list-langs   # debe mostrar spa y eng
```

---

## 6. Nginx — servir frontend y proxiar API

### 6.1 Instalar Nginx

```bash
sudo apt install nginx
```

### 6.2 Configurar el sitio

Crear `/etc/nginx/sites-available/maia`:

```nginx
server {
    listen 80;
    server_name [dominio-o-IP-del-servidor];

    # Frontend estático
    location / {
        root /ruta/absoluta/MaIA_/apps/web/dist;
        try_files $uri $uri/ /index.html;
    }

    # Proxy al backend FastAPI
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/maia /etc/nginx/sites-enabled/
sudo nginx -t          # verificar configuración
sudo systemctl reload nginx
```

### 6.3 Ajustar CORS en el backend

En `apps/api/main.py`, agregar el dominio del servidor a `allow_origins`:

```python
allow_origins=[
    "http://localhost:5173",
    "http://localhost:5174",
    "https://[dominio-del-servidor]",   # agregar este
]
```

Luego reiniciar el servicio:

```bash
sudo systemctl restart maia-api
```

---

## 7. Verificación final

| Verificación | URL / Comando |
|---|---|
| API saludable | `curl http://localhost:8000/health` |
| Frontend cargando | Abrir `http://[servidor]` en el navegador |
| OCR disponible | `GET /admin/curriculum/status` (requiere admin) |
| Modelos Ollama | `ollama list` |

---

## Resumen de puertos

| Puerto | Servicio |
|--------|----------|
| 80 | Nginx (frontend + proxy) |
| 8000 | FastAPI (interno, no exponer directamente) |
| 11434 | Ollama (interno, no exponer directamente) |

---

## Notas importantes

- **Supabase Auth** sigue siendo el proveedor de autenticación. El servidor solo almacena y procesa datos académicos.
- **Ollama** puede ser lento en la primera solicitud mientras carga el modelo en memoria. Es normal.
- Si se actualiza el código, el frontend requiere volver a correr `npm run build` y recargar Nginx.
- El backend se reinicia automáticamente con systemd si falla.
