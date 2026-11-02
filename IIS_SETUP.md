# Configuración de IIS y HTTPS para SIO System

## Archivos de configuración

### Frontend (React)
- **web.config**: Ubicado en `frontend/web.config` (ya creado)
  - Configura redirección HTTP → HTTPS
  - Configura routing de React Router
  - Headers de seguridad
  - Compresión gzip

### Backend (Node.js)
- El backend corre como servicio de Windows (usando PM2 o node-windows)
- No usa IIS directamente, pero puede usar IIS como reverse proxy

## Configuración en IIS Manager

### 1. Crear el sitio en IIS
1. Abrir **IIS Manager** (inetmgr)
2. Clic derecho en **Sites** → **Add Website**
3. Configurar:
   - **Site name**: SIO-Frontend
   - **Physical path**: `C:\inetpub\wwwroot\sio-frontend` (después de `npm run build`)
   - **Binding**: 
     - Type: https
     - IP address: All Unassigned
     - Port: 443
     - SSL certificate: (seleccionar certificado)

### 2. Configurar certificado SSL
#### Opción A: Certificado autofirmado (desarrollo)
```powershell
# Crear certificado autofirmado
New-SelfSignedCertificate -DnsName "localhost" -CertStoreLocation "cert:\LocalMachine\My"

# Importar en IIS
# IIS Manager → Server Certificates → Import
```

#### Opción B: Certificado de CA (producción)
1. Obtener certificado de autoridad certificada (Let's Encrypt, DigiCert, etc.)
2. En IIS Manager → **Server Certificates**
3. **Import** → seleccionar archivo .pfx
4. Asignar al binding del sitio

### 3. Configurar el Backend
El backend corre en puerto 4000. Para exponerlo por HTTPS:

#### Opción A: IIS Application Request Routing (ARR)
1. Instalar **URL Rewrite Module** y **Application Request Routing**
2. Crear sitio para backend con reverse proxy
3. Configurar regla de rewrite para redirigir a localhost:4000

#### Opción B: Usar PM2 con HTTPS directo
```bash
# Instalar PM2
npm install -g pm2

# Iniciar backend
pm2 start backend/src/server.js --name sio-backend

# Configurar HTTPS en el código (usando https module)
```

### 4. Configurar CORS en backend
En `backend/.env`:
```env
CORS_ORIGIN=https://tu-dominio.com
```

## Archivos de configuración de IIS (ubicación real)

Los archivos de configuración de IIS se encuentran en:
- **Sitios**: `C:\Windows\System32\inetsrv\config\applicationHost.config`
- **Aplicaciones**: `C:\inetpub\wwwroot\tu-sitio\web.config`

**NO editar directamente `applicationHost.config`**. Usar IIS Manager.

## Pasos para despliegue en producción

### 1. Build del frontend
```bash
cd frontend
npm run build
# Copiar contenido de dist/ a C:\inetpub\wwwroot\sio-frontend
```

### 2. Configurar servicio del backend
```bash
cd backend
npm install -g pm2-windows-startup
pm2-startup install
pm2 start src/server.js --name sio-backend
pm2 save
```

### 3. Configurar firewall
```powershell
# Permitir puerto 4000 (backend)
New-NetFirewallRule -DisplayName "SIO Backend" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow

# Permitir puerto 443 (HTTPS)
New-NetFirewallRule -DisplayName "HTTPS" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow
```

### 4. Configurar variables de entorno
En `backend\.env`:
```env
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://tu-dominio.com
DB_PATH=./data/sio.db
JWT_SECRET=tu-secreto-seguro-aqui
LDAP_URL=ldap://tu-servidor-ad.com
LDAP_BASE_DN=DC=empresa,DC=com
LDAP_DOMAIN=EMPRESA
LDAP_CA_CERT=C:\certs\lab-root-ca.pem
LDAP_BIND_USER=CN=sio-service,CN=Users,DC=empresa,DC=com
LDAP_BIND_PASSWORD=tu-password
MAIL_ENABLED=true
MAIL_HOST=smtp.empresa.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=sio@empresa.com
MAIL_PASSWORD=tu-password
MAIL_FROM=SIO <no-reply@empresa.com>
```

## Verificación

1. **Frontend**: https://tu-dominio.com
2. **Backend API**: https://tu-dominio.com/api/health (si usas reverse proxy)
3. **Backend directo**: http://localhost:4000/api/health

## Troubleshooting

### Error 502 Bad Gateway
- Verificar que el backend esté corriendo
- Verificar configuración de reverse proxy

### Error 403 Forbidden
- Verificar configuración CORS
- Verificar autenticación LDAP

### Certificado no confiable
- Instalar certificado raíz en los clientes
- Usar certificado de CA reconocida
