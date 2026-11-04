# 04 — Desglose de Tareas Atómicas

DAG de tareas para **3 agentes en paralelo**. Cada tarea es **un PR chico** (2–4 h).

| Frente | Prefijo | Alcance |
| --- | --- | --- |
| Común | `C-` | Setup y contrato. Bloquea a todos |
| Programa | `P-` | `programs/`, `tests/`, `scripts/` |
| Backend | `B-` | `supabase/`, `web/app/api/`, `web/lib/server/` |
| Web | `W-` | `web/app/` (páginas), `web/components/`, `web/lib/` (cliente) |
| Integración | `X-` | Cruza frentes |

## Reglas para el agente

1. Tomá solo tareas cuyas dependencias estén **mergeadas**.
2. Tocá solo los archivos listados. Si necesitás otro, anotalo en el PR.
3. La tarea está terminada cuando **pasa el comando de verificación** y se cumple el criterio de aceptación.
4. Commit con el mensaje sugerido (Conventional Commits, en inglés).
5. Si algo del spec no cierra, no lo inventes: anotalo en "Preguntas abiertas" del README y avisá.
6. **Contrato primero:** hasta `X-01`, web y backend usan el contrato de `C-02` con mocks tipados. Nadie cambia el contrato sin actualizar `02-backend.md` y avisar a los otros frentes.

Formato de cada tarea: **ID · título** — depende de · archivos · aceptación · verificación · commit.

---

## Día 1: setup, contrato y núcleo del programa

### C-01 · Bootstrap del repo
- **Depende de:** —
- **Archivos:** `.gitignore`, `pnpm-workspace.yaml`, `package.json`, `Anchor.toml`, `Cargo.toml`, `programs/vaultix_escrow/` (esqueleto `anchor init`), `web/` (`create-next-app`, TS estricto, App Router, Tailwind v4, ESLint), `web/.env.example`, `.prettierrc`.
- **Aceptación:** `.gitignore` cubre `.env*` (salvo `.env.example`), `target/`, `**/*-keypair.json`, `node_modules/` y `.vercel/`. `Anchor.toml` usa `cluster = "devnet"`. Versiones fijadas. `.env.example` tiene todas las variables de 01 §7, sin valores.
- **Verificación:** `anchor build` · `cd web && pnpm lint && pnpm typecheck && pnpm build`.
- **Commit:** `chore: bootstrap anchor workspace and next app`

### C-02 · Congelar el contrato
- **Depende de:** C-01
- **Archivos:** `web/lib/vaultix/contract.ts` (tipos TS escritos a mano: `OrderStatus`, `OrderAccount`, `ConfigAccount`, args de cada instrucción, eventos, códigos de error, según 02 §1), `web/lib/vaultix/mock.ts` (cliente mock en memoria con la misma interfaz que el real: `getOrder`, `getConfig`, `buildCreateOrderTx`, …), `web/lib/vaultix/pdas.ts`.
- **Aceptación:** la interfaz del cliente (`VaultixClient`) cubre todas las instrucciones y lecturas que usan B y W. El mock implementa la máquina de estados y respeta los plazos.
- **Verificación:** `pnpm typecheck` · `pnpm test` (tests del mock).
- **Commit:** `feat(web): define program contract types and mock client`

### P-01 · Estado, errores, eventos y constantes
- **Depende de:** C-01
- **Archivos:** `programs/vaultix_escrow/src/{lib.rs,state.rs,errors.rs,events.rs,constants.rs}`.
- **Aceptación:** `Config` y `Order` según 02 §1.2 (`status` primero) con `InitSpace`. Todos los errores y eventos de 02 §1.6–1.7.
- **Verificación:** `anchor build` · `cargo clippy --all-targets -- -D warnings` · `cargo fmt --check`.
- **Commit:** `feat(program): add state, errors and events`

### P-02 · Harness de tests con LiteSVM
- **Depende de:** P-01
- **Archivos:** `tests/helpers/{svm.ts,mint.ts,clock.ts,accounts.ts}`, `tests/smoke.test.ts`, `package.json` (scripts).
- **Aceptación:** helpers para levantar LiteSVM con el `.so`, crear un mint de 6 decimales, fondear ATAs, **fijar el reloj** y construir instrucciones con el IDL. Un smoke test que carga el programa.
- **Verificación:** `anchor build && pnpm test:program`.
- **Commit:** `test(program): add litesvm harness`

### P-03 · `initialize_config` + `update_config`
- **Depende de:** P-02
- **Archivos:** `instructions/{initialize_config.rs,update_config.rs}`, `tests/config.test.ts`.
- **Aceptación:** validaciones de 02 §1.4. Tests: init OK, segundo init falla, `fee_bps > MAX` falla, `deposit > MAX` falla, plazos ≤ 0 fallan, treasury de otro mint falla, `update_config` desde un no-admin falla.
- **Verificación:** `pnpm test:program`.
- **Commit:** `feat(program): add config instructions`

### P-04 · `create_order` + `close_order` (en Created)
- **Depende de:** P-03
- **Archivos:** `instructions/{create_order.rs,close_order.rs}`, `tests/create-close.test.ts`.
- **Aceptación:** crea `Order` + vault con payer separado del seller; guarda el snapshot de Config y `rent_payer`. Fallan: `amount = 0`, `amount > max`, mint no permitido, PDA duplicada. `close_order` en `Created` solo lo ejecuta el seller y la renta vuelve a `rent_payer`.
- **Verificación:** `pnpm test:program`.
- **Commit:** `feat(program): add create_order and close_order`

## Día 2: resto del programa, deploy y bases de B/W

### P-05 · `pay`
- **Depende de:** P-04
- **Archivos:** `instructions/pay.rs`, `tests/pay.test.ts`.
- **Aceptación:** fija `buyer` y `paid_at`, y transfiere `amount` a la vault con `transfer_checked`. Fallan: seller pagando, segundo pago (`InvalidStatus`), token account de otro mint o de otra authority.
- **Verificación:** `pnpm test:program`.
- **Commit:** `feat(program): add pay instruction`

### P-06 · `mark_shipped` + `refund_unshipped`
- **Depende de:** P-05
- **Archivos:** `instructions/{mark_shipped.rs,refund_unshipped.rs}`, `tests/ship-refund.test.ts`.
- **Aceptación:** `mark_shipped` con y sin hash, solo el seller, solo en `Paid`. `refund_unshipped` permissionless: falla antes de `paid_at + ship_deadline` y después devuelve el 100%.
- **Verificación:** `pnpm test:program`.
- **Commit:** `feat(program): add shipping and unshipped refund`

### P-07 · `confirm_receipt` + `release`
- **Depende de:** P-06
- **Archivos:** `instructions/{confirm_receipt.rs,release.rs}`, `instructions/shared/payout.rs`, `tests/release.test.ts`.
- **Aceptación:** comisión según 02 §1.5 hacia `config.treasury`. `confirm_receipt` solo el buyer; `release` falla antes de `shipped_at + claim_window`. La vault queda en 0. Snapshot: `update_config` posterior no cambia la comisión de la orden.
- **Verificación:** `pnpm test:program`.
- **Commit:** `feat(program): add receipt confirmation and timed release`

### P-08 · `open_dispute` + `resolve_dispute`
- **Depende de:** P-07
- **Archivos:** `instructions/{open_dispute.rs,resolve_dispute.rs}`, `tests/dispute.test.ts`.
- **Aceptación:** depósito según `dispute_deposit_bps`; falla fuera de `claim_window` y desde un no-buyer. `resolve_dispute` solo el árbitro; `buyer_share_bps` ∈ {0, 3 333, 5 000, 10 000} con todos los saldos verificados y el destino del depósito; `> 10 000` falla.
- **Verificación:** `pnpm test:program`.
- **Commit:** `feat(program): add dispute flow`

### P-09 · `close_order` en estados finales + matriz de transiciones inválidas
- **Depende de:** P-08
- **Archivos:** `instructions/close_order.rs`, `tests/close-final.test.ts`, `tests/invalid-transitions.test.ts`.
- **Aceptación:** close permissionless en `Released`/`Refunded`/`Resolved`; falla en `Paid`/`Shipped`/`Disputed`. Test tabla: cada instrucción × cada estado no permitido → `InvalidStatus`.
- **Verificación:** `pnpm test:program` · `cargo clippy --all-targets -- -D warnings`.
- **Commit:** `feat(program): close final orders and cover invalid transitions`

### P-10 · Deploy a devnet + seed + sync del IDL
- **Depende de:** P-09
- **Archivos:** `scripts/{seed-devnet.ts,demo-orders.ts,sync-idl.ts}`, `web/lib/vaultix/{idl.json,vaultix_escrow.ts}`, `Anchor.toml` (program id).
- **Aceptación:** programa desplegado en **devnet**, Config inicializada con los defaults de 01 §8, treasury creada. `pnpm sync-idl` copia IDL y tipos. El program id está documentado en `.env.example`.
- **Verificación:** `anchor deploy --provider.cluster devnet` · `pnpm seed:devnet` (idempotente: dos corridas no fallan).
- **Commit:** `chore(program): deploy to devnet and seed config`

### B-01 · Migración inicial de Supabase
- **Depende de:** C-01
- **Archivos:** `supabase/migrations/0001_init.sql`, `supabase/seed.sql`, `web/lib/server/db-types.ts` (generado).
- **Aceptación:** tablas, vistas `reputation` y `metrics`, y buckets de 02 §2. RLS activa en **todas** las tablas; `anon` solo puede hacer `select` en `listings where publication = 'listed'` y leer `listing-photos`.
- **Verificación:** `supabase db reset` local sin errores · una consulta `anon` a `shipping_info` devuelve 0 filas.
- **Commit:** `feat(db): add initial schema with rls`

### B-02 · Auth de servidor (Privy) + clientes de servidor
- **Depende de:** B-01
- **Archivos:** `web/lib/server/{auth.ts,supabase.ts,errors.ts,env.ts}`, `web/app/api/me/route.ts`.
- **Aceptación:** `requireUser(req)` verifica el token de Privy, devuelve `{ privyUserId, pubkey }` y hace upsert de `profiles`. `env.ts` valida las variables de servidor al arrancar. Errores uniformes `{ error: { code, message } }`.
- **Verificación:** `pnpm typecheck && pnpm test` (tests con el verificador mockeado).
- **Commit:** `feat(api): add privy auth and server clients`

### W-01 · Base visual y providers
- **Depende de:** C-01
- **Archivos:** `web/styles/tokens.css`, `web/app/globals.css` (`@theme`), `web/app/layout.tsx`, `web/app/providers.tsx` (Privy + TanStack Query), `web/components/{DevnetBanner,Logo}.tsx`, `web/components/ui/*`.
- **Aceptación:** tokens y componentes base según 05 §3 y §8. El banner devnet se ve en todas las páginas. Login de Privy funcionando (email + Google + Phantom). Sin hex fuera de `tokens.css`.
- **Verificación:** `pnpm lint && pnpm typecheck && pnpm build` · revisión visual a 375 px.
- **Commit:** `feat(web): add brand tokens, layout and providers`

### W-02 · Helpers de dominio en `lib/`
- **Depende de:** C-02
- **Archivos:** `web/lib/{amounts,fees,listing-hash,order-status,deadlines}.ts` + `*.test.ts`.
- **Aceptación:** según 03 §2, §3 y §6. `fees.ts` reproduce los casos de P-07/P-08. Cero `number` para montos.
- **Verificación:** `pnpm test`.
- **Commit:** `feat(web): add amount, fee and status helpers`

## Día 3: flujo vendedor y comprador

### B-03 · Sponsor de transacciones
- **Depende de:** B-02, C-02
- **Archivos:** `web/lib/server/{fee-payer.ts,sponsor-validate.ts,sponsor-validate.test.ts}`, `web/app/api/tx/sponsor/route.ts`.
- **Aceptación:** las 4 reglas de 01 §6, con el rate limit atómico en `sponsor_usage`. Tests: transacción válida, programa no permitido, fee payer como origen de una transferencia, firma de un usuario ajeno, límite excedido.
- **Verificación:** `pnpm test`.
- **Commit:** `feat(api): add sponsored transaction endpoint`

### B-04 · API de listings
- **Depende de:** B-02, W-02 (`listing-hash`)
- **Archivos:** `web/app/api/listings/route.ts`, `web/app/api/listings/[id]/activate/route.ts`, `web/app/api/listings/by-order/[pda]/route.ts`.
- **Aceptación:** borrador + signed upload URLs (máximo 3, 5 MB). `activate` verifica seller, amount y listing_hash contra la `Order` (mock hasta X-01). `by-order` devuelve el producto + reputación.
- **Verificación:** `pnpm typecheck && pnpm test`.
- **Commit:** `feat(api): add listings endpoints`

### B-05 · API de envío (dirección + tracking)
- **Depende de:** B-02
- **Archivos:** `web/app/api/shipping/route.ts`, `web/app/api/orders/[pda]/shipping/route.ts`, `web/app/api/orders/[pda]/shipment/route.ts`.
- **Aceptación:** reglas de visibilidad de 02 §2.2 (el seller la ve solo si la orden está en `Paid` o después y `buyer` coincide). Hash del tracking según 02 §2.2 y verificación contra `tracking_hash`.
- **Verificación:** `pnpm test` (casos de acceso permitido y denegado).
- **Commit:** `feat(api): add shipping info and shipment endpoints`

### W-03 · Cliente del programa + `useVaultixTx`
- **Depende de:** C-02, W-01
- **Archivos:** `web/lib/vaultix/client.ts`, `web/lib/tx/useVaultixTx.ts`, `web/components/TxButton.tsx`, `web/lib/api.ts`.
- **Aceptación:** `VaultixClient` real (Anchor) y mock intercambiables por env (`NEXT_PUBLIC_USE_MOCK`). Estados y copy de 03 §4, reintento por blockhash expirado, invalidación de queries.
- **Verificación:** `pnpm lint && pnpm typecheck && pnpm test`.
- **Commit:** `feat(web): add program client and transaction hook`

### W-04 · `/sell`
- **Depende de:** W-03, B-04
- **Archivos:** `web/app/sell/page.tsx`, `web/components/sell/*`.
- **Aceptación:** formulario y resumen de 03 §5.2, flujo de 01 §5.2 completo, reintento si choca el `order_id`, pantalla de éxito con WhatsApp y copiar.
- **Verificación:** `pnpm lint && pnpm typecheck` · prueba manual con mock a 375 px.
- **Commit:** `feat(web): add create link page`

### W-05 · `/p/[orderId]`: vista pública + pago
- **Depende de:** W-03, B-04, B-05, B-11
- **Archivos:** `web/app/p/[orderId]/page.tsx`, `web/components/order/{OrderHeader,Rules,PayFlow,TopUpSheet,ShippingForm}.tsx`, `web/components/{Amount,StatusBadge}.tsx`.
- **Aceptación:** contenido fijo + fila `Created` de 03 §5.3; sheet "Cargá saldo" con QR y polling; formulario de envío antes de `pay`. Link inexistente → mensaje de 03 §5.3.
- **Verificación:** `pnpm lint && pnpm typecheck` · prueba manual con mock.
- **Commit:** `feat(web): add public payment page`

### B-11 · Cotización USDC→ARS
- **Depende de:** B-02
- **Archivos:** `web/app/api/rate/usdc-ars/route.ts`.
- **Aceptación:** CriptoYa (`CRIPTOYA_EXCHANGE`), caché de 5 minutos, `null` si falla. Sin floats al exponer el valor (string decimal).
- **Verificación:** `pnpm typecheck` · prueba manual con `curl`.
- **Commit:** `feat(api): add usdc to ars reference rate`

### W-06 · OG image del link
- **Depende de:** W-05
- **Archivos:** `web/app/p/[orderId]/opengraph-image.tsx`, `web/public/og-spectral.png`, metadata en `page.tsx`.
- **Aceptación:** según 03 §5.4 y 05 §4 (sin gradiente detrás de texto chico).
- **Verificación:** `pnpm build` · `curl` a la imagen · preview en WhatsApp con un deploy de Vercel.
- **Commit:** `feat(web): add open graph image for payment links`

## Día 4: acciones post-pago, indexado, mails, disputas

### X-01 · Integración con devnet
- **Depende de:** P-10, W-03, B-03, B-04
- **Archivos:** `web/lib/vaultix/client.ts`, `web/.env.example`, `contract.ts` (reemplazado por los tipos del IDL).
- **Aceptación:** `NEXT_PUBLIC_USE_MOCK=false` funciona contra devnet: crear link y pagar de punta a punta con USDC de devnet y el sponsor. Diferencias entre contrato e IDL corregidas en todos los frentes.
- **Verificación:** `pnpm typecheck && pnpm test && pnpm build` · flujo manual crear → pagar en devnet.
- **Commit:** `feat(web): switch program client to devnet idl`

### W-07 · `/p/[orderId]`: acciones por estado
- **Depende de:** W-05
- **Archivos:** `web/components/order/{SellerActions,BuyerActions,ShipForm,DisputeSheet,EvidenceSheet,OutcomeCard}.tsx`.
- **Aceptación:** todas las filas de la tabla de 03 §5.3, plazos con `ember` y botones de plazo vencido.
- **Verificación:** `pnpm lint && pnpm typecheck` · recorrido manual de cada estado (mock o devnet).
- **Commit:** `feat(web): add post-payment order actions`

### B-06 · Webhook de Helius + indexado
- **Depende de:** B-01, P-10
- **Archivos:** `web/app/api/webhooks/helius/route.ts`, `web/lib/server/events.ts` (+ test con logs de ejemplo), `scripts/register-helius-webhook.ts`.
- **Aceptación:** verifica el header, decodifica los eventos con el IDL e inserta de forma idempotente en `order_events` (reenviar el mismo payload no duplica).
- **Verificación:** `pnpm test` · transacción real en devnet → fila en `order_events`.
- **Commit:** `feat(api): index program events from helius webhook`

### B-07 · Mails con Resend
- **Depende de:** B-06
- **Archivos:** `web/lib/server/mail.ts`, `web/lib/server/mail-templates.ts`.
- **Aceptación:** tabla de 02 §4; se envía solo con filas nuevas. Copy con voseo y sin jerga prohibida. `ARBITER_EMAIL` para los avisos al árbitro.
- **Verificación:** `pnpm test` (plantillas) · un mail real en devnet.
- **Commit:** `feat(api): send order notifications by email`

### B-08 · Crank diario
- **Depende de:** P-10, B-02
- **Archivos:** `web/app/api/cron/crank/route.ts`, `web/vercel.json` (cron diario), `web/lib/server/crank.ts`.
- **Aceptación:** protegido con `CRON_SECRET`; `getProgramAccounts` con memcmp sobre `status` (offset 8); ejecuta `refund_unshipped`, `release` y `close_order` sobre lo vencido y devuelve un resumen. Un error en una orden no frena las demás.
- **Verificación:** `pnpm typecheck` · llamada manual en devnet con una orden de plazo corto (Config de test vía `update_config`).
- **Commit:** `feat(api): add daily crank for expired deadlines`

### B-09 · API de evidencia y panel admin
- **Depende de:** B-02, B-05
- **Archivos:** `web/app/api/disputes/[pda]/evidence/route.ts`, `web/app/api/admin/disputes/route.ts`.
- **Aceptación:** 02 §2.5 y §3: solo partes y árbitro, URLs firmadas de 10 minutos, límites de tamaño y tipo.
- **Verificación:** `pnpm test` (accesos permitido y denegado).
- **Commit:** `feat(api): add dispute evidence and admin endpoints`

### B-10 · `GET /api/me/orders`
- **Depende de:** B-06
- **Archivos:** `web/app/api/me/orders/route.ts`.
- **Aceptación:** ventas y compras del usuario desde `order_events` + listings, sin status (el estado se lee on-chain).
- **Verificación:** `pnpm typecheck && pnpm test`.
- **Commit:** `feat(api): list user orders`

### W-08 · `/orders`
- **Depende de:** W-03, B-10
- **Archivos:** `web/app/orders/page.tsx`, `web/components/orders/*`.
- **Aceptación:** 03 §5.5, con el estado leído en batch on-chain.
- **Verificación:** `pnpm lint && pnpm typecheck`.
- **Commit:** `feat(web): add my orders page`

### W-09 · `/admin/disputes`
- **Depende de:** W-03, B-09
- **Archivos:** `web/app/admin/disputes/page.tsx`, `web/components/admin/*`.
- **Aceptación:** 03 §5.6. 404 si la cuenta no es el árbitro. Previsualización de montos con `fees.ts`. Firma con Phantom sin sponsor.
- **Verificación:** `pnpm lint && pnpm typecheck` · resolución real en devnet.
- **Commit:** `feat(web): add arbiter dispute panel`

### W-10 · Landing + `SpectralHero` (vgpu)
- **Depende de:** W-01
- **Archivos:** `web/app/page.tsx`, `web/components/{SpectralHero.tsx,spectral.wgsl}`, `web/public/grain.png`.
- **Aceptación:** 03 §5.1 y 05 §4.1: carga lazy, fallback CSS sin WebGPU, `prefers-reduced-motion`, ≥ 60% negro.
- **Verificación:** `npx vgpu check` · `pnpm build` · prueba en Chrome (WebGPU) y Safari iOS (fallback).
- **Commit:** `feat(web): add landing with spectral hero`

## Día 5: pruebas end-to-end

### X-02 · E2E manual en devnet
- **Depende de:** todas las anteriores
- **Archivos:** `specs/e2e-checklist.md` (resultado de la corrida).
- **Aceptación:** con 3 o 4 personas reales, recorrer: camino feliz, cancelación de un link sin pagar, reembolso por no envío, liberación por plazo (cron o botón), disputa con división. Bugs anotados como issues.
- **Verificación:** checklist completo + firmas de transacción en devnet.
- **Commit:** `docs: add e2e checklist results`

### X-03 · Revisión del programa
- **Depende de:** P-10
- **Archivos:** `specs/program-review.md`.
- **Aceptación:** revisión de cada instrucción contra la checklist de `AGENTS.md` (constraints, orden estado→CPI, `checked_*`, eventos). Hallazgos corregidos en PRs `fix(program): …` con tests.
- **Verificación:** `anchor build && pnpm test:program` · clippy.
- **Commit:** `docs(program): add security review notes`

## Días 6–7: métricas, demo y pitch

### X-04 · Métricas para el pitch
- **Depende de:** B-06
- **Archivos:** `scripts/metrics.ts`.
- **Aceptación:** imprime la vista `metrics` (links creados, pagados, conversión, volumen, % completadas, disputas).
- **Verificación:** `pnpm metrics`.
- **Commit:** `feat(scripts): add traction metrics report`

Video demo y pitch: fuera del repo.

---

## Grafo de dependencias

```
C-01 ─┬─ C-02 ─┬─ W-02 ─── B-04 ──┐
      │        └──────────────────┼─ W-03 ─┬─ W-04
      ├─ P-01 ─ P-02 ─ P-03 ─ P-04 ─ P-05 ─ P-06 ─ P-07 ─ P-08 ─ P-09 ─ P-10
      ├─ B-01 ─ B-02 ─┬─ B-03 ─┐   │        ├─ W-05 ─┬─ W-06
      │               ├─ B-05 ─┼───┼────────┘        └─ W-07
      │               ├─ B-11 ─┘   │
      │               └─ B-09
      └─ W-01 ─┬─ W-03
               └─ W-10

P-10 + W-03 + B-03 + B-04 ─► X-01
P-10 + B-01 ─► B-06 ─┬─ B-07
                     ├─ B-10 ─ W-08
                     └─ X-04
P-10 + B-02 ─► B-08
B-09 + W-03 ─► W-09
todo ─► X-02 · P-10 ─► X-03
```

**Camino crítico:** C-01 → P-01 … P-10 → X-01 → X-02. El agente de programa no debería tomar otras tareas hasta P-10.

## Asignación sugerida

| Agente | Cola |
| --- | --- |
| A (programa) | C-01 → P-01 … P-10 → X-03 |
| B (backend) | B-01 → B-02 → B-03 → B-05 → B-11 → B-04 → B-06 → B-07 → B-08 → B-09 → B-10 → X-04 |
| C (web) | C-02 → W-01 → W-02 → W-03 → W-10 → W-04 → W-05 → W-06 → W-07 → W-08 → W-09 |
| Todos | X-01 (el que libere primero, con el agente A de apoyo) → X-02 |
