# Checklist de migración a mainnet-beta

Pasos para llevar Vaultix de devnet a la red real. El orden importa: primero el contrato, después la infraestructura y al final la apertura.

Plan sugerido: una **beta con tope bajo** (50–100 USDC por orden), con pocos vendedores conocidos.

## 1. Contrato: cambios antes de desplegar

- [ ] **Restringir `initialize_config`** a la upgrade authority del programa. Hoy cualquiera puede llamarla primero y quedar como admin (Preguntas abiertas del `README.md`).
- [ ] **Plazo máximo para resolver una disputa**, con un resultado por defecto (reembolso o 50/50) si el árbitro no decide. Hoy, si el árbitro no resuelve, la plata queda trabada en `Disputed`.
- [ ] Tests nuevos para los dos puntos (`cargo test -p vaultix_escrow`) y clippy limpio.
- [ ] Repetir la revisión de `specs/program-review.md` sobre el código final.
- [ ] **Auditoría externa**, o al menos una revisión de alguien de afuera del equipo, antes de subir el tope.

## 2. Llaves y cuentas

- [ ] **Upgrade authority** en una wallet aparte del admin, idealmente un multisig (por ejemplo Squads). Nunca en la misma máquina que el fee payer.
- [ ] **Admin** (`update_config`): una wallet propia, guardada offline.
- [ ] **Árbitro**: la Phantom del equipo, que no sea la del admin.
- [ ] **Fee payer nuevo** solo para mainnet, con un saldo acotado y una alerta de saldo bajo. El secreto va solo en Vercel (sensible), nunca en el repo.
- [ ] Anotar las pubkeys (no los secretos) en `specs/01-arquitectura.md`.

## 3. Despliegue del programa

- [ ] SOL para el deploy: el `.so` pesa unos 330 KB, así que el rent del programa ronda **2,3 SOL**. Además el deploy usa un buffer temporal que se recupera al terminar. Calcularlo de nuevo con el binario final.
- [ ] Build en CI (no en la máquina local) y deploy con `solana program deploy` a mainnet-beta.
- [ ] Verificar el build: `solana-verify` o un build reproducible, para que cualquiera compare el código con lo desplegado.
- [ ] `initialize_config` con los valores de mainnet:
  - USDC de Circle: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
  - `fee_bps` 150 (1,5%), `dispute_deposit_bps` 500 (5%)
  - `ship_deadline_secs` 432 000 (5 días), `claim_window_secs` 604 800 (7 días)
  - `max_order_amount`: tope bajo para la beta (50–100 USDC)
  - `arbiter`: la Phantom del equipo
- [ ] Pasar la upgrade authority al multisig.

## 4. Infraestructura

- [ ] **Supabase:** un proyecto nuevo para mainnet (no mezclar con los datos de prueba). Correr las migraciones de `supabase/migrations`.
- [ ] **Helius:** API key de mainnet, RPC de mainnet y un webhook nuevo con `pnpm helius:webhook` apuntando al programa nuevo.
- [ ] **Vercel**, variables de Production:
  - `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`
  - `NEXT_PUBLIC_SOLANA_RPC` (Helius mainnet)
  - `NEXT_PUBLIC_PROGRAM_ID` (el nuevo)
  - `NEXT_PUBLIC_USDC_MINT` (el de Circle)
  - `FEE_PAYER_SECRET_KEY` y `NEXT_PUBLIC_FEE_PAYER_PUBKEY` (el fee payer nuevo)
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (el proyecto nuevo)
  - `HELIUS_API_KEY` y un `HELIUS_WEBHOOK_AUTH` nuevo
  - `CRON_SECRET` nuevo
- [ ] Revisar que los scripts que hoy rechazan mainnet (`backfill-events`, `set-deadlines`) tengan una versión explícita para mainnet o queden solo para devnet.
- [ ] **Cron** diario (`/api/cron/crank`) activo y con alerta si falla.

## 5. Dominio, login y mails

- [ ] Comprar el dominio y conectarlo a Vercel.
- [ ] **Privy:** agregar el dominio a los permitidos y revisar los métodos de login para producción.
- [ ] **Resend:** verificar el dominio (registros DNS) y cambiar `MAIL_FROM` a `Vaultix <avisos@dominio>`. Sin esto los mails solo le llegan al dueño de la cuenta de Resend.
- [ ] `ARBITER_EMAIL` con el mail del equipo que atiende reclamos.

## 6. Legal y operación

- [ ] Consulta legal: comisiones, arbitraje de disputas y si aplica alguna regulación de pagos o de activos digitales.
- [ ] Términos y condiciones y política de privacidad (datos de envío, mails, evidencia).
- [ ] Proceso de reclamos: quién los atiende, en cuánto tiempo y cómo se registra cada decisión.
- [ ] Plan ante un bug: cómo pausar (bajar `max_order_amount` con `update_config`) y a quién se avisa.

## 7. Pruebas en mainnet antes de abrir

- [ ] El ciclo completo con montos chicos (1–2 USDC): crear, pagar, despachar, confirmar y cobrar.
- [ ] Cancelar un link y verificar que el rent vuelve al fee payer. Lo mismo con una orden terminada: el cron diario la cierra con `close_order` y el rent vuelve.
- [ ] Una orden ya cerrada por el cron sigue mostrando su resultado en `/p/<orden>` y en Mis operaciones. Hoy el link muestra "Este link no existe o ya no está disponible": falta leer el resultado de `order_events` cuando la cuenta ya no existe.
- [ ] Reembolso por falta de despacho y liberación automática por el cron (con plazos cortos en una config de prueba, o esperando los reales).
- [ ] Disputa con reparto y verificación de los montos, la comisión y el depósito.
- [ ] Carga desde Bitso por la red Solana y retiro a Phantom.
- [ ] Llegan los mails a un usuario que no es del equipo.
- [ ] Recién después: invitar a los primeros vendedores.
