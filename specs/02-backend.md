# 02 — Backend y Datos

Cubre las dos fuentes de datos de Vaultix:

1. **El programa `vaultix_escrow`** (on-chain): mueve y bloquea la plata.
2. **Supabase + API routes** (off-chain): producto, fotos, envío, evidencia, indexado y notificaciones.

Las reglas generales están en `AGENTS.md` (constraints de Anchor, `checked_*`, eventos, RLS). Acá está el contrato concreto.

---

## 1. Programa `vaultix_escrow`

### 1.1 Constantes (`constants.rs`)

```rust
pub const MAX_FEE_BPS: u16 = 500;               // 5%
pub const MAX_DISPUTE_DEPOSIT_BPS: u16 = 2_000; // 20%
pub const BPS_DENOMINATOR: u64 = 10_000;
pub const CONFIG_SEED: &[u8] = b"config";
pub const ORDER_SEED: &[u8] = b"order";
```

### 1.2 Cuentas (`state.rs`)

**`Config`**: PDA `["config"]`, una sola.

| Campo | Tipo | Nota |
| --- | --- | --- |
| `admin` | `Pubkey` | Firma `update_config` |
| `arbiter` | `Pubkey` | Firma `resolve_dispute` (Phantom del equipo) |
| `treasury` | `Pubkey` | **Token account** (ATA del mint) que cobra las comisiones |
| `allowed_mint` | `Pubkey` | USDC devnet |
| `fee_bps` | `u16` | Default 150 |
| `dispute_deposit_bps` | `u16` | Default 500 |
| `ship_deadline_secs` | `i64` | Default 432 000 |
| `claim_window_secs` | `i64` | Default 864 000 |
| `max_order_amount` | `u64` | Default 500 000 000 |
| `bump` | `u8` | |

**`Order`**: PDA `["order", seller, order_id.to_le_bytes()]`.

> **`status` va primero** (offset 8, después del discriminador) para que el crank filtre con `memcmp` sin depender del resto del layout.

| Campo | Tipo | Nota |
| --- | --- | --- |
| `status` | `OrderStatus` (enum `u8`) | `Created`, `Paid`, `Shipped`, `Disputed`, `Released`, `Refunded`, `Resolved` |
| `seller` | `Pubkey` | |
| `buyer` | `Option<Pubkey>` | `None` hasta `pay`; el primero que paga queda fijado |
| `order_id` | `u64` | Aleatorio, lo genera el cliente |
| `mint` | `Pubkey` | Copia de `config.allowed_mint` |
| `amount` | `u64` | Unidades mínimas (USDC: 6 decimales) |
| `fee_bps` | `u16` | Copia de Config al crear |
| `dispute_deposit_bps` | `u16` | Copia de Config al crear |
| `ship_deadline_secs` | `i64` | Copia de Config al crear |
| `claim_window_secs` | `i64` | Copia de Config al crear |
| `listing_hash` | `[u8; 32]` | SHA-256 de la publicación (§2.4) |
| `tracking_hash` | `Option<[u8; 32]>` | Opcional en el MVP |
| `dispute_deposit` | `u64` | 0 salvo en disputa |
| `created_at` / `paid_at` / `shipped_at` | `i64` | 0 si todavía no ocurrió |
| `rent_payer` | `Pubkey` | Quien pagó la renta (el fee payer); la recupera en `close_order` |
| `bump` | `u8` | |

**`Vault`**: ATA de `mint` con authority = la PDA `Order`. Se crea en `create_order` (`associated_token::authority = order`). Las transferencias desde la vault firman con las seeds de la orden.

Espacio con `#[derive(InitSpace)]`.

### 1.3 Máquina de estados

Igual a la del `README.md`, con dos precisiones del grilleo:

- `claim_window` **corre desde `mark_shipped`**, no desde la entrega (el programa no tiene oráculo).
- `close_order` acepta `Created` (link sin pagar, vault vacía) y los estados finales. No es una transición: cierra la cuenta.

```
Created ─pay─► Paid ─mark_shipped─► Shipped ─confirm_receipt / release─► Released
   │             │                     │
 close_order   refund_unshipped     open_dispute
 (solo seller) (vencido ship)       (dentro de claim)
   ▼             ▼                     ▼
 [cerrada]    Refunded             Disputed ─resolve_dispute─► Resolved
```

### 1.4 Instrucciones

Una por archivo en `instructions/`. **Cada instrucción valida el estado de entrada con `require!`**, actualiza la `Order` **antes** de la CPI y emite su evento.

| Instrucción | Firmante | Estado de entrada → salida | Validaciones clave | Efecto en tokens |
| --- | --- | --- | --- | --- |
| `initialize_config(args)` | `admin` (paga) | — → Config | `fee_bps ≤ MAX`, `deposit ≤ MAX`, plazos > 0, `treasury.mint == allowed_mint` | — |
| `update_config(args)` | `config.admin` | Config → Config | Mismas que `initialize_config` | — |
| `create_order(order_id, amount, listing_hash)` | `seller` + `payer` (fee payer) | — → `Created` | `mint == config.allowed_mint`, `0 < amount ≤ max_order_amount` | Crea la vault |
| `pay()` | `buyer` (+ fee payer) | `Created` → `Paid` | `buyer != seller`; `buyer_token.mint == mint`, `authority == buyer` | buyer → vault: `amount` |
| `mark_shipped(tracking_hash: Option<[u8;32]>)` | `seller` (`has_one`) | `Paid` → `Shipped` | — | — |
| `confirm_receipt()` | `buyer` (constraint `order.buyer == Some(signer)`) | `Shipped` → `Released` | — | vault → seller: `amount − fee`; vault → treasury: `fee` |
| `release()` | cualquiera | `Shipped` → `Released` | `now > shipped_at + claim_window_secs` | igual a `confirm_receipt` |
| `refund_unshipped()` | cualquiera | `Paid` → `Refunded` | `now > paid_at + ship_deadline_secs` | vault → buyer: `amount` (sin comisión) |
| `open_dispute()` | `buyer` | `Shipped` → `Disputed` | `now ≤ shipped_at + claim_window_secs` | buyer → vault: `deposit = amount × dispute_deposit_bps / 10 000` |
| `resolve_dispute(buyer_share_bps: u16)` | `config.arbiter` (`address =`) | `Disputed` → `Resolved` | `buyer_share_bps ≤ 10 000` | Ver §1.5 |
| `close_order()` | `seller` si `Created`; cualquiera si es estado final | `Created`/final → cerrada | vault con saldo 0; `rent_payer` recibe la renta | Cierra la vault (CPI `close_account`) y la `Order` |

Las cuentas de destino se restringen siempre con `token::mint = order.mint` y `token::authority = <parte>`: `seller_token` → `order.seller`, `buyer_token` → `order.buyer`, `treasury` → `address = config.treasury`.

La ATA del vendedor se crea en la misma transacción que `create_order` (`CreateIdempotent`, la paga el fee payer). Así `release` nunca falla por una cuenta destino inexistente. La del comprador existe porque tiene USDC.

### 1.5 Aritmética de comisión y división

Todo con `checked_*` en `u64`/`u128`, redondeo **hacia abajo**. El resto de cada redondeo queda del lado del vendedor y se reparte por completo: la vault siempre queda en 0.

**Liberación** (`confirm_receipt`, `release`):

```
fee         = amount * fee_bps / 10_000
seller_net  = amount - fee
```

**Resolución** (`resolve_dispute(buyer_share_bps)`):

```
buyer_part   = amount * buyer_share_bps / 10_000
seller_gross = amount - buyer_part
fee          = seller_gross * fee_bps / 10_000
seller_net   = seller_gross - fee
deposit_to   = buyer_share_bps >= 5_000 ? buyer : seller
```

Transferencias: `buyer_part (+ deposit si deposit_to == buyer)` → buyer · `seller_net (+ deposit si deposit_to == seller)` → seller · `fee` → treasury. Las transferencias de monto 0 se omiten.

### 1.6 Eventos (`events.rs`)

Todos llevan `order: Pubkey` y `timestamp: i64`.

| Evento | Campos extra |
| --- | --- |
| `OrderCreated` | `seller`, `order_id`, `amount`, `listing_hash` |
| `OrderPaid` | `buyer`, `amount` |
| `OrderShipped` | `tracking_hash: Option<[u8;32]>` |
| `OrderReleased` | `seller_amount`, `fee`, `by_timeout: bool` |
| `OrderRefunded` | `buyer_amount` |
| `DisputeOpened` | `deposit` |
| `DisputeResolved` | `buyer_share_bps`, `buyer_amount`, `seller_amount`, `fee`, `deposit_to_buyer: bool` |
| `OrderClosed` | `rent_payer` |
| `ConfigUpdated` | — (con `config` en lugar de `order`) |

### 1.7 Errores (`errors.rs`)

`InvalidStatus`, `NotSeller`, `NotBuyer`, `NotArbiter`, `NotAdmin`, `SellerCannotBuy`, `InvalidMint`, `InvalidAmount`, `AmountExceedsMax`, `FeeTooHigh`, `DepositTooHigh`, `InvalidDeadline`, `InvalidShareBps`, `DeadlineNotReached` (ship o claim todavía vigente), `ClaimWindowClosed`, `VaultNotEmpty`, `MathOverflow`.

### 1.8 Seed de devnet (`scripts/`)

- `seed-devnet.ts`: crea la ATA de tesorería y ejecuta `initialize_config` con los defaults de `01-arquitectura.md` §8. Es idempotente: si la Config existe, no hace nada.
- `demo-orders.ts`: crea 2 o 3 órdenes de ejemplo para la demo.
- El `admin` y el upgrade authority usan la keypair local de devnet; el `arbiter` es la pubkey de la Phantom del equipo (`ARBITER_PUBKEY`).

### 1.9 Tests (`tests/`, TypeScript + LiteSVM)

LiteSVM corre el programa compilado en proceso y permite **fijar el reloj** (`Clock`) para probar los plazos. Para cada caso se crea un mint de prueba de 6 decimales.

Matriz mínima (sin todos en verde no se mergea):

- **Camino feliz:** create → pay → ship → confirm, verificando saldos de seller, treasury y vault = 0.
- **Cada transición inválida:** cada instrucción ejecutada desde cada estado no permitido falla con `InvalidStatus`.
- **Plazos:** `release` antes de vencer falla (`DeadlineNotReached`) y después funciona; `refund_unshipped` antes/después; `open_dispute` después de `claim_window` falla (`ClaimWindowClosed`).
- **Accesos:** `mark_shipped` desde un no-vendedor, `confirm_receipt`/`open_dispute` desde un no-comprador, `resolve_dispute` desde un no-árbitro, `update_config` desde un no-admin, vendedor pagando su propia orden.
- **Cuentas falsas:** mint distinto, vault que no es la ATA de la orden, `seller_token`/`buyer_token` de otra authority, treasury distinta de la de Config.
- **Montos:** `amount = 0` y `amount > max_order_amount` fallan.
- **Comisión y división:** `buyer_share_bps` ∈ {0, 3 333, 5 000, 10 000}, verificando cada saldo y el destino del depósito; `fee_bps > MAX` falla en config.
- **Snapshot:** `update_config` después de crear la orden no cambia la comisión ni los plazos de esa orden.
- **Close:** en `Created` lo puede ejecutar solo el seller; en finales, cualquiera; en estados no finales falla. La renta vuelve a `rent_payer`.

---

## 2. Supabase

### 2.1 Principios

- Solo datos off-chain. **Ninguna columna guarda el status de una orden.**
- **RLS activa en todas las tablas.** El cliente `anon` solo puede leer lo público (listings `listed` y fotos). Todo lo demás pasa por API routes con la service role, después de verificar el token de Privy.
- Montos en `numeric(20,0)` (unidades mínimas; u64 no entra en `bigint`). Pubkeys como `text` base58.

### 2.2 Tablas (`supabase/migrations/0001_init.sql`)

**`profiles`**: una fila por usuario de Privy.

| Columna | Tipo |
| --- | --- |
| `privy_user_id` | `text` PK |
| `wallet_pubkey` | `text` unique not null |
| `email` | `text` |
| `display_name` | `text` |
| `created_at` | `timestamptz` default now() |

**`listings`**: la publicación de un link.

| Columna | Tipo | Nota |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `seller_pubkey` | `text` not null | |
| `title` | `text` not null | ≤ 80 caracteres |
| `description` | `text` | ≤ 1000 caracteres |
| `photo_paths` | `text[]` | 1 a 3, en el bucket `listing-photos` |
| `amount_units` | `numeric(20,0)` | |
| `order_id` | `numeric(20,0)` | u64 aleatorio |
| `order_pda` | `text` unique | null hasta activar |
| `listing_hash` | `text` | hex |
| `publication` | `text` check in (`draft`, `listed`) | Ciclo de la **publicación**, no de la orden |
| `created_at` | `timestamptz` | |

Inmutable una vez `listed` (lo garantiza la API y lo comprueba `listing_hash`).

**`shipping_info`**: datos de envío del comprador.

| Columna | Tipo |
| --- | --- |
| `order_pda` | `text` |
| `buyer_pubkey` | `text` |
| `full_name`, `phone`, `street`, `city`, `province`, `postal_code` | `text` |
| `notes` | `text` |
| `created_at` | `timestamptz` |
| PK | (`order_pda`, `buyer_pubkey`) |

La API se la muestra al vendedor **solo** si la `Order` está en `Paid` o en un estado posterior **y** `order.buyer == buyer_pubkey`.

**`shipments`**: el tracking en texto plano (on-chain va solo el hash).

| Columna | Tipo |
| --- | --- |
| `order_pda` | `text` PK |
| `carrier` | `text` check in (`andreani`, `oca`, `correo_argentino`, `otro`) |
| `tracking_number` | `text` |
| `created_at` | `timestamptz` |

`tracking_hash = sha256(utf8("<carrier>:<tracking_number normalizado en mayúsculas sin espacios>"))`.

**`order_events`**: copia append-only de los eventos on-chain.

| Columna | Tipo |
| --- | --- |
| `signature` | `text` |
| `event_index` | `int` |
| `order_pda` | `text` (o `config_pda` para `ConfigUpdated`) |
| `event_type` | `text` |
| `payload` | `jsonb` (montos como string) |
| `slot` | `bigint` |
| `block_time` | `timestamptz` |
| PK | (`signature`, `event_index`) |

**`dispute_evidence`**

| Columna | Tipo |
| --- | --- |
| `id` | `uuid` PK |
| `order_pda` | `text` |
| `uploader_pubkey` | `text` |
| `kind` | `text` check in (`photo`, `video`, `note`) |
| `storage_path` | `text` null (para `note`) |
| `note` | `text` |
| `created_at` | `timestamptz` |

**`sponsor_usage`**: rate limit del fee payer.

| Columna | Tipo |
| --- | --- |
| `privy_user_id` | `text` |
| `day` | `date` (UTC) |
| `count` | `int` |
| PK | (`privy_user_id`, `day`) |

El incremento es atómico (`insert … on conflict do update set count = count + 1 returning count`).

### 2.3 Vistas

- **`reputation`** (por pubkey): `sales_completed` (`OrderReleased` como seller + `DisputeResolved` con `buyer_share_bps < 5000`), `purchases_completed` (`OrderReleased` como buyer), `disputes_lost_as_buyer` (`DisputeResolved` con `deposit_to_buyer = false`). Las partes salen del `OrderCreated`/`OrderPaid` de la misma orden.
- **`metrics`** (global): links creados, links pagados, conversión, volumen USDC (de `OrderPaid`), % completadas, disputas abiertas y resueltas.

### 2.4 `listing_hash` canónico

```
sha256(utf8(JSON.stringify({
  v: 1,
  title, description,
  amount: "<amount_units como string>",
  photos: [<photo_paths en orden>]
})))
```

Claves en ese orden exacto y sin espacios. Una sola implementación en `web/lib/listing-hash.ts`, usada por el cliente y por la API.

### 2.5 Storage

| Bucket | Acceso | Límite |
| --- | --- | --- |
| `listing-photos` | Lectura pública | 3 fotos × 5 MB, `image/jpeg|png|webp` |
| `dispute-evidence` | Privado; URLs firmadas (10 min) solo para buyer, seller y árbitro | 50 MB, imagen o `video/mp4|quicktime` |

Las subidas siempre usan **signed upload URLs** que emite la API. El cliente nunca tiene permiso de escritura.

---

## 3. API routes (`web/app/api/`)

Auth: `Authorization: Bearer <privy access token>`, verificado con el SDK de servidor de Privy en `lib/server/auth.ts`. Esa función resuelve `privy_user_id` y la pubkey Solana vinculada (embebida o externa) y hace upsert en `profiles`.

| Método y ruta | Auth | Qué hace |
| --- | --- | --- |
| `POST /api/tx/sponsor` | Privy | Valida (01 §6), co-firma, envía y devuelve `signature` |
| `POST /api/listings` | Privy | Crea el borrador y devuelve el `id` y las signed upload URLs |
| `POST /api/listings/:id/activate` | Privy (dueño) | Verifica la `Order` on-chain (seller, amount, listing_hash) y pasa a `listed` |
| `GET /api/listings/by-order/:pda` | Pública | Producto + reputación del seller |
| `POST /api/shipping` | Privy | Upsert de `shipping_info` para (`pda`, caller) |
| `GET /api/orders/:pda/shipping` | Privy (seller) | Datos de envío, con las reglas de §2.2 |
| `POST /api/orders/:pda/shipment` | Privy (seller) | Guarda carrier y número; si la orden ya está `Shipped`, verifica que su hash coincida con `tracking_hash` |
| `GET /api/orders/:pda/shipment` | Privy (buyer, seller o árbitro) | Tracking en texto plano |
| `GET /api/me/orders` | Privy | Mis ventas y compras (de `order_events` por pubkey). El estado lo lee la web on-chain |
| `POST /api/disputes/:pda/evidence` | Privy (buyer o seller), orden `Disputed` | Signed upload URL + fila en `dispute_evidence` |
| `GET /api/disputes/:pda/evidence` | Privy (buyer, seller o árbitro) | Lista con URLs firmadas |
| `GET /api/admin/disputes` | Privy, pubkey == `config.arbiter` | Órdenes `Disputed` con producto, envío y evidencia |
| `POST /api/webhooks/helius` | Header `HELIUS_WEBHOOK_AUTH` | Indexa eventos y dispara mails |
| `GET /api/cron/crank` | `Bearer CRON_SECRET` | `release`, `refund_unshipped` y `close_order` vencidos |
| `GET /api/rate/usdc-ars` | Pública | CriptoYa (`CRIPTOYA_EXCHANGE`), caché de 5 minutos; si falla, `null` y la UI oculta los pesos |

Respuesta de error uniforme: `{ error: { code, message } }`. `message` va en español para mostrar en la UI.

## 4. Notificaciones (Resend)

Disparadas por el webhook **solo cuando la fila de `order_events` es nueva** (idempotencia por PK). Destinatario: el email de `profiles`.

| Evento | A quién | Asunto (voseo, primero el dato) |
| --- | --- | --- |
| `OrderPaid` | seller | "Te pagaron {producto}. Despachá antes del {fecha}." |
| `OrderShipped` | buyer | "El vendedor despachó {producto}." |
| `OrderReleased` | seller | "Cobraste USDC {monto} por {producto}." |
| `OrderRefunded` | buyer | "Te devolvimos USDC {monto}." |
| `DisputeOpened` | seller + árbitro | "Abrieron un reclamo por {producto}. Subí tu evidencia." |
| `DisputeResolved` | buyer + seller | "Se resolvió el reclamo por {producto}." |

Si falla el envío de un mail, se loguea y no se reintenta (MVP).
