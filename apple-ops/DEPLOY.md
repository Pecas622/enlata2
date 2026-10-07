# Deploy de APPLE OPS

La app se publica en Vercel y usa un proyecto de Supabase en la nube. Son pasos de una sola vez; después, cada merge a `main` se publica solo.

Lo que necesitás: una cuenta de Supabase, la cuenta de Vercel donde ya está `enlata2`, y Node 22 en tu compu para correr dos comandos.

## 1. Supabase

1. En [supabase.com/dashboard](https://supabase.com/dashboard), **New project**. Región: **South America (São Paulo)**, la más cercana a Mendoza. Guardá la contraseña de la base.
2. En **Authentication → Sign In / Providers → Email**:
   - Desactivá **Allow new users to sign up**: las cuentas las crea el Administrador desde Usuarios.
   - Desactivá **Confirm email** (las cuentas nuevas ya se crean confirmadas).
3. En **Authentication → URL Configuration**, poné como **Site URL** la dirección de la app en Vercel (paso 2), por ejemplo `https://apple-ops.vercel.app`.
4. Aplicá el esquema desde la carpeta `apple-ops` (solo las migraciones, nunca el seed de demo):

   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-del-proyecto>   # el ref está en la URL del dashboard
   npx supabase db push
   ```

   Esto crea tablas, permisos, funciones y el bucket público `fotos-equipos` para las fotos del catálogo.

   Sin instalar nada: en **SQL Editor** pegá y corré `supabase/produccion/base-parte-1.sql` y después, en otra query, `base-parte-2.sql`.
5. En **Project Settings → API** copiá la **Project URL**, la clave **anon** y la clave **service_role**. La service_role es secreta: va solo en Vercel y en tu compu, nunca en el repo ni en el navegador.

## 2. Vercel

El proyecto `enlata2` que ya existe publica la web de la raíz del repo. APPLE OPS va en un proyecto aparte:

1. **Add New → Project**, importá `Pecas622/enlata2` otra vez.
2. **Root Directory**: `apple-ops`. Vercel detecta Next.js solo.
3. **Environment Variables** (Production y Preview):

   | Variable | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL de Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clave anon |
   | `SUPABASE_SERVICE_ROLE_KEY` | clave service_role (marcala como Sensitive) |
   | `ANTHROPIC_API_KEY` | opcional: con esta clave el asistente del catálogo responde con IA |

4. **Deploy**. Las funciones corren en São Paulo (`vercel.json`), al lado de la base.
5. Si querés un dominio propio (por ejemplo `ops.enlata2.com`), agregalo en **Settings → Domains** y actualizá la Site URL de Supabase.

## 3. Primer local y primer administrador

Desde `apple-ops`, con las claves de producción en un archivo que no se commitea (por ejemplo `.env.produccion`, con las mismas tres variables de Supabase):

```bash
npm run crear-local -- --env .env.produccion \
  --local "Nombre del local" --link nombre-del-local \
  --nombre "Santiago" --email santiago@tulocal.com --pin 1234
```

Muestra una contraseña generada una sola vez (o usa la de `ADMIN_PASSWORD` si la definís). Con esa cuenta entrás a la app y desde ahí:

- **Configuración**: datos del local, cotización del dólar, garantías y la tabla de tasación del plan canje.
- **Usuarios**: el resto del equipo, con su rol y PIN.
- **Catálogo online**: WhatsApp de ventas, textos, fotos de los equipos y **Catálogo publicado** cuando esté listo (arranca pausado).

Para sumar otro local más adelante se corre el mismo comando con otro link y otro email: cada local ve solo sus datos.

## 4. Revisión después del deploy

- Entrar con el administrador y con un usuario de cada rol: el Vendedor no ve costos y el Cajero cuenta la caja a ciegas.
- Abrir y cerrar una caja de prueba, hacer una venta y anularla.
- Subir una foto en Catálogo online y verla en `/catalogo/<link>`.
- Si cargaste `ANTHROPIC_API_KEY`: en el catálogo, "Preguntanos" → "tenés iPhone 15?" y "quiero cotizar mi iPhone 13". En el panel, la sección del asistente dice "Responde con IA". Si la IA no responde, la charla sigue con el motor automático y queda un aviso en los logs de Vercel ("la IA no respondió").

## Cambios futuros

- Código: cada merge a `main` publica en Vercel; cada PR tiene su vista previa.
- Base de datos: las migraciones nuevas se aplican con `npx supabase db push` desde `apple-ops` **antes** de mergear la PR que las usa.
