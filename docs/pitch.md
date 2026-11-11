# Vaultix: pitch

Base para los videos y la presentación, ordenada según los cuatro criterios del jurado: **utilidad**, **experiencia de usuario**, **modelo de negocio** y **tecnología**.

Los números del protocolo salen de la `Config` del contrato en devnet. Si cambian ahí, actualizalos acá. Lo que está entre `[corchetes]` es un dato que conviene completar con una fuente antes de presentarlo.

**En una línea:** un link de pago protegido para comprar y vender por Instagram, WhatsApp o Marketplace. La plata queda en una bóveda hasta que el producto llega.

**El gancho:** "No custodiamos un peso: el código hace de intermediario. El fraude deja de ser negocio."

---

## 1. Utilidad: ¿resuelve un problema real? ¿Para quién?

**El problema.** En la compraventa entre desconocidos, alguien tiene que confiar primero:

- Si el **comprador** paga primero, se arriesga a no recibir nada.
- Si el **vendedor** envía primero, se arriesga a un **comprobante de transferencia falso**, una estafa muy común en Argentina.
- Las salidas de hoy son caras o incómodas: Mercado Libre, con comisiones de `[X%]` en la categoría, o encontrarse en persona, que no sirve a distancia y tiene sus riesgos.

**Para quién.**

- **El vendedor chico de Instagram o WhatsApp:** una marca de ropa, alguien que revende zapatillas o celulares. Vende a desconocidos todos los días y pierde ventas porque el comprador no le cree.
- **El comprador de Marketplace o de grupos:** quiere un producto usado o de una marca chica y no quiere transferir a ciegas.
- **El primer nicho:** productos de valor medio-alto (zapatillas, celulares, consolas, ropa de marca) entre gente que ya usa dólares digitales. Primeros vendedores: una marca de ropa propia y la comunidad tech local.

**Qué cambia con Vaultix.** Nadie tiene que confiar en el otro: los dos confían en las mismas reglas, que se ven antes de pagar y nadie puede cambiar.

- Si el vendedor **no despacha en 5 días**, el comprador recupera el 100%.
- El comprador tiene **7 días desde el despacho** para revisar y reclamar.
- Si nadie hace nada, **el vendedor cobra solo** al vencer el plazo.

---

## 2. Experiencia de usuario: ¿se entiende solo? ¿Da ganas de volver?

**Se entiende solo porque no parece cripto.**

- **Login con email o Google** (también Apple o Phantom). Sin palabras secretas que guardar ni extensiones que instalar.
- **Nunca hace falta SOL:** Vaultix paga las comisiones de red. El usuario solo ve dólares digitales (USDC).
- **Sin jerga:** la interfaz nunca dice "wallet", "gas" ni "smart contract". Habla como alguien que vende por Instagram: "Tu plata está en bóveda", "Despachá antes del lunes 17".
- **Las reglas antes de pagar:** plazos, comisión y qué pasa si hay un problema, en el mismo link.
- **El link se ve confiable donde se comparte:** en WhatsApp aparece con foto, precio y el sello "Pago protegido".
- **Siempre sabés dónde está la plata:** en la landing, un recorrido paso a paso con la plata en el comprador, en la bóveda o en el vendedor. En cada pedido, el estado con su ícono y su color.
- **Cada pantalla dice qué te toca hacer:** "Despachá antes del…", "Confirmá que llegó", "Te lo acreditamos solos a partir del…".
- **Se actualiza solo:** el comprador paga y en unos segundos el vendedor ve "Te pagaron", sin recargar.

**Da ganas de volver.**

- **Al vendedor, porque vende más:** el link le saca al comprador la duda de "¿y si no me lo manda?". Crear otro le lleva un minuto.
- **La reputación se acumula:** cada link muestra las ventas cerradas del vendedor. Cuantas más ventas cierra con Vaultix, más confianza genera el siguiente link.
- **Todo en un lugar:** "Mis operaciones" junta compras y ventas, con el estado de cada una y el próximo paso.
- **Avisos por mail** de cada evento (te pagaron, despachó, abrieron un reclamo), para no tener que entrar a revisar.

---

## 3. Modelo de negocio: ¿cómo se sostiene? ¿Quién paga y por qué?

**Quién paga: el vendedor, 1,5% por operación cerrada.**

- Solo cuando cobra. Si el link se cancela o la plata vuelve al comprador, Vaultix no cobra nada.
- Ejemplo: en una venta de 100 USDC, el vendedor recibe 98,50 y Vaultix 1,50.
- En un reclamo repartido, la comisión se cobra solo sobre la parte del vendedor.

**Por qué el vendedor lo paga.**

- **Vende más:** un comprador que no lo conoce se anima a pagar.
- **Se ahorra estafas:** no hay comprobante falso posible, porque ve la plata en bóveda antes de despachar.
- **Es mucho más barato que la alternativa:** 1,5% frente a `[X%]` de Mercado Libre, sin publicar en otra plataforma ni perder el contacto con su cliente.

**El comprador no paga nada,** salvo que abra un reclamo: deja un **depósito del 5%**, que se le devuelve si el árbitro le da la razón (50% o más). Ese depósito frena los reclamos falsos sin cobrarle al comprador honesto.

**Por qué los números cierran.**

- Una operación en Solana cuesta fracciones de centavo de comisión de red, y Vaultix la paga.
- El SOL que se reserva al abrir cada bóveda **vuelve**: un proceso diario cierra las operaciones terminadas y lo recupera.
- La infraestructura (Vercel, Supabase, Helius, Resend) arranca en planes gratis.
- El costo que más crece es el de atender reclamos: por eso el depósito del 5% y la reputación, para que haya pocos.

**A futuro:** suscripción para vendedores frecuentes (comisión menor y links ilimitados), comisión en la carga de saldo desde otras redes y en el on-ramp integrado.

---

## 4. Tecnología: ¿qué tiene de nuevo por adentro?

**La decisión de la que estamos orgullosos: la plata no la tiene nadie, y las reglas no las puede cambiar nadie.**

Cada link de pago es su **propia bóveda en la blockchain**: una cuenta de Solana que controla solo el programa de Vaultix (un PDA). Ni el vendedor, ni el comprador, ni el equipo tienen la llave. La plata sale únicamente por los caminos que el programa permite: al vendedor cuando se confirma o vence el plazo, al comprador si no se despachó, o repartida por el árbitro en un reclamo.

Tres detalles que hacen que esa promesa sea real:

1. **Las reglas se congelan en cada orden.** Al crear el link, la comisión, el depósito y los plazos se copian dentro de la orden. Aunque mañana cambiemos la configuración (como hicimos al pasar de 10 a 7 días), las reglas que vio el comprador antes de pagar no cambian a mitad de camino.
2. **Lo que se paga es lo que se publicó.** El link guarda en la blockchain un hash del producto (título, descripción, fotos y precio). Si alguien cambia la publicación después, la página lo detecta y no la muestra. El número de seguimiento también queda registrado como hash al despachar.
3. **Nadie puede trabar la plata.** Liberar el pago al vencer el plazo y devolverlo si no se despachó son acciones **abiertas**: las puede ejecutar cualquiera. Lo hace un proceso diario y también un botón en la pantalla. No depende de que Vaultix esté vivo ni de buena voluntad.

**El árbitro tiene poder limitado.** En un reclamo, el árbitro solo puede repartir la plata entre comprador y vendedor. El programa no le deja mandarla a ningún otro lado.

**Cripto sin que se note.**

- **Cuentas embebidas con Privy:** con email o Google, cada usuario tiene su cuenta de Solana sin ver nunca una clave.
- **Transacciones patrocinadas:** el usuario firma y el backend de Vaultix agrega su firma para pagar la comisión de red. Para que nadie abuse de eso, el backend solo firma transacciones del programa de Vaultix, nunca permite que salga plata de su propia cuenta y tiene un límite diario por usuario.
- **Indexado en tiempo real con Helius:** cada transacción del programa llega por webhook, se decodifica y se guarda como evento. De ahí salen "Mis operaciones", la reputación y los mails.

**Por qué Solana.** Comisiones de fracciones de centavo y confirmación en segundos: es lo que permite patrocinar cada transacción y cobrar solo 1,5%. Además, USDC de Circle es nativo en Solana.

**Calidad.** El programa tiene tests de cada instrucción y una revisión de seguridad propia (`specs/program-review.md`). La web tiene 277 tests y CI en cada cambio.

---

## Lo que tiene HOY

Funcionando en Solana devnet, la red de prueba, en **vaultixpay.vercel.app**:

- **Login** con email, Google, Apple o Phantom, y comisiones de red pagadas por Vaultix.
- **El ciclo completo, probado de punta a punta:** crear el link, pagar, despachar con seguimiento, confirmar y cobrar.
- **Plazos automáticos:** reembolso si no despacha y cobro automático diario si nadie reclama.
- **Reclamos con árbitro:** las dos partes suben pruebas y el árbitro reembolsa, libera o reparte.
- **"Mis operaciones":** compras y ventas con su estado, actualizadas en vivo.
- **Cuenta:** saldo, dirección con QR para cargar, retiro a otras apps y el método con el que entraste.
- **Avisos por mail** de cada evento. Hoy llegan solo a la cuenta del equipo, porque falta un dominio propio.
- **Tutorial de carga de saldo** en la landing.

## Roadmap

1. **Plata real (mainnet-beta)**, con tope bajo por operación al principio. Detalle en `docs/mainnet-checklist.md`.
2. **Cargar saldo desde cualquier red** (Stellar, Base, Polygon…): la bóveda sigue en Solana y Vaultix convierte el depósito solo, con el protocolo oficial de Circle (CCTP). Así sirve Lemon o cualquier app.
3. **On-ramp integrado:** comprar USDC con pesos o tarjeta sin salir de Vaultix.
4. **Seguimiento obligatorio y automático** con las APIs de los correos, y **plazo de reclamo de 3 días desde la entrega** en lugar de 7 desde el despacho.
5. **Más confianza:** verificación por teléfono o DNI, reputación visible y bloqueo de compradores con reclamos falsos.
6. **Reclamos descentralizados:** árbitros externos y un plazo máximo de resolución.
7. **Dominio propio:** mails para todos los usuarios y links cortos (`vaultix.app/p/k3n9x`).

El detalle técnico de los puntos 2 y 4 está en la sección Roadmap del `README.md`.

---

## Si el jurado pregunta

- **"¿No custodian nada? ¿Y el árbitro?"** Vaultix no tiene la plata, pero hoy el árbitro de los reclamos es el equipo. El programa solo le deja repartirla entre comprador y vendedor, no llevársela. Descentralizarlo está en el roadmap.
- **"¿Y si el comprador no tiene USDC?"** Lo compra en Bitso u otra app que envíe por la red Solana (hay un tutorial en la landing). El on-ramp integrado y la carga desde cualquier red están en el roadmap.
- **"¿Y si el envío tarda más de 7 días?"** El plazo cubre los envíos dentro del país. Con el seguimiento automático, el plazo va a correr desde la entrega.
- **"¿Y si Vaultix desaparece?"** La plata sigue en las bóvedas, y liberar o reembolsar al vencer los plazos lo puede ejecutar cualquiera. No depende de nosotros.
- **"¿Por qué blockchain y no un PSP?"** Porque la plata no la tiene nadie: la retiene un programa con reglas públicas. Eso baja el riesgo regulatorio y hace que cada operación sea verificable.
- **"¿Tienen usuarios?"** `[Completar con las métricas antes del pitch: links creados, pagados, volumen.]`
