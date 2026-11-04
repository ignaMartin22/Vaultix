# Vaultix

> **Confianza en código.** La plata queda en bóveda hasta que el producto llega.

Vaultix es una web app de **escrow P2P on-chain en Solana** para compraventas por Instagram, Marketplace y WhatsApp. El vendedor crea un link de pago y lo comparte. El comprador paga y los fondos quedan bloqueados en una bóveda on-chain. El vendedor cobra cuando el comprador confirma la recepción, o cuando vence el plazo sin reclamos.

Este README da contexto al agente antes de empezar a desarrollar. Define el producto, la arquitectura, las reglas de negocio y lo que todavía está abierto.

---

## Contexto para el agente

- **Red:** se desarrolla y prueba en **Solana devnet**. Mainnet-beta solo con pedido explícito.
- **Objetivo:** un MVP funcional en **7 días**, con usuarios reales y tracción verificable on-chain.
- **Prioridad:** la simpleza le gana a la completitud. Ante una duda de alcance, elegí la opción más chica que funcione y dejala anotada en [Preguntas abiertas](#preguntas-abiertas).
- **Las decisiones marcadas como _propuesta_ no están cerradas.** No las trates como definitivas sin confirmar.
- **Idioma:** el código, los commits y los comentarios van en inglés. La UI va en **español rioplatense con voseo** ("pagá", "confirmá").
- **Mobile-first:** casi todo el tráfico llega desde el link compartido en WhatsApp o Instagram.
- **Sin jerga cripto en la UI:** nada de "wallet", "gas", "smart contract" ni "seed phrase" frente al usuario.

---

## El problema

En la compraventa entre particulares nadie confía en nadie:

- Si el **comprador** transfiere primero, se arriesga a no recibir nada.
- Si el **vendedor** envía primero, se arriesga a un comprobante de transferencia falso, una estafa muy común en Argentina.
- Hoy las alternativas son Mercado Libre, con comisiones altas, o encontrarse en persona.

## La solución

1. El vendedor crea un **link de pago** con producto, precio y plazos.
2. Lo comparte por WhatsApp o DM. La vista previa muestra la foto, el precio y el sello "Pago protegido".
3. El comprador paga y los fondos quedan **bloqueados en el contrato**. No los custodia la plataforma ni el vendedor.
4. El vendedor despacha y carga el **número de seguimiento**.
5. El comprador confirma, o vence el plazo, y el contrato **libera el pago** al vendedor, menos la comisión.
6. Si hay un problema, se abre una **disputa** con reglas claras (ver abajo).

**Por qué web3:** la plataforma no custodia fondos, lo que reduce el riesgo regulatorio. Además, cada operación es verificable on-chain.

---

## Decisiones clave

| Decisión | Propuesta | Alternativas | Motivo |
| --- | --- | --- | --- |
| Moneda | USDC (SPL), con precios mostrados en pesos | USDT (SPL) | Mucha gente ya tiene USDC/USDT en Lemon o Ripio. En devnet se usa el USDC de prueba de Circle |
| Red | **Solana**: primero **devnet**, mainnet-beta recién después de validar | — | Fees de fracciones de centavo, confirmación en segundos y USDC nativo (SPL) |
| Onboarding | Login con email o Google con wallet embebida para Solana | Privy, Dynamic, Phantom/Solflare para quien ya tenga wallet | El usuario nunca ve una seed phrase |
| Custodia | Ninguna: los fondos viven en la vault de cada orden (PDA) | Custodia en pesos vía PSP | Menos riesgo regulatorio |
| Modelo de negocio | Comisión del **1–2%** por operación cerrada | Suscripción para vendedores frecuentes | Muy por debajo de Mercado Libre |
| Árbitro de disputas | El equipo (dirección admin) en el MVP | Árbitros externos o reputación | Simple para la primera semana |

**Nicho inicial:** productos de valor medio-alto entre gente que ya usa cripto, como zapatillas, celulares, consolas y ropa de marca. Primeros vendedores: una marca de ropa propia y la comunidad tech local.

---

## Arquitectura

```
┌──────────────────────┐      ┌───────────────────────┐
│  Web app (Next.js)   │◄────►│  Backend (Supabase)   │
│  mobile-first        │      │  fotos, descripciones │
│  @solana/web3.js     │      │  tracking, mails,     │
│  wallet embebida     │      │  panel de disputas    │
└──────────┬───────────┘      └───────────┬───────────┘
           │ transacciones                │ lee eventos / cuentas
           ▼                              ▼
┌─────────────────────────────────────────────────────┐
│  Programa vaultix_escrow (Anchor) — Solana devnet   │
│  Config PDA · Order PDA por venta · Vault (ATA)     │
│  estados · plazos · depósito de disputa · comisión  │
└─────────────────────────────────────────────────────┘
```

### Stack

| Capa | Tecnología | Responsabilidad |
| --- | --- | --- |
| Programa | Rust + Anchor | Un programa único; cada venta es una cuenta `Order` (PDA) con su vault de tokens |
| Red | Solana devnet → mainnet-beta | RPC configurable por variable de entorno |
| Frontend | Next.js + `@solana/web3.js` + cliente generado del IDL de Anchor | Crear link, pagar, confirmar, disputar |
| Wallet | Privy o Dynamic con wallets embebidas de Solana (_a definir_); Solana Wallet Adapter para Phantom/Solflare | Login con email o Google |
| Backend | Supabase | Datos off-chain, consulta de tracking, notificaciones, panel admin |
| Link | Open Graph dinámico | Preview en WhatsApp con foto, precio y sello |

### Modelo de cuentas en Solana

| Cuenta | Seeds | Contenido |
| --- | --- | --- |
| `Config` | `["config"]` | Admin/árbitro, `fee_bps`, tesorería, mint permitido, tope por orden |
| `Order` | `["order", seller, order_id]` | Partes, mint, monto, estado, plazos, hash del tracking, depósito de disputa |
| `Vault` | ATA del mint con authority = `Order` PDA | Los fondos bloqueados de esa orden |

Los fondos nunca pasan por una cuenta de la plataforma: van del comprador al vault de la orden, y del vault al vendedor o al comprador según el estado. Al cerrar una orden, el vault se cierra y se recupera la renta.

**Regla:** on-chain va solo lo que mueve o bloquea plata (montos, partes, estados, plazos). Todo lo demás (fotos, descripciones, evidencia de disputas) vive off-chain, con un hash on-chain si hace falta.

### Máquina de estados del programa

```
Created ──(comprador paga)──► Paid ──(vendedor carga tracking)──► Shipped ──(confirma o vence plazo)──► Released
                                │                                    │
                     (sin envío en N días)                  (reclamo + depósito)
                                ▼                                    ▼
                            Refunded                             Disputed ──(árbitro decide)──► Resolved
                                                                                   (reembolso, liberación o división)
```

| Estado | Entra cuando | Sale hacia |
| --- | --- | --- |
| `Created` | El vendedor crea la orden (link) | `Paid` |
| `Paid` | El comprador deposita el monto | `Shipped`, o `Refunded` si vence el plazo de envío |
| `Shipped` | El vendedor carga el tracking | `Released` (confirmación o plazo vencido) o `Disputed` |
| `Disputed` | El comprador reclama dentro del plazo y paga el depósito | `Resolved` |
| `Released` | Se paga al vendedor, menos la comisión | Final |
| `Refunded` | Se devuelve al comprador | Final |
| `Resolved` | El árbitro decide reembolso, liberación o división | Final |

### Instrucciones del programa (borrador)

Son orientativas, para que el agente arranque: nombres y argumentos a validar.

- `initialize_config(fee_bps, arbiter, treasury, allowed_mint, max_order_amount)` — solo el admin, una vez.
- `create_order(order_id, amount, ship_deadline_secs, claim_window_secs)` — el vendedor; crea la cuenta `Order`.
- `pay(order_id)` — el comprador; transfiere `amount` a la vault de la orden → `Paid`.
- `mark_shipped(tracking_hash)` — solo el vendedor → `Shipped`.
- `confirm_receipt()` — solo el comprador → `Released`.
- `release()` — cualquiera (crank), si venció `claim_window` sin disputa → `Released`.
- `refund_unshipped()` — el comprador, si venció `ship_deadline` sin envío → `Refunded`.
- `open_dispute()` — el comprador, dentro de `claim_window`, depositando la garantía → `Disputed`.
- `resolve_dispute(buyer_share_bps)` — solo el árbitro → `Resolved`.
- `close_order()` — cierra la vault y la cuenta en estados finales y devuelve la renta.
- Un evento Anchor (`emit!`) por transición, que el backend indexa.

**Requisitos:** validar cada cuenta con las constraints de Anchor (`has_one`, `seeds`, `bump`, `token::mint`, `token::authority`), aritmética con `checked_*`, plazos con `Clock::get()?.unix_timestamp`, comisión en basis points con tope, y tests para cada transición y cada plazo vencido.

---

## Sistema de disputas

El fraude del comprador no se elimina, pero se vuelve caro y poco rentable. Se combate con tres capas.

### 1. Evidencia del correo

- El vendedor solo puede marcar "enviado" cargando un número de seguimiento real (Andreani, OCA, Correo Argentino). El backend consulta su estado.
- Si el correo indica **"entregado"**, idealmente con firma o DNI, por defecto gana el vendedor.
- Desde la entrega, el comprador tiene **48–72 hs** (_a definir_) para reclamar. Si no lo hace, el pago se libera solo.
- Para ventas de valor alto: retiro en sucursal con DNI o envío con seguro.

### 2. Reglas por tipo de reclamo

Se muestran en el link **antes** de pagar.

| Reclamo | Evidencia exigida | Resolución por defecto |
| --- | --- | --- |
| "No llegó" y el tracking dice entregado | Reclamo presentado ante el correo | Gana el vendedor, salvo que el correo reconozca el error |
| "No llegó" y el tracking no dice entregado | Estado del tracking | Se espera o se reembolsa si el envío se perdió |
| "Llegó roto o distinto" | Video de unboxing del comprador vs. fotos o video del paquete cerrado del vendedor | Decide el árbitro según la evidencia |

### 3. Incentivos

- **Depósito para disputar:** abrir un reclamo cuesta, por ejemplo, un **5%** del valor (_a definir_). Si el comprador gana, se le devuelve. Si pierde, va al vendedor.
- **Reputación:** cada disputa perdida queda asociada a la cuenta. Los vendedores pueden rechazar compradores con mal historial.
- **Verificación de identidad** (mail, teléfono o DNI), para que crear cuentas nuevas no sea gratis.

### Flujo de una disputa

1. El comprador abre el reclamo dentro del plazo y paga el depósito.
2. Ambas partes suben evidencia: tracking, fotos y videos.
3. El árbitro decide: reembolsar, liberar o dividir.
4. El programa ejecuta la decisión y se actualiza la reputación.

---

## Marca

El manual completo está en `Vaultix_Manual_de_Marca.pdf`. Lo esencial para la UI:

**Logo:** la puerta de una bóveda (disco + anillo) atravesada por una V. Desde 32 px se usa con anillo; por debajo, la versión reducida sin anillo. Siempre en un solo color (Bone o Vault Black). Nunca lleva gradiente encima, ni se rota o deforma.

**Colores**

| Token | Hex | Uso |
| --- | --- | --- |
| `vault-black` | `#08090B` | Fondo principal |
| `graphite` | `#16191F` | Superficies y tarjetas |
| `steel` | `#8B93A1` | Texto secundario, bordes |
| `bone` | `#F2F1EC` | Texto principal, logo |
| `deep-teal` | `#0F3A3C` | Inicio del espectro |
| `ion-blue` | `#2F5BFF` | Acción principal, links |
| `ultra-violet` | `#8B3DFF` | Estado: fondos en bóveda |
| `plasma` | `#FF3E8A` | Estado: en disputa |
| `ember` | `#FF6A1A` | Alertas y plazos |

**Gradiente Spectral:** `deep-teal 0% → ion-blue 28% → ultra-violet 52% → plasma 76% → ember 100%`. Va siempre sobre negro, con grano del 5–6%, en bandas que fluyen. Al menos el 60% de la pieza queda en negro.

**Tipografía:** Inter Display (títulos, 600, tracking −4%) e Inter (texto e interfaz). Una mono para hashes, montos y estados. Plus Jakarta Sans es una alternativa para títulos.

**Colores por estado:** Creado → `steel` · Pagado → `ion-blue` · En bóveda → `ultra-violet` · En disputa → `plasma` · Liberado → verde (`#3DDC97`).

**Tono de voz:** directo, rioplatense y calmo. Primero el dato.

- ✓ "Tu plata queda en bóveda hasta que confirmes que llegó."
- ✕ "Los fondos se encuentran custodiados mediante un protocolo de escrow descentralizado."

---

## Plan de 7 días

- [ ] **Día 1:** definir plazos y reglas de disputa. Escribir el programa Anchor y sus tests.
- [ ] **Día 2:** deploy en **devnet**. Login con wallet embebida y flujo de pago con USDC de devnet funcionando.
- [ ] **Día 3:** pantallas del vendedor (crear link) y del comprador (pagar y confirmar), con preview para WhatsApp.
- [ ] **Día 4:** tracking, liberación automática, panel de disputas y notificaciones por mail.
- [ ] **Día 5:** pruebas end-to-end en devnet con 3 o 4 conocidos. Revisión del programa y checklist de mainnet.
- [ ] **Día 6:** deploy en **mainnet-beta** con tope bajo por operación, **solo si devnet quedó estable**. Lanzamiento con vendedores reales (si no, se lanza la demo en devnet).
- [ ] **Día 7:** métricas, video demo y pitch.

## Métricas de tracción

Todas verificables on-chain o desde el backend:

- Links creados
- Links pagados (conversión link → pago)
- Volumen en USD
- Porcentaje de operaciones completadas
- Disputas abiertas y resueltas

---

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Comprador sin stablecoins | Nichos que ya usan cripto; evaluar un on-ramp integrado |
| Disputas falsas ("no me llegó") | Tracking, depósito para disputar y reputación |
| Legal / regulatorio | No custodiar fondos; consulta legal antes de escalar |
| Árbitro centralizado | Aceptable en el MVP; después árbitros externos |
| Bugs en el programa con fondos reales | Todo el desarrollo en devnet, tests exhaustivos y **tope bajo por orden** en mainnet |
| Upgrade authority del programa | En mainnet, guardarla en una wallet aparte (idealmente multisig) |

## Preguntas abiertas

- [ ] ¿Criterio para pasar de devnet a mainnet-beta?
- [ ] ¿USDC solo, o también USDT?
- [ ] ¿Qué proveedor de wallet embebida?
- [ ] ¿Plazos exactos: días para enviar y horas para reclamar tras la entrega?
- [ ] ¿Porcentaje del depósito de disputa y de la comisión?
- [ ] ¿Qué correos tienen API pública de tracking?
- [ ] ¿Tope por orden en mainnet?
- [ ] ¿Qué RPC usar (público de devnet o un proveedor como Helius)?

---

## Pitch

> Vaultix es el "Mercado Pago protegido" para las ventas por Instagram y WhatsApp: el comprador paga, la plata queda trabada en un contrato inteligente y el vendedor cobra recién cuando el producto llega.

**El gancho:** no custodiamos un peso: el código hace de intermediario. Cada venta es verificable y el fraude deja de ser negocio.
