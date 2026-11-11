# 03 — Frontend e Interfaz

Web Next.js (App Router) en `web/`. Mobile-first: se diseña a **375 px** y se escala hacia arriba. El sistema visual y el tono están en [`05-design.md`](05-design.md).

---

## 1. Stack y estructura

| Pieza | Elección |
| --- | --- |
| Framework | Next.js App Router + TypeScript estricto |
| Estilos | Tailwind v4: `@theme` mapea `styles/tokens.css` (`bg-vault-black`, `text-bone`, `bg-ion-blue`…). **Nada de hex sueltos en componentes** |
| Fuentes | `next/font`: Inter (UI y títulos; Inter Display si está disponible) + JetBrains Mono (datos) |
| Auth y cuentas | Privy: email, Google y conexión de Phantom/Solflare |
| Datos | TanStack Query: lecturas on-chain y de la API |
| Programa | `@anchor-lang/core` + `@solana/web3.js` 1.x + IDL en `lib/vaultix/` |
| Hero | vgpu (WebGPU) con fallback CSS |
| Tests | Vitest en `lib/` |

```
web/
├── app/
│   ├── layout.tsx              # Providers, banner devnet, fuentes
│   ├── page.tsx                # Landing
│   ├── sell/page.tsx
│   ├── p/[orderId]/page.tsx
│   ├── p/[orderId]/opengraph-image.tsx
│   ├── orders/page.tsx
│   ├── admin/disputes/page.tsx
│   └── api/…                   # ver 02-backend.md §3
├── components/
│   ├── ui/                     # Button, Card, Sheet (modal mobile), Field, Badge, Toast
│   ├── StatusBadge.tsx
│   ├── Amount.tsx              # USDC + ≈ ARS
│   ├── TxButton.tsx            # Botón que maneja el ciclo de una transacción
│   ├── DevnetBanner.tsx
│   ├── SpectralHero.tsx        # vgpu + fallback
│   └── Logo.tsx
├── lib/
│   ├── amounts.ts              # bigint ↔ string (6 decimales)
│   ├── fees.ts                 # espejo de 02-backend §1.5
│   ├── listing-hash.ts         # 02-backend §2.4
│   ├── order-status.ts         # mapeo estado → etiqueta y color
│   ├── deadlines.ts            # vence/venció, cuenta regresiva
│   ├── vaultix/                # IDL, tipos, cliente, PDAs, decoders
│   ├── tx/useVaultixTx.ts      # máquina de estados de la transacción
│   ├── api.ts                  # fetch tipado a /api con token de Privy
│   └── server/                 # solo servidor (auth, supabase, fee payer)
└── styles/tokens.css
```

## 2. Reglas transversales

- **Montos:** siempre `bigint` en unidades mínimas. `lib/amounts.ts` parsea el input del usuario ("120,50" o "120.50") a bigint sin pasar por float. Se muestra `USDC 120.50` en mono y abajo `≈ $ 145.300` (ARS de referencia, sin decimales). Si la cotización falla, se oculta la línea en pesos.
- **Banner "Modo prueba (devnet)":** fijo arriba, visible en todas las páginas mientras `NEXT_PUBLIC_SOLANA_CLUSTER !== "mainnet-beta"`.
- **Copy:** voseo, primero el dato. **Prohibido** en la UI: wallet, gas, fee de red, smart contract, programa, seed phrase, blockchain. Se dice "tu cuenta", "la bóveda", "pago protegido". Mapa completo en `05-design.md` §6.
- **Reglas claras, sin complejidad:** el público no sabe nada de cripto y la web tiene que atraerlo, no espantarlo. Antes de pagar y antes de crear un link, las dos partes ven el mismo resumen (`RulesSummary`) en 3 o 4 líneas cortas, con **fechas y montos concretos** en lugar de porcentajes o segundos: "Si no lo despacha antes del 12/11, te devolvemos todo", "Vas a recibir USDC 98.50". El detalle (depósito de disputa, árbitro, cierre) va detrás de un "¿Cómo funciona?" desplegable. Se pide solo el dato necesario en cada paso, sin pasos de más, y cada estado dice qué pasó y qué sigue.
- **Sin cripto visible por defecto:** las direcciones se muestran cortas (`8F3a…c41E`) y solo donde aportan (cargar saldo, árbitro).
- **Accesibilidad mínima:** contraste AA, objetivos táctiles ≥ 44 px, foco visible.

## 3. Estados de orden en la UI (`lib/order-status.ts`)

| On-chain | Etiqueta | Token de color |
| --- | --- | --- |
| `Created` | Creado | `steel` |
| `Paid` | En bóveda | `ultra-violet` |
| `Shipped` | Enviado | `ion-blue` |
| `Disputed` | En disputa | `plasma` |
| `Released` | Liberado | `released` (#3DDC97) |
| `Refunded` | Reembolsado | `steel` |
| `Resolved` | Resuelto | `steel` |

Los plazos que vencen en menos de 24 h se resaltan con `ember`.

## 4. Ciclo de una transacción (`useVaultixTx` + `TxButton`)

| Estado | Copy |
| --- | --- |
| `idle` | Texto de la acción ("Pagá USDC 120.00") |
| `signing` | "Confirmá en tu cuenta…" |
| `sending` | "Enviando…" |
| `confirming` | "Confirmando…" |
| `confirmed` | Toast con el resultado ("Listo: tu plata está en bóveda.") |
| `failed` | Mensaje mapeado del error del programa o de la API (`InvalidStatus` → "Esta orden ya cambió de estado. Actualizá la página.") |

Usa el flujo patrocinado de `01-arquitectura.md` §5.1. Confirma con `confirmed` y reintenta hasta 3 veces si el blockhash expira. Después de confirmar invalida las queries de esa orden y del saldo.

El árbitro **no** usa el sponsor: firma y envía con su Phantom.

## 5. Pantallas

### 5.1 `/`: landing

- Hero con `SpectralHero` (≥ 60% negro), logo Bone, titular "Confianza en código." y bajada "La plata queda en bóveda hasta que el producto llega."
- Tres pasos: "Creá el link" → "Tu comprador paga, la plata queda en bóveda" → "Cobrás cuando llega".
- CTA principal (`ion-blue`): "Creá tu link de pago" → login con Privy → `/sell`.

### 5.2 `/sell`: crear link (requiere login)

Formulario de un solo paso:

| Campo | Validación |
| --- | --- |
| Fotos | 1 a 3, ≤ 5 MB, jpg/png/webp (preview) |
| Título | 1 a 80 caracteres |
| Descripción | ≤ 1000 caracteres |
| Precio en USDC | > 0 y ≤ `max_order_amount` (leído de Config); muestra ≈ ARS en vivo |

Resumen antes de crear: comisión (1,5%) y monto que vas a recibir, plazo de despacho (5 días desde el pago) y plazo de reclamo (7 días desde el despacho), todos leídos de Config.

Al enviar: flujo `01-arquitectura.md` §5.2. Al terminar, pantalla de éxito con:
- el link `/p/<orderPda>`,
- el botón "Compartí por WhatsApp" (`https://wa.me/?text=…`),
- el botón "Copiar link".

### 5.3 `/p/[orderId]`: link de pago (pública)

Server Component: lee el listing (API) y la `Order` on-chain. Si no existe o no está `listed`: "Este link no existe o ya no está disponible."

Contenido fijo: fotos, título, descripción, `Amount`, `StatusBadge`, sello "Pago protegido", vendedor (nombre + reputación: ventas cerradas) y **reglas antes de pagar** (plazos, depósito de disputa del 5% y tabla de reclamos del README).

Acciones según rol y estado (client component):

| Estado | Comprador (o visitante) | Vendedor |
| --- | --- | --- |
| `Created` | "Pagá USDC X": login → si falta saldo, sheet "Cargá saldo" → formulario de envío → `pay` | "Compartí el link" · "Cancelar link" (`close_order`) |
| `Paid` | "Tu plata está en bóveda. El vendedor tiene hasta el {fecha} para despachar." Si venció: "Pedí el reembolso" (`refund_unshipped`) | Datos de envío del comprador · formulario "Marcá como enviado" (carrier + número, **opcional**) → `mark_shipped` + `POST /shipment` |
| `Shipped` | Tracking + link al correo · "Confirmá que llegó" (`confirm_receipt`) · "Tengo un problema" → sheet de disputa (reglas + depósito) → `open_dispute`. Muestra hasta cuándo puede reclamar | "Tu pago se libera el {fecha}." Si venció: "Liberá el pago" (`release`) |
| `Disputed` | Sheet "Subí evidencia" (fotos, video, nota) + lista | Igual |
| Finales | Resultado con montos | Resultado con montos |

Terceros (ni comprador ni vendedor) en una orden ya pagada ven solo el estado y el sello, sin datos personales.

**Sheet "Cargá saldo":** "Te faltan USDC {n}." Muestra la dirección de la cuenta con QR y botón de copiar, instrucciones para mandar USDC por la red Solana desde Lemon o Ripio y, en devnet, el link al faucet de Circle. Consulta el saldo cada 5 s y avanza solo cuando alcanza.

### 5.4 `/p/[orderId]/opengraph-image`

`ImageResponse` de `next/og`, 1200×630: fondo `vault-black` con una banda Spectral (PNG estático, sin texto encima), foto del producto, título, `USDC X` en mono y sello "Pago protegido" con el isotipo. También se completan `og:title` ("{producto} — Pago protegido con Vaultix") y `og:description`.

### 5.5 `/orders`: mis compras y ventas (requiere login)

Dos tabs: "Ventas" y "Compras". Cada tarjeta muestra foto, título, monto, `StatusBadge` y la próxima acción o plazo ("Despachá antes del 12/11"). La lista sale de `GET /api/me/orders`; el estado de cada orden se lee on-chain (batch con `getMultipleAccountsInfo`).

### 5.6 `/admin/disputes`: panel del árbitro

- Visible solo si la cuenta conectada es `config.arbiter`. Si no, 404.
- Lista de órdenes `Disputed` → detalle con producto (y verificación de `listing_hash`), datos y tracking del envío, evidencia de ambas partes, y tiempos.
- Decisión: atajos "Reembolsar todo" (10 000), "Liberar todo" (0), "Dividir" (slider en %, a bps). Previsualiza montos con `lib/fees.ts` antes de firmar `resolve_dispute`.

## 6. Tests (`web/lib/**/*.test.ts`, Vitest)

- `amounts`: parseo y formato, sin floats, rechazo de más de 6 decimales.
- `fees`: mismos casos que los tests del programa (§1.9 de 02).
- `listing-hash`: vector fijo conocido.
- `order-status` y `deadlines`.
- `server/sponsor-validate`: cada regla de 01 §6 (transacción válida, programa no permitido, fee payer como origen de transferencia).

Antes de cerrar una tarea de web: `pnpm lint && pnpm typecheck && pnpm test`.
