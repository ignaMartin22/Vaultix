# 01 — Arquitectura y Stack

Spec de las capas de Vaultix, cómo se conectan y qué tecnología usa cada una. Lo que cuenta el `README.md` (producto) y las reglas de `AGENTS.md` (cómo trabajar) no se repiten acá: este documento suma las decisiones cerradas en el grilleo del 2026-11-04.

Documentos hermanos:

- [`02-backend.md`](02-backend.md): programa Anchor + Supabase + API routes.
- [`03-frontend.md`](03-frontend.md): web Next.js.
- [`04-tareas.md`](04-tareas.md): desglose de tareas atómicas.
- [`05-design.md`](05-design.md): sistema visual y de voz.

---

## 1. Alcance

- **Solo devnet.** El salto a mainnet-beta **no está contemplado para la demo**. No hay tareas de mainnet.
- MVP de 7 días, con 3 agentes trabajando en paralelo (ver `04-tareas.md`).
- La simpleza le gana a la completitud. Lo que quedó afuera está en la sección 9.

## 2. Diagrama de componentes

```
                    ┌────────────────────────────────────────────────┐
                    │               Vercel (Next.js)                 │
 Usuario ─────────► │  web/app  (UI, mobile-first)                   │
 (Privy: email,     │  web/app/api/*  (API routes = backend)         │
  Google o Phantom) │    ├─ /api/tx/sponsor   ← fee payer co-firma   │
                    │    ├─ /api/webhooks/helius ← indexa eventos    │
                    │    ├─ /api/cron/crank   ← Vercel Cron (diario) │
                    │    └─ /api/listings, /shipping, /disputes …    │
                    └───────┬──────────────────┬──────────────┬──────┘
                            │ service role     │ RPC          │ Resend
                            ▼                  ▼              ▼
                ┌──────────────────┐  ┌────────────────┐  ┌──────────┐
                │ Supabase Cloud   │  │ Helius (devnet)│  │  Mails   │
                │ Postgres + RLS   │  │ RPC + webhook  │  └──────────┘
                │ Storage (fotos,  │  └───────┬────────┘
                │ evidencia)       │          │
                └──────────────────┘          ▼
                                   ┌───────────────────────────┐
                                   │ vaultix_escrow (Anchor)   │
                                   │ Config · Order · Vault    │
                                   └───────────────────────────┘
```

**Fuente de verdad:**

| Dato | Dónde vive | Quién escribe |
| --- | --- | --- |
| Estado, montos, partes y plazos de la orden | Cuenta `Order` on-chain | Programa |
| Historial de transiciones | Tabla `order_events` (copia de los eventos) | Webhook de Helius |
| Producto, fotos, tracking, dirección y evidencia | Supabase | API routes (service role) |
| Reputación y métricas | Vistas SQL sobre `order_events` | Derivado |

El estado de una orden **siempre** se lee de la cuenta `Order` (o de sus eventos). Ninguna tabla de Supabase guarda el `status` de la orden.

## 3. Stack

| Capa | Tecnología | Notas |
| --- | --- | --- |
| Programa | Rust + Anchor (estable actual, fijada en `Anchor.toml` y `Cargo.toml`) | `anchor_spl::token_interface`, `transfer_checked` |
| Tests del programa | **Rust + LiteSVM** (`litesvm` + `litesvm-token` 0.15, validador en proceso con control del reloj) | Ver `02-backend.md` §1.9 |
| Red | Solana **devnet** | Mint: USDC de devnet de Circle |
| RPC | **Helius**, plan gratis | `NEXT_PUBLIC_SOLANA_RPC` |
| Web | Next.js (App Router) + TypeScript estricto | Desplegado en **Vercel** |
| Cliente del programa | `@solana/web3.js` **1.x** + `@anchor-lang/core` (cliente TS de Anchor 1.x) con el IDL generado | Centralizado en `web/lib/vaultix/`. `@anchor-lang/core` exige web3.js `^1.69`: no subir a web3.js 2+/3+. `@solana/kit` está solo porque lo pide Privy para Solana |
| Auth y cuentas | **Privy**: email/Google con cuenta Solana embebida; Phantom/Solflare con el mismo SDK | Sin Wallet Adapter aparte |
| Estilos | Tailwind CSS v4 con `@theme` mapeado a `styles/tokens.css` | Sin librería de componentes |
| Estado asíncrono | TanStack Query | |
| Efecto hero | **vgpu** (WebGPU, WGSL) con fallback CSS | Solo el hero Spectral |
| Base de datos | **Supabase Cloud**: Postgres + Storage | RLS en todas las tablas |
| Indexado | Webhook de Helius → `/api/webhooks/helius` | |
| Mails | **Resend** | |
| Cotización USDC→ARS | API de **CriptoYa** con caché de 5 minutos | Solo de referencia |
| Tests web | Vitest (solo `web/lib/`) | Sin E2E automatizado |
| Gestor de paquetes | pnpm workspace (raíz + `web/`) | |

Las versiones exactas se fijan en la tarea de setup (`C-01`) con la estable vigente y no se cambian sin motivo.

## 4. Layout del repo

Sigue la estructura de `AGENTS.md`, más:

```
/
├── pnpm-workspace.yaml     # paquetes: "." (tests/scripts) y "web"
├── package.json            # deps de scripts/ (seed, sync-idl)
├── specs/                  # este kit
├── programs/vaultix_escrow/
├── programs/vaultix_escrow/tests/  # tests en Rust (LiteSVM)
├── scripts/                # seed-devnet.ts, etc.
├── supabase/migrations/
└── web/
    ├── app/api/            # backend (ver 02-backend.md §3)
    ├── lib/vaultix/        # IDL, tipos y cliente del programa (copiado de target/ por script)
    ├── lib/server/         # helpers server-only: privy, supabase, fee payer
    └── styles/tokens.css
```

El IDL (`target/idl/vaultix_escrow.json`) y sus tipos (`target/types/vaultix_escrow.ts`) se copian a `web/lib/vaultix/` con `pnpm sync-idl`, un script de la raíz. Se versionan en el repo para que el build de Vercel no necesite Anchor.

## 5. Flujos entre capas

### 5.1 Transacción patrocinada (todas las instrucciones de usuario)

Los usuarios no tienen SOL. Un **fee payer** del backend paga las comisiones de red y la renta.

1. La web arma la transacción con `feePayer = FEE_PAYER_PUBKEY` (pública, desde env) y un blockhash reciente.
2. El usuario firma parcialmente con Privy (`signTransaction`, sin enviar).
3. La web hace `POST /api/tx/sponsor` con la transacción serializada y el token de acceso de Privy.
4. La API valida (§6), co-firma con la keypair del fee payer, envía y devuelve la firma.
5. La web confirma con commitment `confirmed`. Si el blockhash expiró, vuelve al paso 1 (máximo 3 intentos).

### 5.2 Alta de un link (vendedor)

1. `POST /api/listings`: crea un borrador y devuelve URLs firmadas de subida para las fotos.
2. La web sube las fotos a Storage, calcula `listing_hash` (ver `02-backend.md` §2.4) y genera un `order_id` u64 aleatorio.
3. Transacción patrocinada: `createAssociatedTokenAccountIdempotent` (ATA del vendedor) + `create_order(order_id, amount, listing_hash)`.
4. `POST /api/listings/:id/activate { orderPda }`: la API lee la `Order` on-chain, verifica `seller`, `amount` y `listing_hash`, y pasa el producto a `listed`.
5. El link es `/p/<orderPda>`.

Si `create_order` choca con un `order_id` existente, la web genera otro y reintenta.

### 5.3 Pago (comprador)

1. Abre `/p/<orderPda>` y ve producto, monto, plazos y reglas de disputa **antes** de pagar.
2. Inicia sesión con Privy. Si no le alcanza el saldo de USDC, ve el modal "Cargá saldo".
3. Carga sus datos de envío (`POST /api/shipping`).
4. Transacción patrocinada: `pay()`. El primero que paga queda como `buyer`.

### 5.4 Indexado

Helius manda un webhook (raw) con cada transacción que toca el programa. `/api/webhooks/helius` verifica el header de autorización, decodifica los eventos Anchor de los logs (`Program data:`) con el `EventParser` del IDL e inserta en `order_events` de forma idempotente. Cada evento nuevo dispara el mail correspondiente (Resend).

### 5.5 Plazos vencidos (crank)

- `release` y `refund_unshipped` son **permissionless**.
- **Vercel Cron diario** → `GET /api/cron/crank` (protegido con `CRON_SECRET`). Busca con `getProgramAccounts` (memcmp sobre `status`) las órdenes `Paid` con el envío vencido y las `Shipped` con el reclamo vencido, y ejecuta la instrucción firmando con el fee payer.
- La UI también muestra un botón ("Liberar pago" / "Pedir reembolso") cuando el plazo venció, así que no hace falta esperar al cron.
- `close_order` en estados finales también es permissionless, y el cron cierra las órdenes finales para recuperar la renta.

### 5.6 Disputa

1. El comprador abre la disputa dentro de `claim_window` y paga el depósito (transacción patrocinada `open_dispute`).
2. Ambas partes suben evidencia (`/api/disputes/:pda/evidence` → bucket privado).
3. El árbitro entra a `/admin/disputes` con la cuenta Phantom del equipo (conectada vía Privy), revisa y firma `resolve_dispute(buyer_share_bps)`. Esa transacción la paga el árbitro, que tiene SOL; no pasa por el sponsor.

## 6. Fee payer: reglas anti-abuso

`/api/tx/sponsor` solo co-firma si se cumple todo esto:

1. El token de Privy es válido y la cuenta firmante pertenece a ese usuario de Privy.
2. El fee payer **no** aparece en ninguna instrucción salvo como `payer` o `rent_payer` (nunca como origen de una transferencia de tokens ni de SOL).
3. Todas las instrucciones pertenecen a una allowlist: `vaultix_escrow` (`create_order`, `pay`, `mark_shipped`, `confirm_receipt`, `release`, `refund_unshipped`, `open_dispute`, `close_order`), `ComputeBudget` y `AssociatedToken::CreateIdempotent`.
4. Rate limit: `SPONSOR_DAILY_LIMIT` transacciones por usuario de Privy y por día UTC (valor por defecto: **20**), contadas en la tabla `sponsor_usage`.

La keypair del fee payer vive solo en `FEE_PAYER_SECRET_KEY` (env de servidor de Vercel). Es exclusiva de devnet.

## 7. Variables de entorno

| Variable | Dónde | Valor por defecto / nota |
| --- | --- | --- |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | web | `devnet` |
| `NEXT_PUBLIC_SOLANA_RPC` | web | URL de Helius devnet |
| `NEXT_PUBLIC_PROGRAM_ID` | web | ID del programa desplegado |
| `NEXT_PUBLIC_USDC_MINT` | web | Mint de USDC devnet de Circle |
| `NEXT_PUBLIC_FEE_PAYER_PUBKEY` | web | Pubkey del fee payer |
| `NEXT_PUBLIC_PRIVY_APP_ID` | web | |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web | Solo lecturas públicas |
| `PRIVY_APP_SECRET` | servidor | |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor | |
| `FEE_PAYER_SECRET_KEY` | servidor | JSON del keypair de devnet |
| `SPONSOR_DAILY_LIMIT` | servidor | `20` |
| `HELIUS_WEBHOOK_AUTH` | servidor | Header compartido con el webhook |
| `CRON_SECRET` | servidor | Lo usa Vercel Cron |
| `RESEND_API_KEY`, `MAIL_FROM` | servidor | |
| `CRIPTOYA_EXCHANGE` | servidor | `lemoncash` |
| `ARBITER_EMAIL` | servidor | Recibe los avisos de disputa |
| `ARBITER_PUBKEY` | scripts | Pubkey de la Phantom del equipo para `initialize_config` |
| `NEXT_PUBLIC_USE_MOCK` | web | `true` hasta la tarea `X-01` (cliente mock del contrato) |

`web/.env.example` lista todas sin valores. `.env*` (salvo `.env.example`) va en `.gitignore` desde el primer commit.

## 8. Valores por defecto del protocolo

Viven en la cuenta `Config` (se pueden cambiar con `update_config`) y **se copian a cada orden al crearla**: las reglas que vio el comprador antes de pagar no cambian a mitad de camino.

| Parámetro | Default | Límite |
| --- | --- | --- |
| `fee_bps` (comisión) | 150 (1,5%) | ≤ `MAX_FEE_BPS` = 500 |
| `dispute_deposit_bps` | 500 (5%) | ≤ `MAX_DISPUTE_DEPOSIT_BPS` = 2000 |
| `ship_deadline_secs` | 5 días (432 000) | > 0 |
| `claim_window_secs` | 10 días desde `mark_shipped` (864 000) | > 0 |
| `max_order_amount` | 500 USDC (500 000 000 unidades) | > 0 |

## 9. Fuera del MVP

- Mainnet-beta: sin tareas ni deploy.
- Tracking **obligatorio** e integración con APIs de correos. En el MVP el `tracking_hash` es opcional; en el producto final debe ser obligatorio.
- Verificación por teléfono o DNI.
- Bloqueo de compradores por reputación.
- Perfil público y dashboard de métricas públicas.
- On-ramp integrado (compra con tarjeta).
- E2E automatizado (el E2E es manual, el día 5).
- Slugs cortos de link (`/p/k3n9x` como en el manual): en el MVP el link usa la pubkey de la PDA.
