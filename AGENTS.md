# AGENTS.md

Instrucciones para agentes de código que trabajan en Vaultix. El **qué** y el **por qué** del producto están en `README.md`: leelo antes de empezar. Este archivo define el **cómo**.

## Reglas de oro

1. **Los fondos van a ser reales.** Cualquier cambio en `programs/` requiere tests que cubran el camino feliz, los plazos vencidos y los accesos no autorizados. Sin tests en verde, no se mergea.
2. **El MVP es chico a propósito.** No agregues features, dependencias ni abstracciones que no pida la tarea. Si algo falta, anotalo en "Preguntas abiertas" del README en lugar de inventarlo.
3. **No decidas lo que está abierto.** Wallet embebida, RPC, plazos, porcentajes y topes están _a definir_. Usá constantes o variables de entorno con un valor por defecto razonable, y avisá qué elegiste.
4. **On-chain solo lo que mueve o bloquea plata.** Fotos, descripciones y evidencia van off-chain; on-chain, a lo sumo, su hash.
5. **Devnet por defecto.** Todo deploy, script y test apunta a Solana devnet o a un validador local. **Nunca** hagas un deploy a mainnet-beta sin pedido explícito.
6. **Nunca** commitees keypairs (`~/.config/solana/*.json`, `target/deploy/*-keypair.json`), mnemonics, `.env` ni API keys. Agregalos al `.gitignore` desde el primer commit.

## Estructura del repo (propuesta)

```
/
├── README.md               # Producto, arquitectura y reglas de negocio
├── AGENTS.md               # Este archivo
├── Vaultix_Manual_de_Marca.pdf
├── Anchor.toml             # cluster = devnet por defecto
├── programs/
│   └── vaultix_escrow/     # Programa Anchor (Rust)
│       └── src/
│           ├── lib.rs
│           ├── state.rs        # Config, Order, OrderStatus
│           ├── errors.rs
│           ├── events.rs
│           └── instructions/   # una instrucción por archivo
├── tests/                  # Tests de integración (TypeScript, anchor test)
├── scripts/                # Seed de devnet: config, mint de prueba, órdenes demo
├── web/                    # Next.js (App Router) + @solana/web3.js
│   ├── app/
│   │   ├── p/[orderId]/    # Página pública del link de pago (+ OG image)
│   │   ├── sell/           # Crear link
│   │   ├── orders/         # Mis compras y ventas
│   │   └── admin/disputes/ # Panel del árbitro
│   ├── components/
│   ├── lib/                # Cliente del contrato, Supabase, helpers
│   └── styles/tokens.css   # Tokens de marca
└── supabase/               # Migraciones y funciones
```

Si la estructura real difiere, seguí la existente y actualizá esta sección.

## Comandos

```bash
# Setup de devnet
solana config set --url devnet
solana airdrop 2                 # SOL de prueba para fees y deploy
# USDC de devnet: faucet de Circle (faucet.circle.com), red Solana Devnet

# Programa
anchor build
anchor test                      # levanta un validador local y corre tests/
cargo clippy --all-targets -- -D warnings
cargo fmt

# Deploy a devnet (solo devnet)
anchor deploy --provider.cluster devnet

# Web
cd web
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
```

Antes de dar una tarea por terminada, corré `anchor test` y/o `pnpm lint && pnpm typecheck` según lo que hayas tocado. Si cambiaste el programa, regenerá el IDL y los tipos que usa `web/`.

## Programa (Rust + Anchor)

- Anchor en su versión estable actual, fijada en `Anchor.toml` y `Cargo.toml`. SPL Token vía `anchor_spl` (usá `token_interface` para soportar Token y Token-2022).
- **Un solo programa.** Cada venta es una cuenta `Order` (PDA con seeds `["order", seller, order_id]`) con su vault: un ATA del mint cuya authority es la PDA de la orden.
- Config global en una PDA `["config"]`: árbitro, `fee_bps`, tesorería, mint permitido y `max_order_amount`.
- La máquina de estados del README es la fuente de verdad: `Created → Paid → Shipped → Released`, más `Refunded`, `Disputed` y `Resolved`. Ninguna transición fuera de ese diagrama: cada instrucción valida el estado de entrada con `require!`.
- **Validá todas las cuentas con constraints de Anchor:** `seeds` + `bump` (guardá el bump en la cuenta), `has_one = seller` / `has_one = buyer`, `token::mint`, `token::authority`, `address = config.arbiter`. Nunca confíes en una cuenta que no esté restringida.
- Las transferencias desde la vault se firman con las seeds de la PDA (`CpiContext::new_with_signer`). Usá `transfer_checked`.
- Actualizá el estado de la orden **antes** de la CPI de transferencia.
- Aritmética siempre con `checked_add`, `checked_mul`, etc. Comisión en basis points, con un tope (`MAX_FEE_BPS`) como constante.
- Plazos con `Clock::get()?.unix_timestamp`, guardados como `i64`.
- Un evento (`#[event]` + `emit!`) por transición, con el `order` pubkey: el backend indexa estos eventos.
- Errores con `#[error_code]` y mensajes claros (`NotBuyer`, `InvalidStatus`, `DeadlineNotReached`).
- Calculá el espacio de las cuentas con `#[derive(InitSpace)]`. En estados finales, `close_order` cierra la vault y la cuenta y devuelve la renta.
- **Tests obligatorios:** cada transición válida, cada transición inválida (debe fallar), cada plazo vencido (avanzá el reloj en el test), cuentas falsas o de otro mint, firmantes no autorizados, comisión y división en disputas.
- En mainnet, el tope `max_order_amount` es obligatorio y la upgrade authority va en una wallet separada.

## Web (Next.js + TypeScript)

- TypeScript estricto. Nada de `any` sin un comentario que lo justifique.
- Mobile-first: diseñá a 375 px y escalá hacia arriba.
- Las lecturas de cuentas y las transacciones van por `@solana/web3.js` y el cliente tipado del IDL de Anchor, centralizados en `lib/`.
- El cluster y el RPC salen de variables de entorno (`NEXT_PUBLIC_SOLANA_CLUSTER=devnet`, `NEXT_PUBLIC_SOLANA_RPC`). Nunca hardcodees mainnet.
- Mostrá en la UI un aviso visible de "Modo prueba (devnet)" mientras el cluster no sea mainnet-beta.
- Mostrá montos en USDC con su equivalente en pesos como referencia. Nunca uses floats para montos: `bigint` en las unidades mínimas del token (USDC tiene 6 decimales).
- Cada página `/p/[orderId]` genera su imagen Open Graph con foto, producto, monto y el sello "Pago protegido".
- Manejá los estados de una transacción (firmando, enviada, confirmada, fallida) con mensajes claros. Confirmá con commitment `confirmed` y reintentá si el blockhash expira.

## Backend (Supabase)

- Guarda solo datos off-chain: productos, fotos, tracking, evidencia, perfiles y reputación.
- El estado de una orden **siempre** se lee de la cuenta `Order` on-chain o de sus eventos, nunca de una columna que se pueda desincronizar.
- Row Level Security activa en todas las tablas.

## UI y copy

- Usá los tokens de `styles/tokens.css` (sacados del manual de marca). No hardcodees colores.
- Fondo `vault-black`, superficies `graphite`, texto `bone`, acción principal `ion-blue`.
- Colores fijos por estado: Creado `steel`, Pagado `ion-blue`, En bóveda `ultra-violet`, En disputa `plasma`, Liberado `#3DDC97`.
- El gradiente Spectral va solo en fondos de portada o hero, nunca detrás de texto chico ni dentro del logo.
- Copy en **español rioplatense con voseo**, directo y calmo: primero el dato.
- **Prohibido en la UI:** "wallet", "gas", "fee de red", "smart contract", "programa", "seed phrase", "blockchain". Decí "tu cuenta", "la bóveda", "pago protegido".

```css
:root {
  --vault-black: #08090B;
  --graphite: #16191F;
  --steel: #8B93A1;
  --bone: #F2F1EC;
  --deep-teal: #0F3A3C;
  --ion-blue: #2F5BFF;
  --ultra-violet: #8B3DFF;
  --plasma: #FF3E8A;
  --ember: #FF6A1A;
  --released: #3DDC97;
  --spectral: linear-gradient(90deg, #0F3A3C 0%, #2F5BFF 28%, #8B3DFF 52%, #FF3E8A 76%, #FF6A1A 100%);
}
```

## Código y commits

- Código, nombres, comentarios y commits en **inglés**. La UI va en español.
- Commits chicos con [Conventional Commits](https://www.conventionalcommits.org/): `feat(program): add dispute deposit`.
- Una tarea, un cambio enfocado. No mezcles refactors con features.
- Si cambiás una regla de negocio, actualizá también el `README.md`.

## Al terminar una tarea

Reportá en pocas líneas:

1. Qué cambiaste y en qué archivos.
2. Qué tests corriste y su resultado.
3. Qué decisiones tomaste sobre puntos _a definir_.
4. Qué quedó pendiente o qué riesgos ves.
