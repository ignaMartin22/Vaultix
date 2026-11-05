# Revisión de seguridad del programa (X-03)

Revisión de `programs/vaultix_escrow` (program id `Fg215nqtnNCBuZY4obrSUVbueGHxpfViP5Mfw3DxZ6Bg`, devnet) contra la checklist de `AGENTS.md` y el contrato de `02-backend.md` §1. Fecha: 2026-11-05. Alcance: las 11 instrucciones, `shared/payout.rs`, `state.rs`, `errors.rs`, `events.rs` y `constants.rs`, más los puntos del cliente y del backend donde el programa delega una garantía.

## 1. Checklist por instrucción

Leyenda: ✓ cumple · — no aplica.

| Instrucción | Firmante / autoridad | Constraints de cuentas | Estado de entrada | Estado antes de la CPI | `checked_*` | Plazos | Evento |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `initialize_config` | `admin` (paga) | `init` + seeds `["config"]`, `treasury.mint == allowed_mint` | — (`init` falla si existe) | — | — | `> 0` validado | `ConfigUpdated` ✓ |
| `update_config` | `has_one = admin` | seeds + bump, `treasury.mint == config.allowed_mint` | — | — | — | `> 0` validado | `ConfigUpdated` ✓ |
| `create_order` | `seller` + `payer` | `mint == config.allowed_mint`, `init` PDA `["order", seller, order_id]`, vault ATA con `authority = order` y `token_program` | — (`init`) | — | — | snapshot de Config | `OrderCreated` ✓ |
| `pay` | `buyer` (≠ seller) | seeds + bump, `buyer_token.mint == order.mint`, `buyer_token.owner == buyer`, vault ATA | `Created` ✓ | ✓ | — | `paid_at = now` | `OrderPaid` ✓ |
| `mark_shipped` | `has_one = seller` | seeds + bump | `Paid` ✓ | — | — | `shipped_at = now` | `OrderShipped` ✓ |
| `refund_unshipped` | permissionless | seeds + bump, `buyer_token.owner == order.buyer`, mint, vault ATA | `Paid` ✓ | ✓ | `paid_at + ship_deadline` ✓ | `now > deadline` ✓ | `OrderRefunded` ✓ |
| `confirm_receipt` | `order.buyer == Some(signer)` | seeds, Config PDA, `seller_token.owner == order.seller`, `treasury == config.treasury`, vault ATA | `Shipped` ✓ | ✓ (`settle_release`) | u128 en `bps_of` ✓ | — | `OrderReleased` ✓ |
| `release` | permissionless | igual que `confirm_receipt` | `Shipped` ✓ | ✓ | `shipped_at + claim_window` ✓ | `now > deadline` ✓ | `OrderReleased` ✓ |
| `open_dispute` | `order.buyer == Some(signer)` | `buyer_token.owner == buyer`, mint, vault ATA | `Shipped` ✓ | ✓ | ✓ | `now <= deadline` ✓ | `DisputeOpened` ✓ |
| `resolve_dispute` | `address = config.arbiter` | `buyer_token.owner == order.buyer`, `seller_token.owner == order.seller`, `treasury == config.treasury`, vault ATA | `Disputed` ✓ | ✓ | ✓, `share ≤ 10 000` | — | `DisputeResolved` ✓ |
| `close_order` | seller en `Created`; cualquiera en finales | seeds, `has_one = rent_payer`, `close = rent_payer`, vault ATA | `Created` / finales ✓ | — (vault en 0) | — | — | `OrderClosed` ✓ |

Además:

- **Transferencias:** siempre `transfer_checked` con los decimales del mint; las salidas de la vault firman con las seeds de la orden (`CpiContext::new_with_signer`). Las de monto 0 se omiten.
- **Conservación:** en una disputa `buyer_part + seller_net + fee + depósito = amount + depósito`, así que la vault queda en 0 (lo prueban `dispute_split_always_adds_up_to_amount` y los tests de saldos).
- **Ventanas sin solapamiento:** `open_dispute` usa `now <= shipped_at + claim_window` y `release` usa `now > …`: en ningún segundo valen las dos.
- **Destinos no desviables:** cada cuenta de destino está atada al dueño correcto (`buyer`, `seller`) o a `config.treasury`. Ni el árbitro ni quien llama a una instrucción permissionless pueden mandar fondos a otra cuenta.
- **Snapshot:** comisión, depósito y plazos se copian a la orden en `create_order`; `update_config` no los cambia para órdenes existentes (tests `create_order_stores_order_and_config_snapshot` y `fee_uses_order_snapshot_after_update_config`).
- **Cobertura:** 84 tests (LiteSVM) con cada transición válida, la tabla de 45 transiciones inválidas, cada plazo vencido, cuentas falsas o de otro mint y firmantes no autorizados.

## 2. Hallazgos

| # | Severidad | Hallazgo | Estado |
| --- | --- | --- | --- |
| H-1 | Media | **Link viejo con orden nueva.** Una orden `Created` cerrada (`close_order`) se puede volver a crear en la misma PDA con el mismo `order_id` y otros términos. La publicación anterior sigue `listed` para esa PDA, y `/p` mostraba el producto viejo junto al monto nuevo. | **Corregido** en `fix(web): hide a link whose listing no longer matches the order`: `/p` exige que el hash de la publicación sea igual al `listing_hash` on-chain. El panel del árbitro ya lo verificaba. |
| H-2 | Baja | `ConfigArgs::validate` aceptaba `max_order_amount = 0`, que bloquea en silencio todo `create_order` (01 §8 pide `> 0`). | **Corregido** en `fix(program): reject a zero max order amount in config`, con test para `initialize_config` y `update_config`. |
| H-3 | Baja | **Donaciones a la vault.** Si alguien transfiere USDC directo a la vault de una orden, en estados finales queda un resto y `close_order` falla con `VaultNotEmpty`. Solo traba la renta (~0,004 SOL), nunca fondos de las partes: los pagos usan `order.amount`, no el saldo. | Aceptado para el MVP. Antes de mainnet: barrer el resto a la tesorería al cerrar. |
| H-4 | Info | **Disputa sin plazo.** Si el árbitro no resuelve (o pierde la clave), la plata queda en `Disputed`. | Pregunta abierta del README. La clave de admin puede cambiar el árbitro con `update_config`. |
| H-5 | Info | **`initialize_config` sin dueño.** Cualquiera puede inicializar la Config primero y quedar de admin. | Pregunta abierta del README. En devnet ya está inicializada por el equipo. |
| H-6 | Info | **Tesorería viva.** Las órdenes abiertas pagan la comisión a la tesorería *actual* de la Config. Si esa cuenta se cierra o se congela, `confirm_receipt`, `release` y `resolve_dispute` fallan hasta que el admin la cambie. El porcentaje sí queda fijado por el snapshot. | Documentado (también en el README). |
| H-7 | Info | **Mint permitido.** El programa asume un SPL Token sin comisión de transferencia ni hooks (USDC clásico). Con Token-2022 y transfer fee, la vault recibiría menos que `amount` y los pagos fallarían. No se valida al inicializar. | Aceptado: el mint lo fija el admin una sola vez. Antes de mainnet: rechazar mints con esas extensiones. |
| H-8 | Info | **Cuenta del comprador cerrada.** `refund_unshipped` paga a una cuenta de token del comprador; si cerró su ATA, el crank no puede reembolsar hasta que la vuelva a crear. | Aceptado: el comprador vuelve a crear su cuenta de USDC (por ejemplo, recibiendo cualquier monto) y el reembolso pasa. Mejora posible: que el builder de `refund_unshipped` agregue `CreateIdempotent` de la ATA del comprador. |
| H-9 | Info | **Upgrade authority.** Hoy es la keypair del admin: quien la tenga puede reemplazar el programa entero. | Requisito de AGENTS.md para mainnet: wallet separada (idealmente multisig) o programa congelado. |

## 3. Garantías que viven fuera del programa

- **Sponsor (`/api/tx/sponsor`, B-03):** el fee payer solo puede ser `create_order.payer`, `close_order.rent_payer` o quien paga la ATA de USDC del propio usuario; allowlist de instrucciones y tope a la prioridad. Lo cubre `sponsor-validate.test.ts`, y `client.test.ts` pasa cada transacción que arma la web por ese validador.
- **Activación de links (B-04):** la PDA tiene que derivar del vendedor y del `order_id` de la publicación, y la orden on-chain tiene que coincidir en vendedor, monto y `listing_hash`.
- **Datos personales (B-05, B-09):** la dirección solo la ve el vendedor y solo la del comprador real; la evidencia solo la ven las partes y el árbitro, con URLs firmadas de 10 minutos.
