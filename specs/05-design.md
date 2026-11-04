# 05 — Design

Sistema visual y de voz de Vaultix, sacado de `Vaultix_Manual_de_Marca.pdf` (v1.0, noviembre 2026). Si este documento y el manual no coinciden, **manda el manual**: corregí este archivo.

---

## 1. Esencia

> **Confianza en código.** La plata queda en bóveda hasta que el producto llega.

Vaultix es la bóveda entre dos personas que no se conocen. Cuatro atributos guían cada pantalla:

| Atributo | En la UI |
| --- | --- |
| **Seguridad** | Sólida, cerrada, sin fisuras. Fondos oscuros, bordes firmes. |
| **Neutralidad** | No toma partido. En disputas, el mismo tratamiento visual para las dos partes. |
| **Transparencia** | Estados, plazos y comisiones siempre visibles, sin letra chica. |
| **Cercanía** | Habla como quien vende por Instagram, no como un banco. |

## 2. Logo

**Isotipo:** la puerta de una bóveda vista de frente (disco + anillo), atravesada por una V que la parte en tres piezas: las laterales son comprador y vendedor; la cuña central, los fondos trabados.

**Construcción** (grilla de 100 u, para el SVG maestro de `components/Logo.tsx`):

| Elemento | Medida |
| --- | --- |
| Disco | Radio 46u, centro (50, 50) |
| Anillo | Radio 34u, trazo 3,2u |
| Corte V | Trazo 8,5u, vértice en (50, 70), sale del disco por arriba |
| Ángulo | Cada brazo a 58° de la horizontal |

Usá siempre el archivo maestro, nunca lo redibujes a mano. Si no hay SVG maestro en el repo, pedilo y anotalo como pendiente: no lo reconstruyas desde esta tabla sin validación.

**Versiones:**
- Horizontal (por defecto: web, encabezados): isotipo + "vaultix".
- Vertical: formatos cuadrados o angostos, pantallas de carga.
- Isotipo solo: avatar, favicon, sello "Pago protegido".

El logotipo va en **Inter Display SemiBold, minúsculas, tracking −4,5%**. La altura del isotipo es igual a la altura total del logotipo con ascendentes.

**Área de seguridad:** ½x por lado (x = altura del isotipo). Nada entra en esa zona.

**Tamaños mínimos:** logo horizontal de 24 px de alto. **Por debajo de 32 px el isotipo pierde el anillo** (versión reducida): favicon de 16 px y 24 px reducidos.

**Fondos permitidos** (siempre en un solo color):

| Logo | Fondo | Uso |
| --- | --- | --- |
| Bone | Vault Black | Principal |
| Vault Black | Bone | Documentos, fondos claros |
| Bone | Spectral | Campañas, portadas, hero |
| Bone | Ion Blue | Botones, piezas de producto |

**Prohibido:** deformar o estirar, rotar (la V siempre apunta hacia abajo), rellenar con el gradiente, agregar sombras, brillos o efectos, cambiar la tipografía, usarlo sobre fondos sin contraste, modificar el corte, reordenar los elementos.

## 3. Color

Base oscura y neutra, con colores espectrales como luz en dosis chicas. **Proporción guía: 70% base · 20% neutros · 10% espectro.**

| Token | Hex | Uso |
| --- | --- | --- |
| `vault-black` | `#08090B` | Fondo principal |
| `graphite` | `#16191F` | Superficies y tarjetas |
| `steel` | `#8B93A1` | Texto secundario, líneas, bordes |
| `bone` | `#F2F1EC` | Texto principal, logo |
| `deep-teal` | `#0F3A3C` | Inicio del espectro |
| `ion-blue` | `#2F5BFF` | Acción principal, links |
| `ultra-violet` | `#8B3DFF` | Estado: fondos en bóveda |
| `plasma` | `#FF3E8A` | Estado: en disputa |
| `ember` | `#FF6A1A` | Alertas y plazos |
| `released` | `#3DDC97` | Estado: liberado (definido en README/AGENTS; no está en el manual) |

### `web/styles/tokens.css`

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

En `globals.css`, Tailwind v4 los expone con `@theme { --color-vault-black: var(--vault-black); … }`. Los componentes solo usan clases de tokens.

### Colores por estado

| Estado | Etiqueta | Token |
| --- | --- | --- |
| `Created` | Creado | `steel` |
| `Paid` | En bóveda | `ultra-violet` |
| `Shipped` | Enviado | `ion-blue` |
| `Disputed` | En disputa | `plasma` |
| `Released` | Liberado | `released` |
| `Refunded` | Reembolsado | `steel` |
| `Resolved` | Resuelto | `steel` |

El badge de estado va en mono, en mayúsculas, con el color del estado sobre `graphite` ("ESTADO: ENVIADO").

## 4. Gradiente Spectral

"La luz que se escapa de la bóveda." Recorre la paleta de punta a punta: **Deep Teal 0% → Ion Blue 28% → Ultra Violet 52% → Plasma 76% → Ember 100%**.

| Regla | Detalle |
| --- | --- |
| Base | Siempre sobre Vault Black |
| Forma | Bandas suaves que fluyen en diagonal. Nunca círculos ni manchas sueltas |
| Grano | Ruido monocromático del 5–6% sobre todo el gradiente |
| Espacio | Al menos el 60% de la pieza queda en negro: la luz es escasa |
| No | Sobre fondos claros, detrás de texto chico ni dentro del logo |

Variantes del manual: **Barrido** (portadas), **Onda** (producto) y **Arco** (redes). En la web: Barrido u Onda en el hero de `/` y en la banda de la OG image. **En ningún otro lugar.**

### 4.1 `SpectralHero` con vgpu

- `components/SpectralHero.tsx`, client component cargado con `next/dynamic` (`ssr: false`).
- Shader WGSL (`components/spectral.wgsl`) con un efecto fullscreen de vgpu (`init` → `surface(gpu, canvas, { dpr: [1, 2] })` → `effect` → `frameLoop`). Uniforms: `time`, `resolution` y los 5 colores del espectro.
- Produce bandas diagonales en movimiento lento, máscara para que ≥ 60% quede en `vault-black` y grano monocromático de 5–6% (hash por píxel y frame).
- `prefers-reduced-motion`: un solo frame estático.
- **Fallback:** si `navigator.gpu` no existe o `init()` falla, `div` con `var(--spectral)` en bandas diagonales (`linear-gradient` a ~115° con máscara) + PNG de grano (`public/grain.png`) en `mix-blend-mode: overlay`, opacidad 0,06.
- Nunca bloquea el render ni el pago: el texto del hero se ve antes de que cargue el shader.
- Antes de escribirlo, consultá la doc vigente de vgpu (`npx vgpu docs` o `vgpu.sh/agents.md`) y validá el shader con `npx vgpu check`. Si el import de `.wgsl` requiere un plugin del bundler en Next.js, configuralo o cargá el WGSL como string.

## 5. Tipografía

| Rol | Familia | Peso | Ejemplo |
| --- | --- | --- | --- |
| Display | Inter Display (si no está, Inter con tracking −4%) | 600 | "Pagá protegido" |
| Título | Inter Display / Inter | 600 | "Fondos en bóveda" |
| Subtítulo | Inter | 500 | "El vendedor ya cargó el envío" |
| Cuerpo | Inter | 400 | "Tenés 72 horas para confirmar o reclamar." |
| Etiqueta / datos | JetBrains Mono | 400–500 | "ESTADO: ENVIADO", "USDC 120.00", "0x8F3a…c41E" |

- Mono para hashes, montos, estados y etiquetas técnicas.
- Plus Jakarta Sans es una alternativa válida para títulos, pero se usa **una sola familia por pieza**. En la web: Inter.
- Escala mobile (375 px): display 40/44, título 24/30, subtítulo 18/24, cuerpo 16/24, etiqueta 12/16 en mayúsculas con tracking +4%.

## 6. Tono de voz

**Claro como un contrato, cercano como un amigo.**

| Principio | Regla |
| --- | --- |
| Directo | Frases cortas. Primero el dato. |
| Rioplatense | Voseo siempre: "pagá", "confirmá", "despachá". |
| Sin jerga | Nada de jerga cripto en la interfaz. |
| Calmo | En disputas, neutral y con próximos pasos. |

| Decimos | No decimos |
| --- | --- |
| Tu plata queda en bóveda hasta que confirmes que llegó. | Los fondos se encuentran custodiados mediante un protocolo de escrow descentralizado. |
| El vendedor ya despachó. Seguimiento: AND-48213. | ¡¡Tu pedido está en camino!! |
| Abriste un reclamo. Ahora ambos suben evidencia. | Lamentamos los inconvenientes ocasionados. |

### Vocabulario de la UI

| Prohibido | Se dice |
| --- | --- |
| wallet, billetera | tu cuenta |
| smart contract, contrato inteligente, programa | la bóveda |
| escrow | pago protegido |
| gas, fee de red | (no se menciona: lo pagamos nosotros) |
| seed phrase | (no existe para el usuario) |
| blockchain, on-chain | (no se menciona; como mucho, "verificable") |
| transacción | operación / pago |
| token, SPL | USDC |

## 7. Elementos gráficos

- **Sello "Pago protegido":** isotipo + "Pago protegido" + línea mono "FONDOS EN BÓVEDA". Acompaña cada link (página `/p` y OG image).
- **Badges de estado:** ver §3.
- **Recorte V:** la V del isotipo como máscara de fotos o gradientes, solo en piezas de campaña (no en la app del MVP).
- **Grilla wireframe:** líneas finas en perspectiva, en un solo color espectral. Opcional como fondo sutil del hero; nunca detrás de formularios.

## 8. Componentes base

| Componente | Spec |
| --- | --- |
| Fondo de página | `vault-black` |
| Card | `graphite`, borde 1 px `steel` al 20%, radio 16 px, padding 16 px |
| Botón primario | `ion-blue`, texto `bone` 16/500, alto 48 px, radio 12 px, ancho completo en mobile |
| Botón secundario | Transparente, borde `steel`, texto `bone` |
| Botón destructivo (disputa) | Borde `plasma`, texto `plasma` |
| Input | Fondo `graphite`, borde `steel` al 40%, foco `ion-blue` |
| Monto | Mono, `bone`, "USDC 180.00"; línea ARS en `steel` |
| Plazo cercano | Texto `ember` |
| Banner devnet | Barra fija arriba, fondo `ember` al 15%, texto `ember`: "Modo prueba (devnet): la plata no es real." |
| Sheet (modal mobile) | Desde abajo, `graphite`, radio superior 20 px |

## 9. Referencias del manual

- **Vista previa de WhatsApp:** logo, sello "PAGO PROTEGIDO", foto, "Jordan 4 Retro · T42", "USDC 180.00", "Pagá protegido con Vaultix", URL del link.
- **Pantalla de pedido:** encabezado "PEDIDO #K3N9X" + badge "EN BÓVEDA", titular "Tu plata está en bóveda.", plazo del vendedor, producto, vendedor (@handle), total y "Ver seguimiento". Es la referencia visual de `/p/[orderId]` en estado `Paid`.
